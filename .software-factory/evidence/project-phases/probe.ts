// The `project-phases` gate's scenario drive, as the built assembly sees it:
// a project laid out as `brief/`, `workflow/` and `prove/` is ONE profile
// whose workflow amy derives from the folders, and the run's manifest credits
// whoever invoked the harness, never the harness itself. A phase exporting
// no `defineWorkflow` is refused by name; a packaged workflow keeps the
// layout it always had and declares its phases.
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { pathToFileURL } from "node:url";
import type { Plugin, WorkRecord } from "@amykit/core";
import type { AmyConfig, WorkflowProfile } from "../../../packages/cli/src/config.js";
import type { Profile } from "../../../packages/cli/src/profiles.js";
import { FileQueue } from "@amykit/plugin-file-queue";
import { FileStore } from "@amykit/plugin-file-store";

/** The nth argument the scenario passed, or a usage line and an exit. */
function argument(n: number): string {
  const value = process.argv[2 + n];
  if (value !== undefined) return value;
  console.error("usage: probe.ts <work> <dist> <report> <repo>");
  process.exit(2);
}

/** A value the run cannot go on without, or a failure naming it. */
function must<T>(value: T | undefined, what: string): T {
  if (value === undefined) throw new Error(`no ${what}`);
  return value;
}

const [work, dist, report, repo] = [argument(0), argument(1), argument(2), argument(3)];
const from = (name: string): Promise<unknown> => import(pathToFileURL(path.join(dist, name)).href);
const { assembleProfile } = (await from("assemble.js")) as typeof import("../../../packages/cli/src/assemble.js");
const { DEFAULT_CONFIG } = (await from("config.js")) as typeof import("../../../packages/cli/src/config.js");
const { isFilesystemWorkflow, load, pluginsRootResolver } = (await from("loader.js")) as typeof import("../../../packages/cli/src/loader.js");
const { profilePaths } = (await from("paths.js")) as typeof import("../../../packages/cli/src/paths.js");
const { profiles } = (await from("profiles.js")) as typeof import("../../../packages/cli/src/profiles.js");
const { phasesOf } = (await from("project.js")) as typeof import("../../../packages/cli/src/project.js");
const { FileEventLog }: typeof import("@amykit/plugin-file-log") = await import("@amykit/plugin-file-log");

const assertions: { type: string; status: "passed" | "failed" }[] = [];
const record = (type: string, ok: boolean): number => assertions.push({ type, status: ok ? "passed" : "failed" });
const attempt = async (type: string, check: () => Promise<boolean>): Promise<void> => {
  try { record(type, await check()); } catch (error) { console.error(`${type}: ${error instanceof Error ? error.message : String(error)}`); record(type, false); }
};

const home = path.join(work, ".amy");
const project = path.join(work, "invoices");
fs.mkdirSync(home, { recursive: true });

/** How a phase module's import of the core resolves at all: the copy the dist was built from, by absolute URL. */
const coreEntry = pathToFileURL(path.join(repo, "node_modules", "@amykit", "core", "dist", "index.js")).href;

/**
 * A phase directory as somebody writes one: an index exporting a declared
 * workflow, written in TypeScript, published beside this probe, and read
 * by the absolute URL of the core it imports — a scratch tree resolves no
 * package of its own.
 */
function phase(fixture: string, directory: string, core: string = coreEntry): string {
  const published = spawnSync(path.join(repo, "node_modules", ".bin", "tsx"), [path.join(import.meta.dirname, "..", "lib", "publish.ts"), path.join(import.meta.dirname, fixture), directory], {
    encoding: "utf-8",
  });
  if (published.status !== 0) throw new Error(`publishing ${fixture} failed: ${published.stderr}`);
  const entry = path.join(directory, "index.js");
  fs.writeFileSync(entry, fs.readFileSync(entry, "utf-8").replaceAll(`from "@amykit/core"`, `from ${JSON.stringify(core)}`), "utf-8");
  return directory;
}

const mounts = (workflow: string): string[] => [
  "@amykit/plugin-file-queue", "@amykit/plugin-file-store", "@amykit/plugin-file-brief-store",
  workflow, "@amykit/plugin-notify-fanout", "@amykit/plugin-serial-engine",
];
const configured = (workflows: Record<string, WorkflowProfile>): AmyConfig => ({
  ...DEFAULT_CONFIG,
  notify: { hermes: null, inbox: false },
  workflows: Object.fromEntries(Object.entries(workflows).map(([name, entry]) => [name, { ...entry, plugins: mounts(entry.workflow) }])),
});

const services = {
  runner: { run: async () => ({ ok: true, exitCode: 0, stdout: "", stderr: "" }) },
  load: (specs: readonly string[]) => {
    const fromHome = pluginsRootResolver(home, path.join(home, "plugins"));
    return load(specs, (spec) => isFilesystemWorkflow(spec) ? fromHome(spec) : spec);
  },
  log: (file: string) => new FileEventLog(file),
  host: [],
};
const mountedAs = async (config: AmyConfig, name: string) => assembleProfile(home, config, must(profiles(config, home)[name], name), services);

// The walk is what the assertions read: the machine's engine advances the
// row until it is over, one move per tick, exactly as a running loop would.
interface Driver { readonly ok: boolean; readonly engine?: { discover(): Promise<unknown>; tick(): Promise<unknown> } }
interface RecordsView { load(id: string): WorkRecord | null | undefined }
const walkUntilDone = async (assembled: Driver, records: RecordsView, id: string): Promise<WorkRecord> => {
  if (!assembled.ok || !assembled.engine) throw new Error("the machine did not assemble, so nothing drove");
  let walked = records.load(id);
  for (let tick = 0; tick < 60 && walked?.state !== "DONE"; tick++) {
    await assembled.engine.discover();
    await assembled.engine.tick();
    walked = records.load(id);
  }
  return must(walked ?? undefined, "the walked record");
};

// 0. A packaged workflow is not a phase, and keeps the layout it always had.
const packaged = must(profiles(configured({ tickets: { workflow: "@amykit/workflow-ticket-to-qa" } }), home).tickets, "tickets");
record("project.a_packaged_workflow_is_unchanged",
  packaged.project === undefined
  && profilePaths(home, packaged).records === path.join(home, "tickets", "records")
  && profilePaths(home, packaged).pid === path.join(home, "daemon.pid"));

// An old profile of the same name left records behind; the project reads none of them.
fs.mkdirSync(path.join(home, "execution", "records"), { recursive: true });
fs.writeFileSync(path.join(home, "execution", "records", "OLD-1.json"), "{}\n", "utf-8");

// 1. The project: its three folders published, one config entry naming the
// walk's folder. The brief settles the criteria; the proof refuses what it
// was handed the first round and holds the second, which is what walks the
// row back to WORK before DONE.
await attempt("project.the_three_phases_walk_as_one", async () => {
  phase("phase-brief", path.join(project, "brief"));
  phase("phase-work", path.join(project, "workflow"));
  phase("phase-prove", path.join(project, "prove"));
  const config = configured({ invoices: { workflow: path.join(project, "workflow") } });
  const profile = must(profiles(config, home).invoices, "invoices");
  const assembled = await mountedAs(config, "invoices");
  if (!assembled.ok) throw new Error(assembled.problems.join("; "));

  // The row is named the way an operator names it: on the queue, by hand.
  const records = new FileStore<WorkRecord>(profilePaths(home, profile).records);
  new FileQueue(profilePaths(home, profile).queue).enqueue({ workId: "INVOICE-1", reason: "said in passing" }, new Date());
  const walked = await walkUntilDone(assembled, records, "INVOICE-1");

  // The walk's own transitions: every phase in order, the refused proof
  // carrying the row back to WORK once, and DONE only at the end.
  const went = (walked.history ?? []).map((edge) => `${edge.from} -> ${edge.to}`);
  const wanted = ["BRIEF -> WORK", "WORK -> PROVE", "PROVE -> WORK", "WORK -> PROVE", "PROVE -> PROOF_COMPLETE", "PROOF_COMPLETE -> DONE"];
  if (JSON.stringify(went) !== JSON.stringify(wanted)) throw new Error(`the walk went ${went.join(", ")}`);
  // The phases ran as child records of the row, one per round it entered.
  const entered = Object.keys(walked.calls ?? {});
  if (entered.length < 5 || !entered.some((id) => id.includes("BRIEF")) || !entered.some((id) => id.includes("WORK")) || !entered.some((id) => id.includes("PROVE"))) {
    throw new Error(`the phases left child records ${entered.join(", ")}`);
  }
  return walked.state === "DONE";
});

await attempt("project.what_was_briefed_is_what_is_proven", async () => {
  const config = configured({ invoices: { workflow: path.join(project, "workflow") } });
  const profile = must(profiles(config, home).invoices, "invoices");
  const records = new FileStore<WorkRecord & { brief?: unknown }>(profilePaths(home, profile).records);
  const walked = must(records.load("INVOICE-1"), "the walked record") as WorkRecord & { brief?: unknown };
  const briefed = walked.brief;
  if (JSON.stringify(briefed) !== JSON.stringify({ criteria: ["product", "interface"] })) {
    throw new Error(`the brief returned ${JSON.stringify(briefed)}`);
  }
  // The proving phase was handed exactly what the brief settled, at every
  // round it ran; nothing else was ever its input.
  const handed = Object.values(walked.calls ?? {})
    .map((child) => child as WorkRecord & { input?: unknown })
    .filter((child) => child.id.includes("PROVE"))
    .map((child) => JSON.stringify(child.input));
  if (handed.length !== 2 || handed.some((one) => one !== JSON.stringify(briefed))) {
    throw new Error(`the proof was handed ${handed.join(", ")}`);
  }
  return true;
});


// 1b. A phase that resolves a core of its own mounts. An install always holds
// several copies of the core, and 0.7.0 marked a port need with a symbol only
// the copy that made it could read: every project whose phase asked for a
// port refused to mount. The phases above share the CLI's copy, so they could
// not see it; this one imports a second copy, the way a phase folder with its
// own node_modules does.
await attempt("project.a_phase_with_its_own_core_mounts", async () => {
  // Under node_modules, so the copy's own imports resolve.
  const second = path.join(repo, "node_modules", `.second-core-${process.pid}`);
  const original = fs.realpathSync(path.join(repo, "node_modules", "@amykit", "core"));
  fs.mkdirSync(second, { recursive: true });
  fs.cpSync(path.join(original, "dist"), path.join(second, "dist"), { recursive: true });
  fs.copyFileSync(path.join(original, "package.json"), path.join(second, "package.json"));
  try {
    const own = path.join(work, "own-core");
    phase("phase-brief", path.join(own, "brief"));
    phase("phase-work", path.join(own, "workflow"));
    phase("phase-prove-own-core", path.join(own, "prove"), pathToFileURL(path.join(second, "dist", "index.js")).href);
    const assembled = await mountedAs(configured({ owncore: { workflow: path.join(own, "workflow") } }), "owncore");
    if (!assembled.ok) throw new Error(assembled.problems.join("; "));
    return true;
  } finally {
    fs.rmSync(second, { recursive: true, force: true });
  }
});

// 2. One project, one profile: its state is the project's own, nothing in
// the config names a directory, and none of it escapes Amy home.
const config = configured({ invoices: { workflow: path.join(project, "workflow") } });
const profileNamed = (name: string): Profile => must(profiles(config, home)[name], name);
record("project.no_config_names_a_shared_directory", !JSON.stringify(config).includes("briefs"));
const place = profilePaths(home, profileNamed("invoices"));
record("project.no_phase_state_escapes_home",
  [place.records, place.queue, place.tasks, place.slack, place.telegram, place.pid, place.log].every((dir) => dir !== undefined && path.relative(home, dir as string).startsWith("..") === false));
record("project.a_phase_never_reads_an_old_profiles_records",
  place.records !== path.join(home, "execution", "records") && !fs.readFileSync(path.join(home, "execution", "records", "OLD-1.json"), "utf-8").includes("INVOICE"));

// 3. A work phase that declares the phases it does not have: the project
// mounts, and the status the operator drives says why the phase is out.
// A second project, because a module this process imported stays imported.
await attempt("project.a_declared_absent_phase_says_why_at_the_status", async () => {
  const payroll = path.join(work, "payroll");
  phase("phase-declared", path.join(payroll, "workflow"));
  const declared = configured({ payroll: { workflow: path.join(payroll, "workflow") } });
  const payrollProfile = must(profiles(declared, home).payroll, "payroll");
  const assembled = await mountedAs(declared, "payroll");
  if (!assembled.ok) throw new Error(assembled.problems.join("; "));
  const walk = must(assembled.mounted.workflow, "the walk");
  const view = phasesOf(payrollProfile.project, walk as { states: readonly string[]; phases?: Record<string, string> });
  if (!JSON.stringify(view).includes("the ticket itself says what the work is")) {
    throw new Error(`the walk's phases said too little: ${JSON.stringify(view)}`);
  }

  // The status command is the machine's own: the config is read from Amy
  // home, so the file carries the profile that mounts the plugins.
  const pluginsRoot = path.join(home, "plugins", "node_modules", "@amykit");
  fs.mkdirSync(pluginsRoot, { recursive: true });
  for (const name of ["plugin-file-queue", "plugin-file-store", "plugin-file-brief-store", "plugin-notify-fanout", "plugin-serial-engine"]) {
    fs.symlinkSync(path.join(repo, "node_modules", "@amykit", name), path.join(pluginsRoot, name));
  }
  fs.writeFileSync(path.join(home, "config.yaml"), JSON.stringify(declared), "utf-8");
  const asked = spawnSync(process.execPath, [path.join(dist, "index.js"), "--workflow", "payroll", "status", "--json"], {
    env: { ...process.env, AMY_HOME: home }, encoding: "utf-8",
  });
  fs.rmSync(path.join(home, "config.yaml"), { force: true });
  if (asked.status !== 0) throw new Error(`status failed: ${asked.stderr}`);
  const phases = (JSON.parse(asked.stdout) as { phases?: { phase: string; absent: boolean; reason: string | null }[] }).phases ?? [];
  if (phases.length !== 3) throw new Error(`the status named ${phases.length} phases`);
  const one = (phase: string): { absent: boolean; reason: string | null } => must((phases.find((each) => each.phase === phase)), phase);
  return !one("work").absent
    && one("brief").absent && one("brief").reason === "the ticket itself says what the work is, so no brief phase runs first"
    && one("prove").absent && one("prove").reason === "a person reads the pull request the work opens, so no proving phase runs at all";
});

// 4. A phase that exports no declared workflow is refused at the walk's
// mount, by its directory: the walk calls its phases, and a call needs the
// declaration a mount does not. The anchor declares only its proving phase
// out, so the refusal names the brief, not the phase that is absent. A
// third project, for the module cache's sake.
await attempt("project.a_phase_without_a_workflow_is_refused_by_name", async () => {
  const staff = path.join(work, "staff");
  phase("phase-declare-prove", path.join(staff, "workflow"));
  phase("phase-without-workflow", path.join(staff, "brief"));
  const config = configured({ staff: { workflow: path.join(staff, "workflow") } });
  const assembled = await mountedAs(config, "staff");
  return !assembled.ok && assembled.problems.some((problem) => problem.includes("brief/"));
});

// 5. The shipped workflows declare the phases they do not have, each with
// its reason, and the walk their gates prove is unchanged by saying so.
// Read the way the loader reads them: the diagram beside the package's own
// entry is what gives the workflow its states.
const { drawn } = (await from("drawn.js")) as typeof import("../../../packages/cli/src/drawn.js");
await attempt("project.a_packaged_workflow_declares_its_phases", async () => {
  const declared = await Promise.all(["@amykit/workflow-errand", "@amykit/workflow-note-to-plan", "@amykit/workflow-ticket-to-qa"].map(async (name) => {
    const packageRoot = fs.realpathSync(path.join(repo, "node_modules", ...name.split("/")));
    const raw = ((await import(name)) as { plugin: { phases?: Record<string, string>; workflow?: { states: readonly string[]; terminalStates: readonly string[] } } }).plugin;
    const plugin = drawn(raw as unknown as Plugin, pathToFileURL(path.join(packageRoot, "dist", "index.js")).href) as { phases?: Record<string, string>; workflow?: { states: readonly string[]; terminalStates: readonly string[] } };
    return [plugin.phases ?? {}, plugin.workflow?.states ?? [], plugin.workflow?.terminalStates ?? []] as const;
  }));
  return declared.every(([ phases, states, terminal ]) =>
    (phases.brief ?? "").length > 20
    && (phases.prove ?? "").length > 20
    && phases.workflow === undefined
    // The walk their own gates prove: the shipped workflows' end is their
    // own, and none of its states is a project phase's name.
    && !states.includes("BRIEF") && !states.includes("WORK") && !states.includes("PROVE")
    && terminal.length > 0);
});

const failed = assertions.filter((a) => a.status !== "passed");

fs.writeFileSync(
  report,
  `${JSON.stringify(
    {
      scenario: "project-phases",
      status: failed.length === 0 ? "passed" : "failed",
      goal:
        "I keep one project as brief, work and proof: its folders mount as the one profile whose workflow amy derives from them, a row walks from BRIEF through WORK and PROVE as child records, the proof is handed exactly the criteria the brief settled, and a refused proof carries the row back to WORK. A phase declared absent says at the status why it is out; a phase exporting no declared workflow is refused by its directory; a packaged workflow keeps the layout it always had and declares its phases; and the project's records, queue, tasks and threads live under one project state, with no path in the config and none of it outside Amy home.",
      artifact: { package: "@amykit/cli", entry: "dist/assemble.js" },
      observed: {
        assertions_run: assertions.length,
        assertions_failed: failed.length,
        node: process.version,
      },
      assertions,
    },
    null,
    2,
  )}\n`,
  "utf-8",
);

console.log(`${assertions.length - failed.length}/${assertions.length} assertions passed`);
if (failed.length > 0) {
  for (const a of failed) console.error(`FAILED ${a.type}`);
  process.exit(1);
}