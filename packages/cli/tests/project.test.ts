import { afterEach, beforeEach, describe, expect, it } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import type { ConfigField, ConfigSchema, Plan, WorkRecord } from "@amykit/core";
import { CALLED, defineWorkflow, settled } from "@amykit/core";
import { FileEventLog } from "@amykit/plugin-file-log";
import { FileQueue } from "@amykit/plugin-file-queue";
import { FileStore } from "@amykit/plugin-file-store";
import { plugin as errand } from "@amykit/workflow-errand";
import { plugin as noteToPlan } from "@amykit/workflow-note-to-plan";
import { plugin as ticketToQa } from "@amykit/workflow-ticket-to-qa";
import { assembleProfile, type AssemblyServices } from "../src/assemble.js";
import type { AmyConfig } from "../src/config.js";
import { DEFAULT_CONFIG } from "../src/config.js";
import { isFilesystemWorkflow, load, pluginsRootResolver } from "../src/loader.js";
import { profileDaemonPids, profileOwnedDirectories, profilePaths } from "../src/paths.js";
import { profiles } from "../src/profiles.js";
import { composeProject, phasesOf, resolvePhases } from "../src/project.js";
import { hostPaths, pluginSlices, worktreeNamespace } from "../src/slices.js";

/** One phase's plugin, as the composition reads it. */
type PhasePlugin = Parameters<typeof composeProject>[0]["phases"][number]["plugin"];

/** A phase declared the way somebody writes one, in memory: its own walk, its ends, what it returns. */
function declaredPhase(
  name: string,
  spec: {
    readonly states: readonly [string, ...string[]];
    readonly terminal: readonly string[];
    /** What the workflow returns at an end, keyed by the end: an entry the composition folds. */
    readonly returns?: Readonly<Record<string, unknown>>;
    /** The input the workflow declares, when it takes one. */
    readonly takes?: ConfigSchema;
    /** The configuration the workflow's own mount validates, its vocabulary kept to what it names. */
    readonly schema?: ConfigSchema;
    /** The tracker writes the workflow claims, as its declaration carries them. */
    readonly writes?: unknown;
    /** One decision per state, replacing the default march down the states. */
    readonly decisions?: Readonly<Record<string, (record: WorkRecord) => Plan>>;
  },
) {
    return defineWorkflow({
    name,
    states: spec.states,
    terminal: spec.terminal,
    configSchema: spec.schema ?? {},
    policy: {},
    ...(spec.takes ? { input: spec.takes } : {}),
    ...(spec.returns ? { output: Object.fromEntries(Object.entries(spec.returns).map(([end, returns]) => [end, () => returns])) } : {}),
    ...(spec.writes ? { trackerWrites: spec.writes as never } : {}),
    needs: {},
    record: () => ({}),
    discover: async () => [],
    observe: async () => ({}),
    actions: {},
    decide: Object.fromEntries(
      spec.states.map((state, at) => [
        state,
        (record: WorkRecord): Plan =>
          spec.decisions?.[state]?.(record) ??
          (at < spec.states.length - 1 ? { kind: "advance", to: spec.states[at + 1]!, effects: [], why: "the phase moves on" } : settled(`${state} settles`)),
      ]),
    ),
  });
}

/** The problems an assembly refused with, in a shape assertions read. */
function problems(assembled: Awaited<ReturnType<typeof assembleProfile>>): readonly string[] {
  return assembled.ok ? [] : assembled.problems;
}

const mountsFor = (workflow: string): string[] => [
  "@amykit/plugin-file-queue",
  "@amykit/plugin-file-store",
  "@amykit/plugin-file-brief-store",
  workflow,
  "@amykit/plugin-serial-engine",
  "@amykit/plugin-notify-fanout",
];

// The @amykit/core a fixture module imports, read by absolute URL: a phase
// written into a scratch directory resolves nothing otherwise.
const CORE_ENTRY = pathToFileURL(path.resolve(import.meta.dirname, "..", "..", "..", "node_modules", "@amykit", "core", "dist", "index.js")).href;

describe("a project is brief, work and proof", () => {
  const root = path.join("/projects", "invoices");

  it("walks BRIEF, WORK, PROVE and DONE, each phase a call to its folder's workflow", () => {
    const brief = declaredPhase("brief-of-invoices", { states: ["BRIEFED"], terminal: ["BRIEFED"], returns: { BRIEFED: { criteria: ["product"] } } });
    const work = declaredPhase("work-of-invoices", { states: ["OPENED"], terminal: ["OPENED"] });
    const prove = declaredPhase("prove-of-invoices", { states: ["CHECKED"], terminal: ["SATISFIED"], returns: { SATISFIED: { criteria: ["product"] } } });

    const composed = composeProject({
      profile: { name: "invoices", settings: {} },
      slices: {},
      phases: [
        { phase: "brief", plugin: brief, name: brief.name },
        { phase: "workflow", plugin: work, name: work.name },
        { phase: "prove", plugin: prove, name: prove.name },
      ],
      absent: {},
      root,
    });
    expect(composed.problems).toEqual([]);

    const walk = composed.plugin as PhasePlugin;
    expect(walk.workflow!.states).toEqual(["BRIEF", "WORK", "PROVE", "PROOF_COMPLETE", "DONE"]);
    expect(walk.workflow!.terminalStates).toEqual(["DONE"]);
    // The project's phases are child records: every phase is a call.
    expect(Object.keys(walk.workflow!.calls ?? {})).toEqual(["BRIEF", "WORK", "PROVE"]);
  });

  it("never starts WORK before BRIEF has ended, and moves to WORK only when the brief's child is over", () => {
    const brief = declaredPhase("brief-of-gate", { states: ["GROOMING", "BRIEFED"], terminal: ["BRIEFED"] });
    const work = declaredPhase("work-of-gate", { states: ["OPENED"], terminal: ["OPENED"] });
    const prove = declaredPhase("prove-of-gate", { states: ["CHECKED"], terminal: ["SATISFIED"] });
    const composed = composeProject({
      profile: { name: "gate", settings: {} },
      slices: {},
      phases: [
        { phase: "brief", plugin: brief, name: brief.name },
        { phase: "workflow", plugin: work, name: work.name },
        { phase: "prove", plugin: prove, name: prove.name },
      ],
      absent: {},
      root,
    });
    const walk = composed.plugin as PhasePlugin;
    const record = walk.newRecord!("ROW", new Date()) as WorkRecord;

    // The record's own state is the first phase, and its child is the brief's.
    expect(record.state).toBe("BRIEF");
    expect(record.calling).toBeDefined();
    // The brief's child decides; the walk's own state does not move with it.
    expect(walk.workflow!.plan(record, { [CALLED]: undefined }, {}).kind).toBe("act");
  });

  it("goes back to WORK when PROVE refuses, and reaches DONE only through an end the proof held", () => {
    const brief = declaredPhase("brief-of-edges", { states: ["BRIEFED"], terminal: ["BRIEFED"] });
    const work = declaredPhase("work-of-edges", { states: ["OPENED"], terminal: ["OPENED"] });
    const prove = declaredPhase("prove-of-edges", { states: ["CHECKED"], terminal: ["SATISFIED", "refused"] });

    const composed = composeProject({
      profile: { name: "edges", settings: {} },
      slices: {},
      phases: [
        { phase: "brief", plugin: brief, name: brief.name },
        { phase: "workflow", plugin: work, name: work.name },
        { phase: "prove", plugin: prove, name: prove.name },
      ],
      absent: {},
      root,
    });
    const walk = composed.plugin as PhasePlugin;
    const edgesFrom = (state: string) => walk.workflow!.diagram!.transitions.filter((edge) => edge.from === state);

    expect(edgesFrom("PROVE").find((edge) => edge.label === "refused")?.to).toBe("WORK");
    expect(edgesFrom("PROVE").find((edge) => edge.label === "SATISFIED")?.to).toBe("PROOF_COMPLETE");
  });

    it("draws an edge from every end its phase can end at, the folds or not", async () => {
    const base = fs.mkdtempSync(path.join(os.tmpdir(), "amy-project-ends-"));
    try {
      const home = path.join(base, ".amy");
      fs.mkdirSync(home, { recursive: true });
      writePluginFile(path.join(base, "invoices", "brief"), fixturePhaseModule("brief-of-ends", { states: ["BRIEFED"], terminal: ["BRIEFED"], decide: "settled" }));
      writePluginFile(path.join(base, "invoices", "workflow"), fixturePhaseModule("work-of-ends", { states: ["OPENED"], terminal: ["OPENED"], decide: "settled" }));
      writePluginFile(path.join(base, "invoices", "prove"), fixturePhaseModule("prove-of-ends", {
        states: ["CHECKED"],
        terminal: ["SATISFIED", "refused"],
        decide: "settled",
        output: { SATISFIED: { held: true } },
      }));

      const spec = path.join(base, "invoices", "workflow");
      const assembled = await assembledFor(base, home, { invoices: { workflow: spec, plugins: mountsFor(spec) } });
      expect(assembled.ok).toBe(true);
      // The walk that mounted draws an edge for every end its proving phase
      // can arrive at, the fold at SATISFIED and the refusal that carries the
      // row back to WORK, whatever the phase returns at each.
      const transitions = assembled.ok ? assembled.mounted.workflow?.diagram?.transitions : undefined;
      const edges = (transitions ?? []).filter((edge) => edge.from === "PROVE");
      expect(edges.find((edge) => edge.label === "refused")?.to).toBe("WORK");
      expect(edges.find((edge) => edge.label === "SATISFIED")?.to).toBe("PROOF_COMPLETE");
    } finally {
      fs.rmSync(base, { recursive: true, force: true });
    }
  });

  it("claims what its phases' own claims say, a claim read under the configuration it will run in", () => {
    const writes = ({ config }: { config: { writes?: string } }): readonly string[] =>
      config.writes === "operator" ? [] : ["comment"];
    const phaseWith = (settings: Readonly<Record<string, unknown>>) => {
      const work = declaredPhase("work-of-claims", {
        states: ["OPENED"],
        terminal: ["OPENED"],
        schema: { writes: { type: "string", description: "the write posture the phase runs under" } },
        writes,
      });
      const composed = composeProject({
        profile: { name: "claims", settings },
        slices: {},
        phases: [{ phase: "workflow", plugin: work, name: work.name }],
        absent: {},
        root,
      });
      return composed.plugin as PhasePlugin;
    };
    // The operator's own words reach the phase's claim: what it says it may
    // write, it says under the settings the walk hands it.
    expect(phaseWith({ writes: "operator" }).workflow!.trackerWrites).toEqual([]);
    // And where the machine says nothing, the phase's own default claim stands.
    expect(phaseWith({}).workflow!.trackerWrites).toEqual(["comment"]);
  });

  it("says a workflow's own declared absences at the status, packaged or not", () => {
    // A packaged workflow carries no project identity, yet it declares which
    // phases of a walk it does not carry, and the status reads those.
    const packaged = {
      states: ["OPENED", "SETTLED"],
      phases: { brief: "the ticket itself says what the work is", prove: "the gate's run proves the work" },
    };
    expect(phasesOf(undefined, packaged)).toEqual([
      { phase: "brief", absent: true, reason: "the ticket itself says what the work is" },
      { phase: "prove", absent: true, reason: "the gate's run proves the work" },
    ]);
    // A project's walk still reports all three phases of its own: the ones
    // the walk drives, and the ones its declaration said are out, why.
    const composed = { states: ["BRIEF", "WORK", "DONE"], phases: { prove: "the gate's run proves the work" } };
    expect(phasesOf({ root, phase: "workflow" }, composed)).toEqual([
      { phase: "brief", absent: false, reason: null },
      { phase: "work", absent: false, reason: null },
      { phase: "prove", absent: true, reason: "the gate's run proves the work" },
    ]);
  });

  it("refuses a project whose proving phase is neither present nor declared, naming the phase", async () => {
    const base = fs.mkdtempSync(path.join(os.tmpdir(), "amy-project-absent-"));
    try {
      const home = path.join(base, ".amy");
      fs.mkdirSync(home, { recursive: true });
      fs.mkdirSync(path.join(base, "invoices", "workflow"), { recursive: true });
      writePluginFile(path.join(base, "invoices", "workflow"), fixturePhaseModule("invoices-work", { states: ["OPENED"], terminal: ["OPENED"], decide: "settled" }));

      const spec = path.join(base, "invoices", "workflow");
      const assembled = await assembledFor(base, home, { execution: { workflow: spec, plugins: mountsFor(spec) } });
      expect(assembled.ok).toBe(false);
      const said = problems(assembled).join("\n");
      expect(said).toContain("prove/");
      expect(said).toContain(path.join(base, "invoices", "prove"));
    } finally {
      fs.rmSync(base, { recursive: true, force: true });
    }
  });

  it("hands a phase the dotted settings the machine wrote nested, and refuses none the machine said", async () => {
    const base = fs.mkdtempSync(path.join(os.tmpdir(), "amy-project-dotted-"));
    try {
      const home = path.join(base, ".amy");
      fs.mkdirSync(home, { recursive: true });
      // A phase whose configuration vocabulary is a dotted schema key: the
      // machine writes the group nested, and the walk hands the phase exactly
      // what the operator wrote there.
      writePluginFile(path.join(base, "invoices", "workflow"), fixturePhaseModule("work-of-dotted", {
        states: ["OPENED"],
        terminal: ["OPENED"],
        decide: "settled",
        schema: { "policy.maxAttempts": { type: "number", required: true, description: "the ceiling the phase retries under" } },
        phases: {
          brief: "the work a ticket named is groomed where the ticket lives, not in this walk",
          prove: "the command gate's run proves the work; this walk keeps no proving phase",
        },
      }));
      const spec = path.join(base, "invoices", "workflow");
      const assembled = await assembledFor(base, home, {
        invoices: {
          workflow: spec,
          plugins: mountsFor(spec),
          settings: { policy: { maxAttempts: 3 } },
        },
      });
      // The composed walk carries the setting twice-over: the phase's call
      // names it, and the composed workflow's own schema accepts it.
      expect(assembled.ok).toBe(true);
    } finally {
      fs.rmSync(base, { recursive: true, force: true });
    }
  });

  it("refuses a folder named test/, naming prove/", async () => {
    const base = fs.mkdtempSync(path.join(os.tmpdir(), "amy-project-test-"));
    try {
      const home = path.join(base, ".amy");
      fs.mkdirSync(home, { recursive: true });
      fs.mkdirSync(path.join(base, "invoices", "workflow"), { recursive: true });
      fs.mkdirSync(path.join(base, "invoices", "test"), { recursive: true });
      writePluginFile(path.join(base, "invoices", "workflow"), fixturePhaseModule("invoices-work", { states: ["OPENED"], terminal: ["OPENED"], decide: "settled" }));

      const spec = path.join(base, "invoices", "workflow");
      const assembled = await assembledFor(base, home, { execution: { workflow: spec, plugins: mountsFor(spec) } });
      expect(assembled.ok).toBe(false);
      const said = problems(assembled).join("\n");
      expect(said).toContain("test");
      expect(said).toContain("prove/");
    } finally {
      fs.rmSync(base, { recursive: true, force: true });
    }
  });

  it("is one profile and one daemon: one state of records, queue, tasks, threads, and one log", () => {
    const config = { ...DEFAULT_CONFIG, workflows: { invoices: { workflow: path.join(root, "workflow") } } };
    const known = profiles(config);
    const place = profilePaths("/amy", known.invoices!);

    // The state key carries the project's hash and the profile, and the
    // project's phases walk as child records under this one state.
    expect(place.records.endsWith("records")).toBe(true);
    expect(place.records).toContain("projects");
    expect(new Set([place.records, place.queue, place.tasks, place.slack, place.telegram, place.pid]).size).toBe(6);
    expect(profileOwnedDirectories("/amy", known.invoices!)).toEqual([place.records, place.queue, place.tasks, place.slack, place.telegram]);
    // One daemon: the pid is the profile's own, with the machine's old
    // location beside it while this profile changes shape.
    const pids = profileDaemonPids("/amy", known.invoices!);
    expect(pids).toEqual([place.pid, "/amy/daemon.pid"]);
    // The briefs ride the project's artifact root; its hash is path-safe.
    const hash = place.records.split(path.sep)[3]!;
    expect(hash).toHaveLength(43);
    expect(worktreeNamespace(known.invoices!)).toContain(hash);
  });

  it("shares the brief store through the project's artifact root, with no path named in the config", () => {
    const config = { ...DEFAULT_CONFIG, workflows: { invoices: { workflow: path.join(root, "workflow") } } };
    const known = profiles(config);
    const place = known.invoices!;

    // The project is one profile, so the store is one port: the brief the
    // brief phase wrote is read by the phases the calls run.
    expect(pluginSlices(config, place, "/amy")["@amykit/plugin-file-brief-store"]).toEqual({ directory: "briefs" });
    expect(JSON.stringify(config.workflows.invoices)).not.toContain("briefs");
    // The artifact root is where the store keeps it, and it is the project's.
    expect(hostPaths(config, "/amy", place).artifacts).toBe(hostPaths(config, "/amy", place).artifacts);
  });

  it("refuses a config that names one project as two profiles", () => {
    const config = {
      ...DEFAULT_CONFIG,
      workflows: {
        grooming: { workflow: path.join(root, "brief") },
        execution: { workflow: path.join(root, "workflow") },
      },
    };
    expect(() => profiles(config)).toThrow(/one profile/);
    expect(() => profiles(config)).toThrow(/grooming.*execution/s);
  });

  it("changes none of the layout for a packaged workflow, which declares its phases in its declaration", () => {
    const packaged = profiles({ ...DEFAULT_CONFIG, workflows: { tickets: { workflow: "@amykit/workflow-ticket-to-qa" } } });
    const place = profilePaths("/amy", packaged.tickets!);

    expect(packaged.tickets?.project).toBeUndefined();
    expect([place.records, place.queue, place.pid, place.log, place.tasks]).toEqual(
      ["/amy/tickets/records", "/amy/tickets/queue", "/amy/daemon.pid", "/amy/log", "/amy/tasks"],
    );
    expect(hostPaths(DEFAULT_CONFIG, "/amy", packaged.tickets!).artifacts).toBeUndefined();
    // The shipped workflows declare brief and prove absent, each with its
    // reason, and the walks their gates prove are unchanged by saying so.
    for (const shipped of [errand, noteToPlan, ticketToQa] as const) {
      expect((shipped.phases?.brief ?? "").length).toBeGreaterThan(20);
      expect((shipped.phases?.prove ?? "").length).toBeGreaterThan(20);
      expect(shipped.phases?.workflow).toBeUndefined();
    }
  });

  it("shows the phases a project walks and the reasons a declared-absent one gave", () => {
    const view = phasesOf({ root, phase: "workflow" }, { states: ["WORK", "DONE"], phases: { brief: "the work is its own brief" } });
    expect(view).toEqual([
      { phase: "brief", absent: true, reason: "the work is its own brief" },
      { phase: "work", absent: false, reason: null },
      { phase: "prove", absent: true, reason: null },
    ]);
    expect(phasesOf(undefined, undefined)).toBeUndefined();
  });
});

describe("the state a project's mounts share, and what cannot be overridden into sharing it", () => {
  const root = path.join("/projects", "invoices");
  const configFor = (overrides: Record<string, unknown> = {}): AmyConfig => ({
    ...DEFAULT_CONFIG,
    workflows: { invoices: { workflow: path.join(root, "workflow") } },
    plugins: overrides,
  });
  const expected = (message: string): Error => new Error(`${message} is shared across profiles and cannot be overridden for a project`);

  it("rejects global record, queue, worktree and brief-store overrides for a project", () => {
    const config = configFor({ "@amykit/plugin-file-store": { directory: "records-on-volume" } });
    expect(() => pluginSlices(config, profiles(config).invoices!, "/amy")).toThrow(expected("@amykit/plugin-file-store.directory"));
    const queue = configFor({ "@amykit/plugin-file-queue": { directory: "queue-on-volume" } });
    expect(() => pluginSlices(queue, profiles(queue).invoices!, "/amy")).toThrow(expected("@amykit/plugin-file-queue.directory"));
    const worktree = configFor({ "@amykit/plugin-file-worktree": { workflow: "shared-worktrees" } });
    expect(() => pluginSlices(worktree, profiles(worktree).invoices!, "/amy")).toThrow(expected("@amykit/plugin-file-worktree.workflow"));
    const briefs = configFor({ "@amykit/plugin-file-brief-store": { directory: "shared-on-volume" } });
    expect(() => pluginSlices(briefs, profiles(briefs).invoices!, "/amy")).toThrow(expected("@amykit/plugin-file-brief-store.directory"));
  });

  it("rejects a global tasks and Slack directory for a project that mounts them", () => {
    for (const plugin of ["@amykit/plugin-file-tasks", "@amykit/plugin-slack"] as const) {
      const config = configFor({ [plugin]: { directory: "shared-on-volume" } });
      expect(() => pluginSlices(config, profiles(config).invoices!, "/amy")).toThrow(expected(`${plugin}.directory`));
    }
  });

  it("lets a project that does not mount Telegram sit beside a Telegram directory an ordinary profile uses", () => {
    const config = configFor({ "@amykit/plugin-telegram": { directory: "shared-on-volume" } });
    expect(() => pluginSlices(config, profiles(config).invoices!, "/amy")).not.toThrow();
  });

  it("rejects a global Telegram directory for a project that mounts Telegram", () => {
    const config = {
      ...configFor({ "@amykit/plugin-telegram": { directory: "shared-on-volume" } }),
      extraPlugins: ["@amykit/plugin-telegram"],
    };
    expect(() => pluginSlices(config, profiles(config).invoices!, "/amy")).toThrow(expected("@amykit/plugin-telegram.directory"));
  });

  it("keeps prototype-named profiles as configured own entries", () => {
    const workflows: Record<string, { workflow: string }> = Object.create(null);
    workflows["__proto__"] = { workflow: path.join(root, "brief") };
    const known = profiles({ ...DEFAULT_CONFIG, workflows });
    expect(known["__proto__"]?.name).toBe("__proto__");
  });
});

describe("resolvePhases", () => {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), "amy-project-resolve-"));
  const root = path.join(base, "invoices");

  afterEach(() => fs.rmSync(base, { recursive: true, force: true }));

  it("refuses a phase that is neither a folder nor a declaration, and walks the phases it has or declared", () => {
    fs.mkdirSync(path.join(root, "workflow"), { recursive: true });
    const walking = resolvePhases(root, { prove: "a person reads the pull request" });
    expect(walking.problems.some((problem) => problem.includes("brief/"))).toBe(true);

    fs.mkdirSync(path.join(root, "brief"), { recursive: true });
    const resolved = resolvePhases(root, { prove: "a person reads the pull request" });
    expect(resolved.problems).toEqual([]);
    expect(resolved.walking.map((one) => one.phase)).toEqual(["brief", "workflow"]);
    expect(resolved.absent.prove).toBe("a person reads the pull request");
  });

  it("refuses a project whose work folder is gone without the declaration saying why", () => {
    const briefOnly = resolvePhases(path.join(base, "brief-only"), undefined);
    expect(briefOnly.problems.join("\n")).toContain("workflow/");
  });
});

describe("a project walks a row from brief through proof", () => {
  let base: string;
  let home: string;
  let project: string;

  const services = (): AssemblyServices => ({
    runner: { run: async () => ({ ok: true, exitCode: 0, stdout: "", stderr: "" }) },
    load: (specs: readonly string[]) => {
      const fromHome = pluginsRootResolver(home, path.join(home, "plugins"));
      return load(specs, (spec) => isFilesystemWorkflow(spec) ? fromHome(spec) : spec);
    },
    log: (file: string) => new FileEventLog(file),
    host: [],
  });

  beforeEach(() => {
    base = fs.mkdtempSync(path.join(os.tmpdir(), "amy-project-walk-"));
    home = path.join(base, ".amy");
    project = path.join(base, "invoices");
    fs.mkdirSync(home, { recursive: true });
  });

  afterEach(() => fs.rmSync(base, { recursive: true, force: true }));

  it("drives one record BRIEF, WORK, PROVE; a refused proof returns it to WORK carrying what did not hold", async () => {
    writePluginFile(path.join(project, "brief"), fixturePhaseModule("invoices-brief", {
      states: ["GROOMING", "BRIEFED"],
      terminal: ["BRIEFED"],
      decide: "march",
      output: { BRIEFED: { criteria: ["product", "interface"] } },
    }));
    writePluginFile(path.join(project, "workflow"), fixturePhaseModule("invoices-work", { states: ["OPENED"], terminal: ["OPENED"], decide: "settled" }));
    writePluginFile(path.join(project, "prove"), fixturePhaseModule("invoices-prove", {
      states: ["CHECKED"],
      terminal: ["refused", "SATISFIED"],
      decide: "refuse-then-hold",
      takes: { criteria: { type: "string[]", required: true, description: "what this proof must show" } as ConfigField },
      output: { refused: { criteria: [], held: false }, SATISFIED: { criteria: ["product", "interface"], held: true } },
    }));
    const spec = path.join(project, "workflow");
    const config: AmyConfig = { ...DEFAULT_CONFIG, notify: { hermes: null, inbox: false }, workflows: { invoices: { workflow: spec, plugins: mountsFor(spec) } } };
    const profile = profiles(config, home).invoices!;
    const assembled = await assembleProfile(home, config, profile, services());
    if (!assembled.ok) throw new Error(assembled.problems.join("; "));

    // The row is named the way an operator names it: on the queue, by hand.
    const queue = new FileQueue(profilePaths(home, profile).queue);
    queue.enqueue({ workId: "invoices", reason: "said in passing" }, new Date());

    const records = new FileStore<WorkRecord>(profilePaths(home, profile).records);
    let walked = records.load("invoices");
    for (let tick = 0; tick < 40 && walked?.state !== "DONE"; tick++) {
      await assembled.engine.discover();
      await assembled.engine.tick();
      walked = records.load("invoices");
    }
    expect(walked?.state).toBe("DONE");

    // The walk's own transitions — the record moved through its phases, and
    // the first refused proof sent it back to WORK, once.
    expect((walked!.history ?? []).map((edge) => `${edge.from} → ${edge.to}`)).toEqual([
      "BRIEF → WORK",
      "WORK → PROVE",
      "PROVE → WORK",
      "WORK → PROVE",
      "PROVE → PROOF_COMPLETE",
      "PROOF_COMPLETE → DONE",
    ]);
    // What the brief returned is on the record, and the proof was handed
    // exactly that: the criteria the brief settled.
    expect((walked as unknown as { brief?: unknown }).brief).toEqual({ criteria: ["product", "interface"] });
    const proved = Object.values(walked!.calls ?? {}).map((child) => child as WorkRecord & { input?: unknown })
      .filter((child) => child.id.includes("PROVE"))
      .map((child) => child.input);
    expect(proved).toEqual([
      { criteria: ["product", "interface"] },
      { criteria: ["product", "interface"] },
    ]);
    // What the proof said it did not hold is on the record too, carried back.
    expect((walked as unknown as { prove?: { held?: boolean } }).prove?.held).toBe(true);
  });

  it("refuses the walk at the mount when the project's proof folder is missing and its declaration says nothing", async () => {
    writePluginFile(path.join(project, "brief"), fixturePhaseModule("invoices-brief2", { states: ["BRIEFED"], terminal: ["BRIEFED"], decide: "settled" }));
    writePluginFile(path.join(project, "workflow"), fixturePhaseModule("invoices-work", { states: ["OPENED"], terminal: ["OPENED"], decide: "settled" }));
    const spec = path.join(project, "workflow");
    const config: AmyConfig = { ...DEFAULT_CONFIG, notify: { hermes: null, inbox: false }, workflows: { invoices: { workflow: spec, plugins: mountsFor(spec) } } };
    const profile = profiles(config, home).invoices!;
    const assembled = await assembleProfile(home, config, profile, services());
    expect(assembled.ok).toBe(false);
    expect(problems(assembled).join("\n")).toContain("prove/");
  });
});

/** The config one assembled test drives: every profile the list names, with the folder spec. */
async function assembledFor(
  base: string,
  home: string,
  workflows: AmyConfig["workflows"],
): Promise<Awaited<ReturnType<typeof assembleProfile>>> {
  const config: AmyConfig = { ...DEFAULT_CONFIG, notify: { hermes: null, inbox: false }, workflows };
  const profile = profiles(config, home)[Object.keys(workflows)[0]!]!;
  return assembleProfile(home, config, profile, {
    runner: { run: async () => ({ ok: true, exitCode: 0, stdout: "", stderr: "" }) },
    load: (specs: readonly string[]) => {
      const fromHome = pluginsRootResolver(home, path.join(home, "plugins"));
      return load(specs, (spec) => isFilesystemWorkflow(spec) ? fromHome(spec) : spec);
    },
    log: (file: string) => new FileEventLog(file),
    host: [],
  });
}

/** Writes one phase folder's module: an index importing the built core it declares with. */
function writePluginFile(directory: string, text: string): string {
  fs.mkdirSync(directory, { recursive: true });
  fs.writeFileSync(path.join(directory, "index.js"), text, "utf-8");
  return directory;
}

/**
 * A phase module as a project folder carries it: a `defineWorkflow` declaration
 * whose walk is its own. `decide` sizes the decisions: `settled` settles its
 * one look, `march` moves down the states, `refuse-then-hold` refuses once
 * then holds.
 */
function fixturePhaseModule(
  name: string,
  spec: {
    readonly states: readonly string[];
    readonly terminal: readonly string[];
    readonly decide: "settled" | "march" | "refuse-then-hold";
    readonly output?: Readonly<Record<string, unknown>>;
    readonly takes?: Record<string, ConfigField>;
    readonly schema?: Record<string, ConfigField>;
    readonly phases?: Readonly<Record<string, string>>;
  },
): string {
  const decisions: string[] = [];
  spec.states.forEach((state, at) => {
    if (spec.decide === "settled") {
      decisions.push(`${state}: () => ({ kind: "settled", why: "fixture" })`);
    } else if (spec.decide === "march") {
      const next = spec.states[at + 1] ?? spec.states.find((end) => spec.terminal.includes(end))!;
      decisions.push(`${state}: () => ({ kind: "advance", to: ${JSON.stringify(next)}, effects: [], why: "the phase moves on" })`);
    } else {
      decisions.push(`${state}: () => { drove += 1; return { kind: "advance", to: drove === 1 ? "refused" : "SATISFIED", effects: [], why: drove === 1 ? "the criteria are not shown yet" : "every criterion holds" }; }`);
    }
  });
  const counter = spec.decide === "refuse-then-hold" ? "let drove = 0;\n" : "";
  return `import { defineWorkflow } from ${JSON.stringify(CORE_ENTRY)};
${counter}
export const plugin = defineWorkflow({
  name: ${JSON.stringify(name)},
  pluginName: "workflow-${name}",
  states: ${JSON.stringify(spec.states)},
  terminal: ${JSON.stringify(spec.terminal)},
  configSchema: ${JSON.stringify(spec.schema ?? {})},
  ${spec.takes ? `input: ${JSON.stringify(spec.takes)},\n  ` : ""}${spec.phases ? `phases: ${JSON.stringify(spec.phases)},\n  ` : ""}policy: {},
  needs: {},
  record: () => ({}),
  discover: async () => [],
  observe: async () => ({}),
  actions: {},
  ${spec.output ? `output: { ${Object.entries(spec.output).map(([end, returns]) => `${JSON.stringify(end)}: () => (${JSON.stringify(returns)})`).join(", ")} },\n  ` : ""}decide: { ${decisions.join(", ")} },
});
`;
}