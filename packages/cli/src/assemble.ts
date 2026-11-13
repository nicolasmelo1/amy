import path from "node:path";
import { HARNESS_COLLECTION, NamedHarness, Rung } from "@amykit/agent-kit";
import { Budget, CommandRunner, Conversation, Engine, EventLog, Harness, Mounted, Plugin, WorkflowPlugin, mount, unmetNeeds } from "@amykit/core";
import { AmyConfig } from "./config.js";
import { isFilesystemWorkflow, LoadResult } from "./loader.js";
import { profilePaths } from "./paths.js";
import { Profile } from "./profiles.js";
import { composeProject, composedPluginName, projectSpecs, ProjectPhase, resolvePhases } from "./project.js";
import { hostPaths, pluginList, pluginSlices } from "./slices.js";

/** What assembling needs from the process running it, and nothing it decides. */
export interface AssemblyServices {
  readonly runner: CommandRunner;
  readonly load: (specs: readonly string[]) => Promise<LoadResult>;
  /** The event log for one file, which is the budget ledger of that profile. */
  readonly log: (file: string) => EventLog;
  /** The host's own glue, mounted after everything the config asked for. */
  readonly host: readonly Plugin[];
  readonly readOnly?: boolean;
}

export type Assembled = { ok: true; engine: Engine; mounted: Mounted; workflowPlugin?: Plugin } | { ok: false; problems: string[] };

/**
 * Loads the plugins the config asks for and assembles them.
 *
 * Every refusal happens here, by name, before a ticket is touched: a plugin
 * that will not import, a setting that is not one it has, two plugins
 * claiming the same port, an action the workflow emits that nothing can run.
 *
 * A project assembles its one workflow out of the phases its folders export:
 * the phases are called and never mounted on their own, and the composed
 * workflow takes the configured folder's place in the mount order, so the
 * consumers that capture a workflow's terminal states still follow it.
 */
export async function assembleProfile(
  home: string,
  config: AmyConfig,
  profile: Profile,
  services: AssemblyServices,
): Promise<Assembled> {
  const place = profilePaths(home, profile);
  const specs = pluginList(config, profile);

  if (!profile.project) {
    const loaded = await services.load(specs);
    if (loaded.problems.length > 0) return { ok: false, problems: loaded.problems };
    return await assemble(
      [...loaded.plugins, ...services.host],
      pluginSlices(config, profile, home, new Map([[profile.workflow, loaded.bySpec.get(profile.workflow)?.name ?? profile.workflow]])),
      config, place, profile, services, undefined,
    );
  }

  const loaded = await services.load(unique([...specs, ...projectSpecs(profile.project.root)]));
  if (loaded.problems.length > 0) return { ok: false, problems: loaded.problems };
  const prepared = await walkOf(config, profile, home, loaded, specs);
  if (prepared.ok === false) return { ok: false, problems: [...prepared.problems] };
  return await assemble(
    [...prepared.plugins, ...services.host],
    prepared.slices,
    config, place, profile, services,
    { workflowLabel: `the project at ${profile.project.root}`, workflowPlugin: prepared.plugin },
  );
}

async function assemble(
  plugins: readonly Plugin[],
  slices: Record<string, unknown>,
  config: AmyConfig,
  place: ReturnType<typeof profilePaths>,
  profile: Profile | undefined,
  services: AssemblyServices,
  requirements: { readonly workflowLabel: string; readonly workflowPlugin: Plugin } | undefined,
): Promise<Assembled> {
  const outcome = await mount(plugins, slices, {
    runner: services.runner,
    now: () => new Date(),
    log: services.log(place.log),
    paths: hostPaths(place.base, profile),
    readOnly: services.readOnly,
  }, requirements);

  if (!outcome.ok) return { ok: false, problems: outcome.problems };

  const { mounted } = outcome;
  if (!mounted.engine) {
    return { ok: false, problems: ["no plugin mounted an engine, so nothing can advance work"] };
  }
  if (!mounted.workflow) {
    return { ok: false, problems: ["no plugin mounted a workflow, so there is no order to follow"] };
  }

  const unmet = unmetNeeds(mounted, mounted.workflow);
  if (unmet.length > 0) return { ok: false, problems: unmet };

  return { ok: true, engine: mounted.engine, mounted, ...(requirements ? { workflowPlugin: requirements.workflowPlugin } : {}) };
}

/** What the chat needs of a mount: where it is held, and the harnesses that answer in it. */
export interface ChatParts {
  readonly conversation?: Conversation;
  /** By the name `/harness` takes: `claude`, `claude:opus`. */
  readonly harnesses: ReadonlyMap<string, Harness>;
  /** The same names' rungs, which say what model each runs and whether it prices its own runs. */
  readonly rungs: ReadonlyMap<string, Rung>;
  /** The agents' budget, when the mount has one: the chat is charged to it only under chat.budget. */
  readonly budget?: Budget;
}

/**
 * The mounted harnesses whose plugins say where their own skills are, by the
 * plugin's harness name: what `harnessSkills` may link from. Every one that
 * mounted, before anything the chat leaves out for its budget.
 */
export function linkableHarnesses(parts: ChatParts): { name: string; skills: string }[] {
  const linkable = new Map<string, string>();
  for (const [key, rung] of parts.rungs) {
    const skills = parts.harnesses.get(key)?.skillsDirectory;
    if (skills && !linkable.has(rung.harness)) linkable.set(rung.harness, skills);
  }
  return [...linkable].map(([name, skills]) => ({ name, skills }));
}

/** The chat's parts of a mount that came up. */
export function chatPartsOf(mounted: Mounted): ChatParts {
  const conversation = mounted.ports.get("conversation") as Conversation | undefined;
  const contributed = mounted.contributions.get(HARNESS_COLLECTION) ?? new Map<string, object>();
  const rungs = new Map([...contributed].map(([name, rung]) => [name, rung as NamedHarness]));
  const harnesses = new Map([...rungs].map(([name, rung]) => [name, rung.cli]));
  const budget = mounted.ports.get("budget") as Budget | undefined;
  return { ...(conversation ? { conversation } : {}), harnesses, rungs, ...(budget ? { budget } : {}) };
}

/**
 * The chat's parts when the workflow does not mount (S29): every configured
 * plugin but the workflow, loaded one by one so one that will not import
 * costs only itself, mounted together, and failing that grown into the
 * largest group that still mounts and can answer.
 * The chat outlives a broken mount because it never needed the workflow.
 */
export async function assembleChat(
  home: string,
  config: AmyConfig,
  profile: Profile,
  services: AssemblyServices,
): Promise<ChatParts> {
  const place = profilePaths(home, profile);
  const plugins: Plugin[] = [];
  for (const spec of pluginList(config, profile).filter((one) => keyOf(one) !== keyOf(profile.workflow))) {
    const loaded = await services.load([spec]).catch(() => undefined);
    if (loaded && loaded.problems.length === 0) plugins.push(...loaded.plugins.filter((plugin) => !(plugin as WorkflowPlugin).workflow));
  }
  let slices: Record<string, unknown>;
  try {
    slices = pluginSlices(config, profile, home, new Map([[profile.workflow, profile.workflow]]));
  } catch {
    return { harnesses: new Map(), rungs: new Map() };
  }
  const host = { runner: services.runner, now: () => new Date(), log: services.log(place.log), paths: hostPaths(place.base, profile), readOnly: services.readOnly };
  const together = await mount(plugins, slices, host).catch(() => undefined);
  if (together?.ok) return chatPartsOf(together.mounted);
  return await recoverChatParts(plugins, slices, host);
}

/**
 * Grows one recovery group a plugin at a time, in config order, keeping a
 * plugin only when the group still mounts with it and it brings no
 * conversation that cannot hold the chat. A thread-only adapter would take
 * the conversation port and leave the chat with nowhere to answer, so it
 * stays out and a later adapter that can answer gets the port instead.
 *
 * Passes repeat until nothing more joins, so a plugin that needs one written
 * after it still gets in on a later pass: at most n passes of n mounts, and
 * never every subset of the config.
 */
export async function recoverChatParts(plugins: readonly Plugin[], slices: Record<string, unknown>, host: Parameters<typeof mount>[2]): Promise<ChatParts> {
  let group: readonly Plugin[] = [];
  let parts: ChatParts = { harnesses: new Map(), rungs: new Map() };
  let pending: readonly Plugin[] = plugins;
  for (let grew = true; grew && pending.length > 0;) {
    grew = false;
    for (const plugin of pending) {
      const tried = await mount([...group, plugin], slices, host).catch(() => undefined);
      if (!tried?.ok) continue;
      const candidate = chatPartsOf(tried.mounted);
      if (candidate.conversation && !holdsTheChat(candidate.conversation)) continue;
      group = [...group, plugin];
      parts = candidate;
      grew = true;
    }
    pending = pending.filter((plugin) => !group.includes(plugin));
  }
  return parts;
}

/** Whether a conversation can read the chat and answer in it. */
function holdsTheChat(conversation: Conversation): boolean {
  return conversation.chat !== undefined && conversation.say !== undefined && conversation.settle !== undefined;
}

/**
 * The project's walk: the phases it drives, the one workflow that walks them,
 * and the slices the machine hands the plugins — computed against the composed
 * name, so the phases' settings ride the calls that run them.
 */
async function walkOf(
  config: AmyConfig,
  profile: Profile,
  home: string,
  loaded: LoadResult,
  specs: readonly string[],
): Promise<{ ok: true; plugin: Plugin; plugins: readonly Plugin[]; slices: Record<string, unknown> } | { ok: false; problems: readonly string[] }> {
  const project = profile.project!;
  const loadedByKey = new Map([...loaded.bySpec].map(([spec, plugin]) => [keyOf(spec), plugin]));
  const anchor = loadedByKey.get(keyOf(profile.workflow));
  if (!anchor) return { ok: false, problems: [`${project.phase}/: configured workflow plugin is not mounted`] };
  const anchorPlugin = anchor as WorkflowPlugin;
  if (!anchorPlugin.workflow) return { ok: false, problems: [declaredWorkflowProblem(project.phase)] };

  const resolved = resolvePhases(project.root, anchorPlugin.phases);
  if (resolved.problems.length > 0) return { ok: false, problems: resolved.problems };

  const walking: ProjectPhase[] = [];
  for (const { phase, spec } of resolved.walking) {
    const plugin = loadedByKey.get(keyOf(spec)) as WorkflowPlugin | undefined;
    if (!plugin || !plugin.workflow) return { ok: false, problems: [declaredWorkflowProblem(phase)] };
    walking.push({ phase, plugin, name: plugin.name });
  }

  const name = composedPluginName(profile);
  const slices = pluginSlices(
    config, profile, home,
    new Map([[profile.workflow, name]]),
    { name, callees: walking.map((one) => one.name) },
  );
  const composed = composeProject({
    profile,
    slices,
    phases: walking,
    absent: resolved.absent,
    root: project.root,
  });
  if (composed.problems.length > 0) return { ok: false, problems: composed.problems };

  return { ok: true, plugin: composed.plugin, plugins: mountListFor(loaded, specs, composed.plugin, profile), slices };
}

/** The plugins that mount: the config's, with the composed workflow in the configured phase's slot. */
function mountListFor(
  loaded: LoadResult,
  specs: readonly string[],
  composed: Plugin,
  profile: Profile,
): readonly Plugin[] {
  const phases = new Set(projectSpecs(profile.project!.root).map((spec) => keyOf(spec)));
  const list: Plugin[] = [];
  const seen = new Set<string>();
  for (const spec of unique(specs)) {
    const key = keyOf(spec);
    if (phases.has(key)) {
      if (!seen.has(key) && key === keyOf(profile.workflow)) {
        seen.add(key);
        list.push(composed);
      }
      continue;
    }
    const plugin = loaded.bySpec.get(spec);
    if (plugin && !seen.has(key)) {
      seen.add(key);
      list.push(plugin);
    }
  }
  if (!list.includes(composed)) list.push(composed);
  return list;
}

/** The project's phases are called, and a call needs the declaration a mount does not. */
function declaredWorkflowProblem(phase: string): string {
  return `\`${phase}/\` exports no workflow declared with \`defineWorkflow\`: a project's walk calls its phases, and a call needs the workflow's declaration`;
}

/** Deduplicates specs that name one folder: a configured spelling and the phase's own are the same folder. */
function unique(specs: readonly string[]): readonly string[] {
  const seen = new Set<string>();
  for (const spec of specs) seen.add(keyOf(spec));
  const kept = new Map<string, string>();
  for (const spec of specs) {
    const key = keyOf(spec);
    if (!kept.has(key)) kept.set(key, spec);
  }
  return [...kept.values()];
}

/** One spec's identity: the folder it resolves to, or the package spelled as it was. */
function keyOf(spec: string): string {
  return isFilesystemWorkflow(spec) ? path.resolve(spec) : spec;
}