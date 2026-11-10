import fs from "node:fs";
import {
  Check,
  CommandOutput,
  CommandRunner,
  ConfigSchema,
  Plugin,
  PluginContext,
  WORKFLOW_RUNTIME,
  WorkflowRuntime,
  definePlugin,
} from "@amykit/core";
import { FileEventLog } from "@amykit/plugin-file-log";
import { assembleProfile } from "./assemble.js";
import { importPluginBySpec, whatMountingSays, whatPackageIs } from "./add.js";
import {
  AmyConfig,
  DEFAULT_CONFIG,
  loadConfig,
  writeAgentLadder,
  writeDefaultWorkflow,
  writeExtraPlugins,
  writePluginSlice,
  writeWorkflowProfile,
} from "./config.js";
import { harnesses } from "./harnesses.js";
import { load, pluginsRootResolver } from "./loader.js";
import { paths } from "./paths.js";
import { Profile, profiles } from "./profiles.js";
import { installIntoPluginsRoot } from "./install.js";
import { Contribution, gather, runSetup as runPluginSetups, writeFiles } from "./plugin-commands.js";
import { CheckFinding, Checks, Catalog, ChannelChoice, ConfigFile, Harnesses, Installer, Result, WorkflowChoice } from "@amykit/workflow-setup";

/** The one profile the walk itself lives in, whatever else the machine drives. */
export const SETUP_PROFILE = "setup";

/** The workflow package that walks a machine from nothing to configured. */
export const SETUP_WORKFLOW = "@amykit/workflow-setup";

/**
 * The plugins a machine with nothing installed still has to mount for the
 * walk to run: the queue and store that keep its record, the engine that
 * moves it, the notifier the engine announces through, and the terminal the
 * person answers in. All five ship as the command's own dependencies (S14:
 * that is where they ship from), so a fresh machine mounts them without
 * installing anything first.
 */
const SETUP_PLUGINS: readonly string[] = [
  "@amykit/plugin-file-queue",
  "@amykit/plugin-file-store",
  "@amykit/plugin-notify-fanout",
  // The workflow itself, as every recommended list carries it: a profile's
  // explicit plugins are all it mounts, the engine among them deferred to
  // what registers after it.
  "@amykit/workflow-setup",
  "@amykit/plugin-serial-engine",
  "@amykit/plugin-terminal-conversation",
];

/** What each harness the ask offers mounts, by its name. */
const HARNESS_PLUGINS: Readonly<Record<string, string>> = {
  claude: "@amykit/plugin-claude",
  codex: "@amykit/plugin-codex",
  hermes: "@amykit/plugin-hermes-agent",
};

/**
 * The workflows the host offers to drive, as the ask reads them.
 *
 * A static table like the harnesses one: what a fresh install knows how to
 * name is what this repository ships, and a workflow that arrived some other
 * way is in the config already, which is what `current` says.
 */
const WORKFLOW_CATALOG: readonly { name: string; plugin: string }[] = [
  { name: "errand", plugin: "@amykit/workflow-errand" },
  { name: "note-to-plan", plugin: "@amykit/workflow-note-to-plan" },
  { name: "ticket-to-qa", plugin: "@amykit/workflow-ticket-to-qa" },
  { name: "feature-grooming", plugin: "@amykit/workflow-feature-grooming" },
];

/**
 * The channels the ask offers, grouped by kind in the answer labels.
 *
 * Only the conversation and notifier plugins the catalog knows: the ask lists
 * what a machine can reach a person through, and a channel nobody here ships
 * is one the person names by package with `amy add` instead. Exported for the
 * tests that script the conversation with the labels this list spells.
 */
export const CHANNEL_CATALOG: readonly ChannelChoice[] = [
  { name: "slack", plugin: "@amykit/plugin-slack", kind: "conversation" },
  { name: "telegram", plugin: "@amykit/plugin-telegram", kind: "conversation" },
  { name: "notify-fanout", plugin: "@amykit/plugin-notify-fanout", kind: "notifier" },
  { name: "notify-hermes", plugin: "@amykit/plugin-notify-hermes", kind: "notifier" },
  { name: "notify-inbox", plugin: "@amykit/plugin-notify-inbox", kind: "notifier" },
];

/**
 * Every answer a flag can give before its ask is asked.
 *
 * The spellings are the ones the stopped walk prints: `--harness codex`,
 * `--workflow errand`, `--workflow none`, `--channels slack,telegram`, and one
 * `--<plugin>.<field> <value>` per setting, all inside the shared accepted
 * set — a string, a number, a boolean, or a comma-separated string[].
 */
export interface SetupFlags {
  readonly plugin?: string;
  readonly harness?: string;
  readonly workflow?: string;
  readonly channels?: readonly string[];
  readonly settings: Readonly<Record<string, Readonly<Record<string, unknown>>>>;
}

/**
 * The setting flags nobody declared, spelled by the walk's own convention.
 *
 * `--<plugin>.<field> <value>` answers one setting of one plugin: the name is
 * the plugin's short name (slack, telegram), because that is the name the
 * channels ask offered, and the value parses to the field's type when the
 * plugin's schema is read.
 */
export function parseSetupFlags(argv: readonly string[]): SetupFlags {
  const flags: {
    plugin?: string;
    harness?: string;
    workflow?: string;
    channels?: string[];
    settings: Record<string, Record<string, unknown>>;
  } = { settings: {} };

  for (let at = 0; at < argv.length; at += 1) {
    const arg = argv[at]!;
    if (!arg.startsWith("--")) continue;
    const equals = arg.indexOf("=");
    const name = (equals === -1 ? arg.slice(2) : arg.slice(2, equals)).split(".");
    if (name.length !== 2 || !name[0]! || !name[1]!) continue;
    const value = equals === -1 ? argv[at + 1] : arg.slice(equals + 1);
    if (value === undefined) continue;
    if (equals === -1) at += 1;
    (flags.settings[name[0]!] ??= {})[name[1]!] = value;
  }

  return flags;
}

/** The first line of what anything said, because that is the line worth reading. */
function firstLine(error: unknown): string {
  const text = error instanceof Error ? error.message : String(error);
  return text.split("\n").find((line) => line.trim().length > 0) ?? text;
}

/**
 * Resolves the word a person typed to the package it names.
 *
 * The ask offered short names — slack, telegram, claude — so the same words
 * are what `amy setup <plugin>` takes; a word that names nothing the host
 * offers is passed through, so a package spec typed in full works too.
 */
export function resolveSetupPlugin(word: string): string {
  const channel = CHANNEL_CATALOG.find((choice) => choice.name === word);
  if (channel) return channel.plugin;
  const harness = HARNESS_PLUGINS[word];
  if (harness) return harness;
  const workflow = WORKFLOW_CATALOG.find((choice) => choice.name === word);
  if (workflow) return workflow.plugin;
  return word;
}

/**
 * The host glue the walk reaches the machine through.
 *
 * One plugin, mounted after everything the config asked for, that registers
 * the five ports the setup workflow declares: the harnesses it can detect,
 * what it offers to choose from, how it installs, how it reads and writes
 * config.yaml, and how it runs a plugin's setup and checks. The conversation
 * comes from the terminal plugin the profile mounts, not from here.
 */
export function setupHost(home: string, runner: CommandRunner, out: (line: string) => void): { plugin: Plugin; runtime: () => WorkflowRuntime } {
  let context: PluginContext | undefined;

  const plugin = definePlugin({
    name: "setup-host",
    configSchema: {},
    register(registry, ctx) {
      context = ctx;
      const installer = installerPort(home, runner);
      const config = configPort(home);
      const checks = checksPort(home, runner, out);
      registry.port("harnesses", harnessesPort());
      registry.port("catalog", catalogPort(home));
      registry.port("installer", installer);
      registry.port("config", config);
      registry.port("checks", checks);

      // The walk's actions, catalogued so the mount knows what each one
      // reaches: the budget and the tracker check read this table. None
      // spends an agent and none writes to a tracker; every spec names the
      // port it dispatches to, as the core names its own. The two that reach
      // the person wait for a conversation, because a mount with none never
      // runs them — the walk stops on its first ask.
      const say = (name: string, port: string, method: string, impl: object) => registry.action(name, { port, method }, impl);
      say("read-config", "config", "read", config);
      say("write-setup-profile", "config", "writeSetupProfile", config);
      say("write-ladder", "config", "writeLadder", config);
      say("write-workflow", "config", "writeWorkflow", config);
      say("write-settings", "config", "writeSettings", config);
      say("install", "installer", "install", installer);
      say("setup", "checks", "setup", checks);
      say("ping", "checks", "check", checks);
      say("check", "checks", "check", checks);
      // The stopped ask is bookkeeping the record keeps: its home is the
      // store, which every mount of this walk has.
      const store = ctx.port("store");
      if (store) say("pending", "store", "save", store);
      const conversation = ctx.port("conversation");
      if (conversation) {
        say("post", "conversation", "post", conversation);
        say("ask-setting", "conversation", "post", conversation);
      }
    },
  });

  return {
    plugin,
    runtime: () => {
      const workflow = context?.workflow();
      const contributed = context?.contributions(WORKFLOW_RUNTIME);
      const runtime = workflow ? contributed?.get(workflow.name) : undefined;
      if (!runtime) throw new Error("the setup workflow contributed no runtime, so nothing can run its walk");
      return runtime as WorkflowRuntime;
    },
  };
}

function harnessesPort(): Harnesses {
  return {
    // The whole listing with the ones detected here marked, so the ask can
    // offer every harness with the detected ones first (S18).
    all: async () =>
      harnesses().map((harness) => ({
        name: harness.name,
        plugin: HARNESS_PLUGINS[harness.name] ?? `@amykit/plugin-${harness.name}`,
        detected: fs.existsSync(harness.marker),
      })),
  };
}

function catalogPort(home: string): Catalog {
  const config = () => loadConfig(home);
  return {
    // The ones the machine already drives come first, marked current, so a
    // machine that chose once is offered its own choice first. A config.yaml
    // that cannot be read is not an empty machine (S29): the catalog answers
    // with what it knows without the file, leaving the walk's read-config
    // step to stop on it naming the file — a broken file must not hide
    // behind a listing that throws.
    workflows: async (): Promise<readonly WorkflowChoice[]> => {
      const read = (() => {
        try {
          return config();
        } catch {
          return DEFAULT_CONFIG;
        }
      })();
      const driven = (Object.entries(read.workflows) as [string, { workflow: string }][])
        .filter(([name]) => name !== SETUP_PROFILE)
        .map(([name, entry]) => ({ name, plugin: entry.workflow, current: true }));
      const known = WORKFLOW_CATALOG.filter((choice) => !read.workflows[choice.name])
        .map((choice) => ({ ...choice, current: false }));
      return [...driven, ...known];
    },
    channels: async () => CHANNEL_CATALOG,
  };
}

function installerPort(home: string, runner: CommandRunner): Installer {
  return {
    install: async (spec: string): Promise<Result<void>> => {
      try {
        const config = loadConfig(home);
        const place = paths(home);

        // The walk installs through `amy add`'s path (the plan's
        // install-and-update cross): resolve the spec to the name it
        // imports as, and mount what the config should name. A plugin
        // joins the machine-wide list; a workflow is named by the profile
        // and a harness by the ladder the walk writes — or the boot would
        // read one package mounted twice.
        const picked = whatPackageIs(spec, process.cwd(), place.plugins);
        const declared = Object.values(config.workflows).map((entry) => entry.workflow);
        if ([...config.extraPlugins, ...declared].includes(picked.imported)) {
          return { ok: true, value: undefined };
        }

        const outcome = await installIntoPluginsRoot(runner, place.plugins, [spec]);
        if (!outcome.ok) {
          return { ok: false, kind: "refused", why: `${spec}: ${firstLine(outcome.output)}` };
        }

        const harnessesMountedByLadder = new Set(Object.values(HARNESS_PLUGINS));
        if (harnessesMountedByLadder.has(picked.imported)) return { ok: true, value: undefined };

        const imported = await importPluginBySpec(picked.imported, pluginsRootResolver(home, place.plugins));
        if (!imported.ok) return { ok: false, kind: "internal", why: imported.problem };
        const says = await whatMountingSays(imported.plugin, home);
        if (!says.ok) return { ok: false, kind: "internal", why: says.problems.join("; ") };
        if (!says.workflow) writeExtraPlugins(home, [...config.extraPlugins, picked.imported]);

        return { ok: true, value: undefined };
      } catch (error) {
        return { ok: false, kind: "internal", why: `${spec}: ${firstLine(error)}` };
      }
    },
  };
}

function configPort(home: string): ConfigFile {
  const file = () => paths(home).config;
  return {
    // A config.yaml that cannot be parsed is refused by name with the
    // parser's first error, never read as an empty machine (S29): a broken
    // file is a condition the walk stops on, not a fresh start.
    read: async () => {
      try {
        const config = loadConfig(home);
        // Narrowed by hand rather than trusted: the config's `plugins:` block
        // is read as unknown values, and a non-object there is a config this
        // walk says nothing about rather than one it misreads.
        const settings: Record<string, Readonly<Record<string, unknown>>> = {};
        for (const [plugin, held] of Object.entries(config.plugins)) {
          if (held !== null && typeof held === "object") settings[plugin] = held as Record<string, unknown>;
        }
        return { ok: true, value: { ladder: config.agent.ladder ?? [], workflow: config.defaultWorkflow ?? "", settings } };
      } catch (error) {
        return { ok: false, kind: "refused", why: `${file()}: ${firstLine(error)}` };
      }
    },
    writeSetupProfile: async (workflow: string) =>
      writeStep(file(), () => {
        const config = loadConfig(home);
        // The profile's own settings ride along: the walk tunes how it asks
        // (the ask backoff), and rewriting the block without them would cost
        // the machine its own answers to exactly this walk.
        const held = (config.workflows[SETUP_PROFILE]?.settings ?? {}) as Record<string, unknown>;
        writeWorkflowProfile(home, SETUP_PROFILE, workflow, config, held);
      }),
    writeLadder: async (harness: string) => writeStep(file(), () => writeAgentLadder(home, [harness], loadConfig(home))),
    writeWorkflow: async (name: string, plugin: string) =>
      writeStep(file(), () => {
        writeWorkflowProfile(home, name, plugin, loadConfig(home));
        // The machine's default is the workflow the person chose to drive,
        // never the one that set the machine up: leaving the default on the
        // setup profile would make every bare `amy tick` walk onboarding
        // again. Only re-pointed when nothing better is written yet.
        const config = loadConfig(home);
        if (config.defaultWorkflow === "" || config.defaultWorkflow === SETUP_PROFILE) writeDefaultWorkflow(home, name, config);
      }),
    schemaOf: async (plugin: string) => {
      const imported = await importPluginBySpec(plugin, pluginsRootResolver(home, paths(home).plugins));
      if (!imported.ok) return { ok: false, kind: "internal", why: imported.problem };
      return { ok: true, value: (imported.plugin.configSchema ?? {}) as ConfigSchema };
    },
    writeSettings: async (plugin: string, values: Readonly<Record<string, unknown>>) =>
      writeStep(file(), () => writePluginSlice(home, plugin, values)),
  };
}

async function writeStep(file: string, write: () => void): Promise<Result<void>> {
  try {
    write();
    return { ok: true, value: undefined };
  } catch (error) {
    return { ok: false, kind: "internal", why: `${file}: ${firstLine(error)}` };
  }
}

/**
 * The setup and the checks of the plugins the walk chose, the same way the
 * machine runs them for itself.
 *
 * A plugin's setup is its files and the setups it declares, which is what
 * `amy init` ran for the whole machine and what the walk runs for the setup
 * profile after an install brought something new; its checks are what those
 * setups answered, folded into findings the walk can name. The harness model
 * ping the walk stops on is one of these findings: it is whatever the
 * plugin's own setup answered, said as it said it.
 */
function checksPort(home: string, runner: CommandRunner, out: (line: string) => void): Checks {
  const said: CommandOutput = { line: (text?: string) => out(text ?? ""), error: (text: string) => out(text) };
  const findings = (checks: readonly Check[]): Result<readonly CheckFinding[]> => ({
    ok: true,
    value: checks.map((check) => ({ name: check.label, ok: check.ok, said: check.detail ?? "" })),
  });

  const prepare = async (config: AmyConfig, profile: Profile): Promise<Check[]> => {
    const loadable = (specs: readonly string[]) => load(specs, setupResolver(home), paths(home).plugins);
    const gathered: { contributions: readonly Contribution[] } = await gather(config, [profile], loadable);
    writeFiles(home, config, profile, gathered.contributions, said);
    return await runPluginSetups(home, config, profile, gathered.contributions, said, runner);
  };

  const walked = async (plugin: string): Promise<Result<readonly CheckFinding[]>> => {
    try {
      const config = loadConfig(home);
      const { profile } = setupProfile(config, home, { terminal: true });
      const checks = await prepare(config, profile);
      const named = plugin.replace(/^@.*\//, "").toLowerCase();
      const saidAboutIt = checks.filter((check) => check.label.toLowerCase().includes(named));
      return findings(saidAboutIt.length > 0 ? saidAboutIt : checks.filter((check) => !check.ok));
    } catch (error) {
      return { ok: false, kind: "internal", why: firstLine(error) };
    }
  };

  return {
    setup: async (plugin: string) => walked(plugin),
    check: async (plugin: string) => walked(plugin),
  };
}

/** The profile the walk mounts in: the one the config names, or a fresh one. */
export function setupProfile(config: AmyConfig, home: string, options: { terminal: boolean }): { profile: Profile; configured: boolean } {
  const named = profiles(config, home)[SETUP_PROFILE];
  if (named) return { profile: named, configured: true };
  return {
    profile: {
      name: SETUP_PROFILE,
      workflow: SETUP_WORKFLOW,
      // Without a terminal there is nobody to answer an ask, so the
      // conversation is not mounted at all: the walk stops on its first
      // unanswered ask and says the flag that would have answered it, which
      // is the plan's S20 — an ask into no terminal is a stop, not a wait.
      plugins: options.terminal ? SETUP_PLUGINS : SETUP_PLUGINS.filter((spec) => spec !== "@amykit/plugin-terminal-conversation"),
      settings: { policy: { askBackoffMs: 500 } },
      takesNotes: false,
      takesTasks: false,
    },
    configured: false,
  };
}

/**
 * Resolves a spec through the machine's plugins root, falling back to what
 * the command itself ships.
 *
 * A fresh machine has nothing in its plugins root, and the walk still has to
 * mount: the packages the setup profile needs ship as the command's own
 * dependencies, so a spec the root does not hold resolves through Node's
 * own algorithm from here. Everything the person later chooses is installed
 * into the root by the walk itself, and takes that path first.
 */
export function setupResolver(home: string): (spec: string) => string {
  const machine = pluginsRootResolver(home, paths(home).plugins);
  return (spec: string) => {
    try {
      return machine(spec);
    } catch (error) {
      if (error instanceof Error && (error as Error & { code?: string }).code === "AMY_PLUGIN_NOT_INSTALLED") return spec;
      throw error;
    }
  };
}

/** What one pass of the walk's engine returned, narrowed to what it can be. */
type WalkTick = { kind: string; [key: string]: unknown };

/** The record one run of the walk drives, as the runtime starts it. */
type StartedRecord = ReturnType<WorkflowRuntime["newRecord"]>;

/**
 * The setting flags resolved to the packages they name, merged by spec: the
 * asks offer short names — slack, telegram — and the walk reads its answers
 * by package, so the command's own vocabulary ends here, once. A spec
 * written in full passes through as it is.
 */
function resolvedSettings(flags: SetupFlags): Record<string, Record<string, unknown>> {
  const settings: Record<string, Record<string, unknown>> = {};
  for (const [name, fields] of Object.entries(flags.settings)) {
    const spec = resolveSetupPlugin(name);
    settings[spec] = { ...(settings[spec] ?? {}), ...fields };
  }
  return settings;
}

/** The flags as the record's input: only what was answered, keyed as the walk reads it. */
function inputOf(flags: SetupFlags): Record<string, unknown> {
  const settings = resolvedSettings(flags);
  const input: Record<string, unknown> = {};
  if (flags.plugin !== undefined) input.plugin = flags.plugin;
  if (flags.harness !== undefined) input.harness = flags.harness;
  if (flags.workflow !== undefined) input.workflow = flags.workflow;
  if (flags.channels !== undefined) input.channels = [...flags.channels];
  if (Object.keys(settings).length > 0) input.settings = settings;
  return input;
}

/**
 * The record one run of the walk drives.
 *
 * One record per walk: the work is the machine being set up, and a machine
 * being set up again answers the same questions with what it already holds.
 * The flags travel as the record's input, which the walk reads the same way
 * it reads an answer; a scoped `amy setup <plugin>` starts where that
 * plugin's walk starts, not at the machine's beginning. The scope's spec
 * carries a slash, and a record's id is the one file the store and the queue
 * keep for it — flattened here, so one record stays one file.
 */
function startedRecord(runtime: WorkflowRuntime, flags: SetupFlags): StartedRecord {
  const workId = flags.plugin !== undefined ? flags.plugin.replaceAll("/", "-") : SETUP_PROFILE;
  const started = runtime.newRecord(workId, new Date());
  const input = inputOf(flags);
  return {
    ...started,
    ...(Object.keys(input).length > 0 ? { input } : {}),
    ...(flags.plugin !== undefined ? { state: "PLUGIN_INSTALLED" as const } : {}),
  };
}

/** What a look at the record says when the walk has finished: its exit code, or nothing to say. */
function finishedLook(store: { load: (id: string) => unknown }, recordId: string, out: (line: string) => void): number | undefined {
  const current = store.load(recordId) as { state: string; stoppedReason?: string; pending?: { flag: string } } | undefined;
  if (current?.state === "DONE") {
    out("amy is set up.");
    return 0;
  }
  if (current?.state === "STOPPED") {
    stoppedSays(current, out);
    return 1;
  }
  return undefined;
}

/** What a stopped walk says, and the flag that would get it moving again. */
function stoppedSays(current: { stoppedReason?: string; pending?: { flag: string } }, out: (line: string) => void): void {
  out(`amy setup stopped: ${current.stoppedReason ?? "without saying why"}`);
  if (current.pending) {
    out("");
    out("The flag that answers it:");
    out(`  amy setup ${current.pending.flag}`);
  }
}

/**
 * Runs `amy setup` once: one record of the setup workflow, from its start to
 * a state the machine can do nothing more with.
 *
 * The record is kept by the store as any record is and moved by the engine
 * as any work is, so the walk is honest about being a workflow: it is only
 * the person's answers that make it different, and those come as flags
 * answered before the ask, or through the terminal conversation mounted in
 * the profile.
 */
export async function runSetupWalk(
  home: string,
  flags: SetupFlags,
  runner: CommandRunner,
  out: (line: string) => void = (line) => console.log(line),
  options: { terminal?: boolean; maxMoves?: number } = {},
): Promise<number> {
  // A config.yaml that does not parse still mounts a fresh walk, but never
  // reads as nothing set: the default here is only the shape to assemble,
  // and the walk's own first step reads the real file and stops naming it
  // and the parser's first error (S29, A12).
  let config;
  try {
    config = loadConfig(home);
  } catch {
    config = DEFAULT_CONFIG;
  }
  const { profile } = setupProfile(config, home, { terminal: options.terminal ?? Boolean(process.stdin.isTTY) });
  const host = setupHost(home, runner, out);

  const assembled = await assembleProfile(home, config, profile, {
    runner,
    load: (specs) => load(specs, setupResolver(home), paths(home).plugins),
    log: (file) => new FileEventLog(file, undefined, undefined, true),
    host: [host.plugin],
  });

  if (!assembled.ok) {
    out("amy setup could not start:");
    for (const problem of assembled.problems) out(`  ${problem}`);
    return 1;
  }

  const store = assembled.mounted.store;
  const queue = assembled.mounted.queue;
  if (!store || !queue) {
    out("amy setup could not start: no store or queue mounted for its record");
    return 1;
  }

  const record = startedRecord(host.runtime(), flags);
  store.save(record);
  queue.enqueue({ workId: record.id, reason: "amy setup" }, new Date());

  // The engine moves one look at a time; the walk runs until the record
  // reaches a state nothing more can be done in, letting a person answer
  // between looks. A look that is not due yet comes back idle, which is the
  // walk's own pacing — the pause is what gives the terminal conversation
  // its turn.
  for (let moves = 0; moves < (options.maxMoves ?? 10_000); moves += 1) {
    const result = (await assembled.engine.tick()) as WalkTick;
    const finished = finishedLook(store, record.id, out);
    if (finished !== undefined) return finished;
    if (result?.kind === "idle" || result?.kind === "parked") await new Promise((wake) => setTimeout(wake, 10));
  }

  out("amy setup did not finish in the moves allowed; run it again to continue the walk");
  return 1;
}
