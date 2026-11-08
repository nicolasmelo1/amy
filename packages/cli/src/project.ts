import fs from "node:fs";
import path from "node:path";
import {
  BriefDeclaration,
  BriefOperation,
  BriefRecord,
  ConfigSchema,
  Mounted,
  MountedOperation,
  OPERATIONS_COLLECTION,
  Operation,
  ConfigField,
  Plugin,
  ProjectPhases,
  WorkflowPlugin,
  WorkRecord,
  call,
  defineWorkflow,
  declaredCallee,
  policyFor,
  validateConfig,
  withDiagram,
} from "@amykit/core";
import { PROJECT_PHASES, Profile, ProjectIdentity } from "./profiles.js";
import { inputSchemaOf } from "./operations/schema.js";

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

/** The phases of a project's mounted workflow, or the absences a workflow declares for itself. */
export function phasesOf(
  project: ProjectIdentity | undefined,
  workflow: { readonly states: readonly string[]; readonly phases?: ProjectPhases } | undefined,
): readonly PhaseView[] | undefined {
  if (!workflow) return undefined;
  const declared = workflow.phases ?? {};
  if (project) {
    return [...PROJECT_PHASES].map((phase) => ({
      phase: PHASE_STATE[phase].toLowerCase(),
      absent: !workflow.states.includes(PHASE_STATE[phase]),
      reason: declared[phase] ?? null,
    }));
  }
  // A workflow brought by a package has no project identity, yet it says in
  // its own declaration which phases of a project's walk it does not carry;
  // the status reads those absences where they are declared, not from the
  // composed state names.
  return Object.entries(declared)
    .filter((entry): entry is [typeof PROJECT_PHASES[number], string] => entry[1] !== undefined)
    .map(([phase, reason]) => ({ phase: phase.toLowerCase(), absent: true, reason }));
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
function bindingsFor(phases: readonly ProjectPhase[], contexts: ReadonlyMap<ProjectPhase, PhaseContext>): Record<string, ReturnType<typeof call>> {
  const record = (key: string) => (work: WorkRecord, out: unknown) => ({
    ...work,
    [key]: key === "prove" ? { ...(out as Record<string, unknown>), invocation: work.calling } : out,
  });
  const bindings: Record<string, ReturnType<typeof call>> = {};
  for (const one of phases) {
    const callee = declaredCallee(one.plugin);
    const output: Record<string, (work: never, out: unknown) => Record<string, unknown>> = {};
    for (const end of callee.returns) output[end] = record(one.phase);
    const settings = contexts.get(one)?.config ?? {};
    bindings[PHASE_STATE[one.phase]] = call(one.plugin, {
      ...(one === phases[0] ? { discover: true } : {}),
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
function settingsFor(schema: ConfigSchema, settings: Readonly<Record<string, unknown>>): Record<string, unknown> {
  const kept: Record<string, unknown> = {};
  for (const key of Object.keys(schema)) copySetting(key.split("."), settings, kept);
  return kept;
}

/** Copies one schema-declared setting path without carrying a sibling dotted leaf. */
function copySetting(path: readonly string[], source: Readonly<Record<string, unknown>>, target: Record<string, unknown>): void {
  const [head, ...tail] = path;
  if (head === undefined || !Object.hasOwn(source, head)) return;
  if (tail.length === 0) {
    target[head] = source[head];
    return;
  }
  const value = source[head];
  if (typeof value !== "object" || value === null || Array.isArray(value)) return;
  const nested = target[head] as Record<string, unknown> | undefined;
  const next = nested ?? {};
  target[head] = next;
  copySetting(tail, value as Record<string, unknown>, next);
}

interface PhaseContext {
  readonly config: Record<string, unknown>;
  readonly policy: object;
}

/** Validates the exact settings and policy the call will hand one phase. */
function phaseContexts(
  args: { readonly profile: Pick<Profile, "name" | "settings">; readonly slices: Readonly<Record<string, unknown>>; readonly phases: readonly ProjectPhase[] },
): { readonly contexts: ReadonlyMap<ProjectPhase, PhaseContext>; readonly problems: readonly string[] } {
  // The assembled slice has already put explicit plugin settings ahead of the
  // profile's defaults. Direct composition tests supply no slice, so retain
  // the profile's settings as the same lower-precedence source.
  const effective = { ...args.profile.settings, ...sliceFor(args.slices, composedPluginName(args.profile)) };
  const contexts = new Map<ProjectPhase, PhaseContext>();
  const problems: string[] = [];
  for (const phase of args.phases) {
    const callee = declaredCallee(phase.plugin);
    const checked = validateConfig(phase.name, callee.configSchema, settingsFor(callee.configSchema, effective));
    if (!checked.ok) {
      problems.push(...checked.problems);
      continue;
    }
    contexts.set(phase, { config: checked.config, policy: policyFor(phase.name, callee.policy, checked.config.policy) });
  }
  return { contexts, problems };
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
    // Every end the callee can arrive at draws its edge, the folds or not:
    // an end the callee returns nothing at folds nothing, but the walk still
    // goes somewhere from it, and an edge named for no end is a refusal.
    const ends = one.plugin.workflow.terminalStates?.length
      ? one.plugin.workflow.terminalStates
      : declaredCallee(one.plugin).returns;
    for (const end of ends) {
      const to = one.phase === "prove" && end !== "refused" && phases.some((phase) => phase.phase === "brief")
        ? "PROOF_COMPLETE"
        : one.phase === "prove" && end === "refused" ? before(at) : after(at);
      lines.push(`  ${state(one)} --> ${to}: ${end}`);
    }
  });
  if (phases.some((one) => one.phase === "brief") && phases.some((one) => one.phase === "prove")) {
    lines.push("  PROOF_COMPLETE --> DONE: every criterion is answered");
    lines.push(`  PROOF_COMPLETE --> ${state(phases.find((one) => one.phase === "workflow") ?? phases[0]!)}: a criterion is unanswered`);
  }
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
  const { schema, problems: schemaProblems } = mergeSchemas(args.phases);
  const { contexts, problems: contextProblems } = phaseContexts(args);
  return {
    ...{ plugin: build(args, schema, contexts), problems: [...schemaProblems, ...contextProblems] },
  };
}

function build(args: { readonly profile: Pick<Profile, "name" | "settings">; readonly slices: Readonly<Record<string, unknown>>; readonly phases: readonly ProjectPhase[]; readonly absent: ProjectPhases; readonly root: string }, schema: ConfigSchema, contexts: ReadonlyMap<ProjectPhase, PhaseContext>): Plugin {
  const claims = (key: "trackerWrites" | "codeHostWrites") => {
    // The claims are the phases' own: the walk cannot write more than its
    // phases do, and each phase's claim is read the way its own mount would
    // read it — a claim written as a function of its configuration is asked
    // with the settings this walk hands the phase, because that is the
    // configuration the mounted phase will actually run under.
    const claimed = new Set<string>();
    for (const one of args.phases) {
      const declared = declaredCallee(one.plugin)[key];
      const context = contexts.get(one) ?? { config: {}, policy: {} };
      const effective = typeof declared === "function" ? declared({ config: context.config as never, policy: context.policy }) : declared ?? [];
      for (const capability of effective) claimed.add(capability);
    }
    return [...claimed];
  };
  const composed = defineWorkflow({
    // A configured profile names the generated root's plugin and slice, but
    // a phase may legitimately use that same workflow declaration name.
    // Give the caller its own identity so core does not read that shape as a
    // recursive call.
    name: `project-${args.profile.name}`,
    pluginName: composedPluginName(args.profile),
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
    decide: {
      ...(args.phases.some((one) => one.phase === "brief") && args.phases.some((one) => one.phase === "prove") ? {
        PROOF_COMPLETE: (record) => proofAnswered(record)
          ? { kind: "advance" as const, to: "DONE", effects: [], why: "the proof answered every criterion the brief settled" }
          : { kind: "advance" as const, to: PHASE_STATE[args.phases.find((one) => one.phase === "workflow")?.phase ?? args.phases[0]!.phase], effects: [], why: "the proof left a briefed criterion unanswered" },
      } : {}),
      DONE: () => ({ kind: "settled", why: "the project's walk is over" }),
    },
    calls: bindingsFor(args.phases, contexts) as never,
  });
  const drawn = withDiagram(composed, projectDiagram(args.phases), "the project's own folders");
  PHASE_BRIEFS.set(drawn, args.phases.map((one) => ({ phase: one.phase, workflow: one.name, declaration: one.plugin.brief })));
  return drawn;
}

/** Whether every criterion a brief named appears in the proof's returned answer. */
function proofAnswered(record: WorkRecord & { readonly brief?: unknown; readonly prove?: unknown }): boolean {
  const criteria = criteriaOf(record.brief);
  if (criteria.length === 0) return true;
  const latest = Object.keys(record.calls ?? {}).filter((id) => id.includes("/PROVE#")).at(-1);
  const result = record.prove as { readonly invocation?: unknown } | undefined;
  if (result?.invocation !== latest) return false;
  const answered = new Set(criteriaOf(result));
  return criteria.every((criterion) => answered.has(criterion));
}

function criteriaOf(value: unknown): readonly string[] {
  if (typeof value !== "object" || value === null) return [];
  const criteria = (value as { readonly criteria?: unknown }).criteria;
  return Array.isArray(criteria) && criteria.every((criterion): criterion is string => typeof criterion === "string") ? criteria : [];
}

/**
 * One phase's brief, as `amy brief` reads it: the phase that asks, the
 * workflow it is, and what it declared — nothing, for a phase that asks the
 * brief for no section.
 */
export interface PhaseBrief {
  /** The project folder, or null for a workflow that is not a project's phase. */
  readonly phase: ProjectPhaseFolder | null;
  readonly workflow: string;
  readonly declaration?: BriefDeclaration;
}

/** What each composed project's phases declared about the brief, keyed by the plugin the walk mounts. */
const PHASE_BRIEFS = new WeakMap<object, readonly PhaseBrief[]>();

/**
 * Every brief declaration a mounted workflow answers for, in the order a
 * brief is groomed: a project's phases in walk order — the brief's own
 * sections, then each later phase's — or a lone workflow's own.
 */
export function briefsOf(plugin: object | undefined): readonly PhaseBrief[] {
  if (!plugin) return [];
  const phases = PHASE_BRIEFS.get(plugin);
  if (phases) return phases;
  const own = plugin as { readonly name?: string; readonly brief?: BriefDeclaration };
  return own.brief ? [{ phase: null, workflow: own.name ?? "the workflow", declaration: own.brief }] : [];
}

/** The phases whose declaration a brief check runs: the ones that declare one. */
function declaring(briefs: readonly PhaseBrief[]): readonly (PhaseBrief & { readonly declaration: BriefDeclaration })[] {
  return briefs.filter((one): one is PhaseBrief & { readonly declaration: BriefDeclaration } => one.declaration !== undefined);
}

/** The brief phase: the project's `brief/`, or a lone workflow that declares a brief. */
function briefPhase(briefs: readonly PhaseBrief[]): PhaseBrief | undefined {
  return briefs.find((one) => one.phase === "brief") ?? briefs.find((one) => one.phase === null);
}

/** Every section a brief answers, in grooming order, each named once, with the phase that asks it. */
export function sectionsOf(briefs: readonly PhaseBrief[]): readonly { readonly phase: ProjectPhaseFolder | null; readonly section: string }[] {
  const seen = new Set<string>();
  const sections: { phase: ProjectPhaseFolder | null; section: string }[] = [];
  for (const one of declaring(briefs)) {
    for (const section of one.declaration.sections) {
      if (seen.has(section)) continue;
      seen.add(section);
      sections.push({ phase: one.phase, section });
    }
  }
  return sections;
}

/** The operations the mounted plugins offer, as a brief check is handed them: id and input schema. */
export function operationsOffered(mounted: Pick<Mounted, "contributions"> | undefined): readonly BriefOperation[] {
  const offered = mounted?.contributions.get(OPERATIONS_COLLECTION);
  if (!offered) return [];
  return [...offered.entries()]
    .map(([id, entry]) => ({ id, input: inputOf(id, (entry as MountedOperation).operation) }))
    .sort((one, other) => one.id.localeCompare(other.id));
}

function inputOf(id: string, operation: MountedOperation["operation"]): Readonly<Record<string, unknown>> {
  try {
    return inputSchemaOf(operation as unknown as Operation);
  } catch (error) {
    // A stand-in schema would accept every input, so a check validating a
    // section against it would pass what the operation refuses.
    throw new Error(`the operation \`${id}\` offers no input schema a brief check can read: ${messageOf(error)}`, { cause: error });
  }
}

/** What was thrown, as words: an Error's message, anything else as it prints. */
function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/** One refusal as `amy brief check` reports it: which phase asked, about which section, and why. */
interface BriefCheckRefusal {
  readonly phase: ProjectPhaseFolder | null;
  readonly workflow: string;
  /** The section the refusal is about; absent when it is about the declaration rather than a section. */
  readonly section?: string;
  readonly rule: string;
}

/** What `amy brief check` answers: the refusals, and the section grooming asks next. */
export interface BriefCheckResult {
  readonly id: string;
  /** Zero when the brief is not stored yet. */
  readonly revision: number;
  readonly refusals: readonly BriefCheckRefusal[];
  /**
   * The section grooming asks next, or null when the brief is green or
   * nothing refused names a section: a refused section the brief already
   * answers first, else the first refused section in grooming order. Grooming
   * moves past a phase while every refusal left names a section not yet
   * answered, and asks a section again when a refusal names one it answered.
   */
  readonly next: { readonly phase: ProjectPhaseFolder | null; readonly section: string } | null;
}

/**
 * Judges a brief against every phase that declares one.
 *
 * A declared section the brief leaves out or blank is refused by the host,
 * naming the phase that asked it. Then each phase's own `check` is asked,
 * with the operations the mounted plugins offer, and what it refuses is
 * reported under that phase. The brief phase declaring no check is a refusal
 * of its own: no check is not a check that passes.
 */
export async function checkBrief(
  briefs: readonly PhaseBrief[],
  id: string,
  stored: BriefRecord | null,
  operations: readonly BriefOperation[],
): Promise<BriefCheckResult> {
  const record: BriefRecord = stored ?? { id, sections: [], questions: [], explains: [], createdAt: "", updatedAt: "", revision: 0 };
  const answered = new Map(record.sections.map((section) => [section.name, section.body]));
  const refusals: BriefCheckRefusal[] = [...uncheckedOwner(briefs)];
  for (const one of declaring(briefs)) refusals.push(...await judged(one, record, answered, operations));
  return { id, revision: record.revision, refusals, next: nextSection(briefs, refusals, answered) };
}

/** The brief phase declaring no check, as a refusal: no check is not a check that passes. */
function uncheckedOwner(briefs: readonly PhaseBrief[]): readonly BriefCheckRefusal[] {
  const owner = briefPhase(briefs);
  if (!owner || owner.declaration?.check !== undefined) return [];
  return [{
    phase: owner.phase,
    workflow: owner.workflow,
    rule: `${where(owner)} declares no brief check, so nothing can say this brief is ready — declare \`brief: { sections, check }\` in its defineWorkflow`,
  }];
}

/** One phase's refusals: the declared sections left blank, then what its own check refuses. */
async function judged(
  one: PhaseBrief & { readonly declaration: BriefDeclaration },
  record: BriefRecord,
  answered: ReadonlyMap<string, string>,
  operations: readonly BriefOperation[],
): Promise<readonly BriefCheckRefusal[]> {
  const refusals: BriefCheckRefusal[] = one.declaration.sections
    .filter((section) => (answered.get(section) ?? "").trim() === "")
    .map((section) => ({ phase: one.phase, workflow: one.workflow, section, rule: `${where(one)} asks for it, and the brief does not answer it` }));
  if (!one.declaration.check) return refusals;
  try {
    const refused = await one.declaration.check(record, { operations });
    for (const refusal of refused) refusals.push({ phase: one.phase, workflow: one.workflow, section: refusal.section, rule: refusal.rule });
  } catch (error) {
    refusals.push({ phase: one.phase, workflow: one.workflow, rule: `${where(one)}'s check threw: ${messageOf(error)}` });
  }
  return refusals;
}

/**
 * A refused section the brief already answers is asked again before any
 * section still unanswered: grooming moves on only while every refusal left
 * names a section it has not asked yet.
 */
function nextSection(
  briefs: readonly PhaseBrief[],
  refusals: readonly BriefCheckRefusal[],
  answered: ReadonlyMap<string, string>,
): BriefCheckResult["next"] {
  const refused = new Set(refusals.flatMap((refusal) => (refusal.section === undefined ? [] : [refusal.section])));
  const inOrder = sectionsOf(briefs).filter((one) => refused.has(one.section));
  return inOrder.find((one) => (answered.get(one.section) ?? "").trim() !== "") ?? inOrder[0] ?? null;
}

/** How a refusal names who asked: the project folder, or the workflow. */
function where(one: PhaseBrief): string {
  return one.phase === null ? `the ${one.workflow} workflow` : `\`${one.phase}/\` (${one.workflow})`;
}

/**
 * A brief with one section answered: the sections in grooming order, an
 * answer replacing the one before it, and any section the brief carries that
 * no phase declares kept where it was, after them.
 */
export function withSection(
  briefs: readonly PhaseBrief[],
  stored: Pick<BriefRecord, "sections"> | null,
  section: string,
  body: string,
): { name: string; body: string }[] {
  const declared = sectionsOf(briefs).map((one) => one.section);
  const bodies = new Map((stored?.sections ?? []).map((one) => [one.name, one.body]));
  bodies.set(section, body);
  return [
    ...declared.filter((name) => bodies.has(name)).map((name) => ({ name, body: bodies.get(name)! })),
    ...(stored?.sections ?? []).filter((one) => !declared.includes(one.name)),
  ];
}

/**
 * Whether the workflow asks for a brief at all: a phase declares sections,
 * or a project carries a `brief/` phase — which, declaring no check, is
 * refused rather than read as a brief with nothing to answer.
 */
export function asksForABrief(briefs: readonly PhaseBrief[]): boolean {
  return briefs.some((one) => one.declaration !== undefined || one.phase === "brief");
}

/** Whether writing these sections and this membership would change what the stored brief says. */
export function briefMoved(
  stored: Pick<BriefRecord, "sections" | "explains">,
  sections: readonly { readonly name: string; readonly body: string }[],
  explains: readonly string[],
): boolean {
  const same = <T>(one: readonly T[], other: readonly T[], equal: (a: T, b: T) => boolean) =>
    one.length === other.length && one.every((item, at) => equal(item, other[at]!));
  return !same(stored.sections, sections, (a, b) => a.name === b.name && a.body === b.body)
    || !same(stored.explains, explains, (a, b) => a === b);
}
