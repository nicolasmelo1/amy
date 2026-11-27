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
import { FileBriefStore } from "@amykit/plugin-file-brief-store";
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
  // A published phase is an ES module, as npm would ship one: without this a
  // scratch directory's `.js` is read as CommonJS, and the resolver behind
  // that reads the workspace core as a package with no `require` entry.
  fs.writeFileSync(path.join(directory, "package.json"), JSON.stringify({ type: "module" }), "utf-8");
  // A phase that calls a shipped workflow needs that workflow's diagram
  // beside it: the package's own entry carries none under a scratch import.
  fs.copyFileSync(path.join(repo, "examples", "workflow-ticket-to-qa", "workflow.mmd"), path.join(directory, "shipped.mmd"));
  const shipped = pathToFileURL(fs.realpathSync(path.join(repo, "node_modules", "@amykit", "workflow-ticket-to-qa", "dist", "index.js"))).href;
  fs.writeFileSync(entry, fs.readFileSync(entry, "utf-8")
    .replaceAll(`from "@amykit/core"`, `from ${JSON.stringify(core)}`)
    .replaceAll(`from "@amykit/workflow-ticket-to-qa"`, `from ${JSON.stringify(shipped)}`), "utf-8");
  return directory;
}

const mounts = (workflow: string, ...beside: string[]): string[] => [
  "@amykit/plugin-file-queue", "@amykit/plugin-file-store", "@amykit/plugin-file-brief-store",
  workflow, "@amykit/plugin-notify-fanout", "@amykit/plugin-serial-engine",
  ...beside,
];
const configured = (workflows: Record<string, WorkflowProfile>): AmyConfig => ({
  ...DEFAULT_CONFIG,
  notify: { hermes: null, inbox: false },
  workflows: Object.fromEntries(Object.entries(workflows).map(([name, entry]) => [name, { ...entry, plugins: mounts(entry.workflow) }])),
});

const services = {
  // git runs for real — the phase's change has to be a commit — and every
  // other command is the stand-in this scenario has always used.
  runner: {
    run: async (command: string, args: readonly string[], options: { cwd?: string } = {}) => {
      if (command !== "git") return { ok: true, exitCode: 0, stdout: "", stderr: "" };
      const ran = spawnSync(command, args, { cwd: options.cwd, encoding: "utf-8" });
      return { ok: ran.status === 0, exitCode: ran.status, stdout: ran.stdout ?? "", stderr: ran.stderr ?? "" };
    },
  },
  load: (specs: readonly string[]) => {
    const fromHome = pluginsRootResolver(home, path.join(home, "plugins"), "");
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


/** A standing checkout and a bare origin, so a phase can branch, commit and push. */
function standingCheckout(briefed: string): { workspace: string; standing: string } {
  const workspace = path.join(briefed, "workspace");
  const standing = path.join(workspace, "acme", "invoices");
  const origin = path.join(workspace, "acme", "invoices.git");
  const gitIn = (cwd: string, args: readonly string[]): void => {
    const ran = spawnSync("git", args, { cwd, encoding: "utf-8" });
    if (ran.status !== 0) throw new Error(`git ${args.join(" ")} failed: ${ran.stderr}`);
  };
  fs.mkdirSync(standing, { recursive: true });
  gitIn(standing, ["init", "-b", "main"]);
  // The identity every worktree cut from this checkout commits under: a CI
  // runner may have none, and a phase that cannot commit never reaches its review.
  gitIn(standing, ["config", "user.email", "evidence@amy.test"]);
  gitIn(standing, ["config", "user.name", "amy"]);
  fs.writeFileSync(path.join(standing, "README.md"), "invoices\n", "utf-8");
  gitIn(standing, ["add", "."]);
  gitIn(standing, ["-c", "user.email=evidence@amy.test", "-c", "user.name=amy", "commit", "-m", "start"]);
  fs.mkdirSync(origin, { recursive: true });
  gitIn(origin, ["init", "--bare", "-b", "main"]);
  gitIn(standing, ["remote", "add", "origin", origin]);
  gitIn(standing, ["push", "-u", "origin", "main"]);
  return { workspace, standing };
}

/** The team the shipped workflow asks for before it looks at a ticket. */
function writeRoster(records: string): void {
  fs.mkdirSync(path.dirname(records), { recursive: true });
  fs.writeFileSync(path.join(path.dirname(records), "roster.yaml"), [
    `confirmedOn: "${new Date().toISOString().slice(0, 10)}"`,
    "reviewers:",
    '  - host: "ada"',
    '    tracker: "ada"',
    "    available: in",
    "qa:",
    '  host: "ada"',
    '  tracker: "ada"',
    "  available: in",
    "",
  ].join("\n"), "utf-8");
}

/** Every prompt the stand-in agent was asked, as it was asked. */
function saidIn(file: string): { workId: string; step: string; prompt: string }[] {
  const said = fs.existsSync(file) ? fs.readFileSync(file, "utf-8") : "";
  return said.split("\n").filter(Boolean).map((line) => JSON.parse(line) as { workId: string; step: string; prompt: string });
}

/** One move per tick, as the daemon's next poll would make it. */
async function walkToReview(engine: { tick(): Promise<unknown> }, queue: FileQueue, said: string): Promise<void> {
  queue.enqueue({ workId: "INVOICE-2", reason: "groomed" }, new Date());
  for (let tick = 0; tick < 120 && !(fs.existsSync(said) && fs.readFileSync(said, "utf-8").includes('"step":"self-review"')); tick++) {
    queue.enqueue({ workId: "INVOICE-2", reason: "look" }, new Date());
    await engine.tick();
  }
}

/** What a project's walk says when it stops short of the step it was meant to reach. */
function shortfall(records: FileStore<WorkRecord>, steps: string, log?: string): string {
  const why = log && fs.existsSync(log)
    ? fs.readFileSync(log, "utf-8").split("\n").filter((line) => /failed|error/i.test(line)).slice(-3).join("\n")
    : "";
  const walked = records.load("INVOICE-2");
  const child = (walked?.calls ?? {})["INVOICE-2/WORK#1"];
  return `state ${walked?.state}, work ${String(child?.state ?? "none")}, attempts ${JSON.stringify(child?.attempts ?? {})}, steps ${steps || "none"}${why ? `\n${why}` : ""}`;
}

// 1a. A unit groomed under its own id, walked by the shipped workflow: the
// brief the GROOMED gate judged green is the brief the real ticket-to-qa
// reads at triage, and the one its review reads again. The ticket names a
// parent brief through its `briefId`, and both are stored, so the run proves
// the unit's own is read ahead of it — and that a project's phase, whose
// record is named for the call, resolves the unit's brief rather than its own.
await attempt("project.the_brief_the_gate_judged_reaches_the_work_triage", async () => {
  const briefed = path.join(work, "briefed");
  phase("phase-brief-declares", path.join(briefed, "brief"));
  // The work half is the shipped package itself, not a stand-in.
  phase("phase-triage", path.join(briefed, "workflow"));
  phase("plugin-project-world", path.join(briefed, "world"));
  const config = configured({ briefed: { workflow: path.join(briefed, "workflow"), settings: { repos: ["acme/invoices"], repliesOn: ["tracker"], qaStatusName: "In QA", escalation: { scale: { patient: 3, normal: 2, immediate: 1 }, rungs: 3, origins: { gate: { level: "normal", beyond: "immediate", findingsAt: 3 }, thread: { level: "normal", beyond: "immediate", findingsAt: 3 }, "self-review": { level: "normal", beyond: "immediate", findingsAt: 3 }, owner: { level: "immediate" } } } } } });
  config.workflows.briefed = {
    ...config.workflows.briefed!,
    plugins: mounts(path.join(briefed, "workflow"), path.join(briefed, "world"), "@amykit/plugin-file-worktree"),
  };
  const { workspace, standing } = standingCheckout(briefed);
  config.plugins["@amykit/plugin-file-worktree"] = {
    workspaceRoot: workspace,
    root: path.join(briefed, "trees"),
    repos: ["acme/invoices"],
    checkouts: { "acme/invoices": standing },
  };
  const profile = must(profiles(config, home).briefed, "briefed");
  const artifacts = must(profilePaths(home, profile).artifacts, "the project's artifact root");
  const records = new FileStore<WorkRecord>(profilePaths(home, profile).records);
  writeRoster(profilePaths(home, profile).records);
  const store = new FileBriefStore(path.join(artifacts, "briefs"));
  // The brief the project groomed, under the unit's own id, and the
  // feature-level brief the ticket's briefId names, beside it.
  await store.write({
    id: "INVOICE-2",
    sections: [{ name: "Goal", body: "Every invoice line is in the currency the customer pays in." }],
    explains: ["INVOICE-2"],
    at: new Date().toISOString(),
  });
  await store.write({
    id: "invoice-currency",
    sections: [{ name: "Goal", body: "The feature brief says one currency on every invoice line." }],
    explains: ["INVOICE-2"],
    at: new Date().toISOString(),
  });

  const triage = path.join(briefed, "triage.ndjson");
  process.env.AMY_EVIDENCE_TRIAGE_LOG = triage;
  const assembled = await mountedAs(config, "briefed");
  if (!assembled.ok) throw new Error(assembled.problems.join("; "));
  const engine = must(assembled.engine ?? undefined, "the walk's engine");
  await walkToReview(engine, new FileQueue(profilePaths(home, profile).queue), triage);

  const entries = saidIn(triage);
  const at = (step: string) => entries.find((entry) => entry.step === step);
  const unit = "Every invoice line is in the currency the customer pays in.";
  const parent = "The feature brief says one currency on every invoice line.";
  const triageAsked = at("triage");
  if (!triageAsked?.prompt.includes(unit)) throw new Error(`triage was asked ${shortfall(records, entries.map((entry) => entry.step).join(","), profilePaths(home, profile).log)}`);
  if (triageAsked.prompt.includes(parent)) throw new Error(`triage read the parent's brief: ${triageAsked.prompt}`);
  // The review the project's own walk reached reads the same brief, under the
  // unit's work id, and calls it the brief the ticket is worked against.
  const reviewAsked = at("self-review");
  if (!reviewAsked) throw new Error(`self-review was asked nothing (${shortfall(records, entries.map((entry) => entry.step).join(","), profilePaths(home, profile).log)})`);
  if (!reviewAsked.prompt.includes(unit) || reviewAsked.prompt.includes(parent)) throw new Error(`self-review read another brief: ${reviewAsked.prompt}`);
  if (!reviewAsked.prompt.includes("The current brief this ticket is worked against:")) throw new Error(`self-review did not call the brief its own: ${reviewAsked.prompt}`);
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