import fs from "node:fs";
import path from "node:path";
import {
  ConfigSchema,
  ConfigField,
  Plugin,
  ProjectPhases,
  WorkflowPlugin,
  call,
  defineWorkflow,
  declaredCallee,
  withDiagram,
} from "@amykit/core";
import { PROJECT_PHASES, Profile, ProjectIdentity } from "./profiles.js";

/**
 * A project is one workflow, and amy derives it from the project's folders.
 *
 * The folders are the diagram: `brief/`, `workflow/` and `prove/` name the
 * phases in the order they walk, each a call to the workflow its folder
 * exports. Nobody writes the project's diagram, binds the calls by hand or
 * lists the edges; this module derives the one workflow the project is —
 * BRIEF, WORK and PROVE as child records of the project's record inside one
 * profile, the way any call's are — and refuses a project whose folders and
 * its declaration disagree.
 *
 * What each phase returns folds onto the project's record under its own
 * name, and what BRIEF returned is what WORK and PROVE are handed when they
 * take an input: the criteria the brief settled are exactly what the proof
 * is asked to show. PROVE refusing goes back to the phase before it,
 * carrying what did not hold.
 */

/** The state a phase walks as a project record, keyed by its folder. */
const PHASE_STATE = { brief: "BRIEF", workflow: "WORK", prove: "PROVE" } as const;
type ProjectPhaseFolder = (typeof PROJECT_PHASES)[number];

/** The folder the world before this plan used for the third phase. */
const OLD_PROVE = "test";

/** Every folder a project root may carry where a phase would be, including the misnamed one. */
function phaseFolders(root: string): ReadonlySet<string> {
  return new Set([...PROJECT_PHASES, OLD_PROVE].filter((phase) => fs.existsSync(path.join(root, phase))));
}

/** The composed workflow's plugin name, the one its config slice is read by. */
export function composedPluginName(profile: Pick<Profile, "name">): string {
  return `workflow-${profile.name}`;
}

/** The loader specs of a project's present phases, walk order, the anchor included. */
export function projectSpecs(root: string): readonly string[] {
  return [...PROJECT_PHASES].filter((phase) => fs.existsSync(path.join(root, phase))).map((phase) => path.join(root, phase));
}

/** One phase as a view reports it: where the walk puts it, or the reason it is out. */
export interface PhaseView {
  readonly phase: string;
  readonly absent: boolean;
  readonly reason: string | null;
}

/** The phases of a project's mounted workflow, or nothing when this is not a project. */
export function phasesOf(
  project: ProjectIdentity | undefined,
  workflow: { readonly states: readonly string[]; readonly phases?: ProjectPhases } | undefined,
): readonly PhaseView[] | undefined {
  if (!project || !workflow) return undefined;
  const declared = workflow.phases ?? {};
  return [...PROJECT_PHASES].map((phase) => ({
    phase: PHASE_STATE[phase].toLowerCase(),
    absent: !workflow.states.includes(PHASE_STATE[phase]),
    reason: declared[phase] ?? null,
  }));
}

export interface ProjectPhase {
  readonly phase: ProjectPhaseFolder;
  /** The plugin the phase folder exports, called as this project's callee. */
  readonly plugin: WorkflowPlugin;
  /** The name the plugin answers to, for the slices its settings ride. */
  readonly name: string;
}

export interface ResolvedPhases {
  /** The phases that walk, in the order they walk: brief, then work, then prove. */
  readonly walking: readonly { readonly phase: ProjectPhaseFolder; readonly spec: string }[];
  /** The phases declared absent, and why: what `amy status` reads. */
  readonly absent: ProjectPhases;
  /** The refusals the folders and the declaration disagree on, or the walk's shape cannot hold. */
  readonly problems: readonly string[];
}

/**
 * Resolves a project's phases from its folders and the declaration it names.
 *
 * Every phase is either its folder on disk or a reason in the declaration;
 * a folder named `test/` is the spelling the world before this plan used,
 * and is refused, naming `prove/`.
 */
export function resolvePhases(root: string, declared: ProjectPhases | undefined): ResolvedPhases {
  const problems: string[] = [];
  const folders = phaseFolders(root);
  if (folders.has(OLD_PROVE)) {
    problems.push(
      `${path.join(root, OLD_PROVE)} is not a phase of a project amy walks: the proving phase is named \`prove/\` — rename the folder to \`prove/\``,
    );
  }

  const walking: { phase: ProjectPhaseFolder; spec: string }[] = [];
  const declaredAbsent: Record<string, string> = {};
  for (const phase of PROJECT_PHASES) {
    const spec = path.join(root, phase);
    if (folders.has(phase)) {
      if (declared?.[phase] !== undefined) {
        problems.push(
          `\`${phase}/\` is present at ${spec}, and the project's declaration says it is absent — one of the two is wrong`,
        );
      } else {
        walking.push({ phase, spec });
      }
      continue;
    }
    if (declared?.[phase] !== undefined) {
      declaredAbsent[phase] = declared[phase]!;
      continue;
    }
    problems.push(
      `the project at ${root} has no ${phase}/ phase, and its declaration says nothing about it — add ${spec}, or declare in the workflow's \`phases:\` why it is absent`,
    );
  }

  if (walking.length === 0) {
    problems.push(`the project at ${root} declares no phase to walk: it is brief without work and proof, and nothing moves`);
  }
  const proveAt = walking.findIndex((one) => one.phase === "prove");
  if (proveAt === 0) {
    problems.push(
      `the project at ${root} walks its proving phase first: PROVE refused goes back to the phase before it, and there is none — add ${path.join(root, "workflow")}, or declare in the workflow's \`phases:\` why work is absent`,
    );
  }
  return { walking, absent: declaredAbsent as ProjectPhases, problems };
}

/**
 * The composed workflow's calls, by phase state: what the phase's folding is.
 *
 * Every phase's return folds onto the project's record under its own name,
 * at every end it returns something at — an end the callee returns nothing
 * at folds nothing, because there is nothing to fold. WORK and PROVE are
 * handed what BRIEF returned when they take an input, exactly as the brief
 * settled them.
 */
function bindingsFor(phases: readonly ProjectPhase[], slices: Readonly<Record<string, unknown>>, ownSettings: Readonly<Record<string, unknown>>): Record<string, ReturnType<typeof call>> {
  const record = (key: string) => (work: Record<string, unknown>, out: unknown) => ({ ...work, [key]: out });
  const bindings: Record<string, ReturnType<typeof call>> = {};
  for (const one of phases) {
    const callee = declaredCallee(one.plugin);
    const output: Record<string, (work: never, out: unknown) => Record<string, unknown>> = {};
    for (const end of callee.returns) output[end] = record(one.phase);
    const settings = { ...sliceFor(slices, one.name), ...settingsFor(one.plugin, ownSettings) };
    bindings[PHASE_STATE[one.phase]] = call(one.plugin, {
      ...(Object.keys(output).length > 0 ? { output: output as never } : {}),
      ...(one.phase !== "brief" && callee.input !== undefined ? { input: ((work: { brief: unknown }) => work.brief) as never } : {}),
      ...(Object.keys(settings).length > 0 ? { config: settings } : {}),
    });
  }
  return bindings;
}

/** The slice the machine derives for one callee, when it derived any. */
function sliceFor(slices: Readonly<Record<string, unknown>>, name: string): Record<string, unknown> {
  const slice = slices[name];
  return typeof slice === "object" && slice !== null && !Array.isArray(slice) ? { ...(slice as Record<string, unknown>) } : {};
}

/** The operator's own settings, kept to the ones the callee's schema declares. */
function settingsFor(plugin: WorkflowPlugin, ownSettings: Readonly<Record<string, unknown>>): Record<string, unknown> {
  const schema = plugin.configSchema;
  if (!schema) return {};
  const kept: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(ownSettings)) if (schema[key] !== undefined) kept[key] = value;
  return kept;
}

/** The states a project walks, the initial one first, and where each phase goes. */
function projectDiagram(
  phases: readonly ProjectPhase[],
): string {
  const state = (one: ProjectPhase) => PHASE_STATE[one.phase];
  const after = (at: number): string => (at + 1 < phases.length ? state(phases[at + 1]!) : "DONE");
  const before = (at: number): string => (at > 0 ? state(phases[at - 1]!) : "DONE");
  const lines: string[] = ["stateDiagram-v2", `  [*] --> ${state(phases[0]!)}`];
  phases.forEach((one, at) => {
    const ends = declaredCallee(one.plugin).returns.length > 0
      ? declaredCallee(one.plugin).returns
      : one.plugin.workflow.terminalStates;
    for (const end of ends) {
      const to = one.phase === "prove" && end === "refused" ? before(at) : after(at);
      lines.push(`  ${state(one)} --> ${to}: ${end}`);
    }
  });
  // The terminal line is written last, so the states the file names read in
  // walk order: the diagram's own list is the order the lines were read.
  lines.push(`  DONE --> [*]`);
  lines.push(...phases.map((one) => `  class ${state(one)} call`));
  return `${lines.join("\n")}\n`;
}

/** The schemas the project's phases declare, merged, or why they disagree. */
function mergeSchemas(phases: readonly ProjectPhase[]): { readonly schema: ConfigSchema; readonly problems: readonly string[] } {
  const merged: Record<string, ConfigField> = {};
  const problems: string[] = [];
  for (const one of phases) {
    for (const [key, entry] of Object.entries(one.plugin.configSchema ?? {})) {
      const held = merged[key];
      if (held && !agree(held, entry)) {
        problems.push(
          `\`${key}\` means two things in one project: \`${one.name}\` declares ${describe(entry)} and another phase declares ${describe(held)} — the phases of a project share the machine's one config, so their schemas must agree`,
        );
        continue;
      }
      merged[key] = entry;
    }
  }
  return { schema: merged as ConfigSchema, problems };
}

/** Whether two schema entries describe the same setting: type, default and required agree. */
function agree(one: ConfigField, other: ConfigField): boolean {
  return JSON.stringify({ type: one.type, default: one.default, required: one.required })
    === JSON.stringify({ type: other.type, default: other.default, required: other.required });
}

function describe(entry: ConfigField): string {
  return `${entry.type} defaulting to ${JSON.stringify(entry.default)}`;
}

/**
 * The project's composed plugin: one workflow derived from the phases.
 *
 * The walk's own states decide nothing — BRIEF, WORK and PROVE are calls the
 * callees decide, and DONE ends the walk, which no record ever re-asks. The
 * claims are the phases' own: the walk cannot write more than its phases do.
 */
export function composeProject(args: {
  readonly profile: Pick<Profile, "name" | "settings">;
  /** The machine's slices for this profile, computed against the composed name. */
  readonly slices: Readonly<Record<string, unknown>>;
  readonly phases: readonly ProjectPhase[];
  /** The phases declared absent, why — carried on the workflow itself. */
  readonly absent: ProjectPhases;
  /** The project root, for the refusals a phase's own shape names. */
  readonly root: string;
}): { readonly plugin: Plugin; readonly problems: readonly string[] } {
  const { schema, problems } = mergeSchemas(args.phases);
  return {
    ...{ plugin: build(args, schema), problems },
  };
}

function build(args: { readonly profile: Pick<Profile, "name" | "settings">; readonly slices: Readonly<Record<string, unknown>>; readonly phases: readonly ProjectPhase[]; readonly absent: ProjectPhases; readonly root: string }, schema: ConfigSchema): Plugin {
  const claims = (key: "trackerWrites" | "codeHostWrites") => {
    const claimed = new Set<string>();
    for (const one of args.phases) for (const capability of one.plugin.workflow[key] ?? []) claimed.add(capability);
    return [...claimed];
  };
  const composed = defineWorkflow({
    name: args.profile.name,
    configSchema: schema,
    policy: {},
    needs: {},
    ...(Object.keys(args.absent).length > 0 ? { phases: args.absent } : {}),
    trackerWrites: claims("trackerWrites"),
    codeHostWrites: claims("codeHostWrites"),
    record: () => ({}),
    discover: async () => [],
    observe: async () => ({}),
    actions: {},
    remember: (_scope, record) => record,
    decide: { DONE: () => ({ kind: "settled", why: "the project's walk is over" }) },
    calls: bindingsFor(args.phases, args.slices, args.profile.settings ?? {}) as never,
  });
  return withDiagram(composed, projectDiagram(args.phases), "the project's own folders");
}