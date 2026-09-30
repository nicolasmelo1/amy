#!/bin/sh
# The `project-phases` gate's scenario, as a repeatable run.
#
# Usage: project-phases-scenario.sh [report-path]
#
# Lays out one project as `brief/`, `workflow/` and `test/`, and mounts every
# phase through the *built* CLI assembly from a separate process, with a config
# naming the workflows, two models and two budgets, and no directory. The unit
# tests prove the pieces; this proves execution reads the brief grooming wrote.
#
# Emits the report that .software-factory/evidence/project-phases.json cites.
#
# A harness, not the actor. Who invokes it is what the manifest's `actor`
# records, and L3.GATE_HAS_FRESH_EVIDENCE refuses a manifest that credits the
# run to the harness itself.
set -eu

report=${1:-.software-factory/evidence/project-phases-run.json}
repo=$(cd "$(dirname "$0")/../.." && pwd)
dist="$repo/packages/cli/dist"
test -f "$dist/assemble.js" || { echo "build it first: npm run build" >&2; exit 1; }

work=$(mktemp -d)
trap 'rm -rf "$work"' EXIT

node --input-type=module - "$work" "$dist" "$report" "$repo" <<'PROBE'
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { pathToFileURL } from "node:url";

const [work, dist, report, repo] = process.argv.slice(2);
const from = (name) => import(pathToFileURL(path.join(dist, name)).href);
const { assembleProfile } = await from("assemble.js");
const { DEFAULT_CONFIG } = await from("config.js");
const { isFilesystemWorkflow, load, pluginsRootResolver } = await from("loader.js");
const { profilePaths } = await from("paths.js");
const { profiles } = await from("profiles.js");
const { pluginSlices } = await from("slices.js");
const { FileEventLog } = await import("@amykit/plugin-file-log");
const { LogBudget } = await import("@amykit/core");

const assertions = [];
const record = (type, ok) => assertions.push({ type, status: ok ? "passed" : "failed" });
const attempt = async (type, check) => {
  try { record(type, await check()); } catch (error) { console.error(`${type}: ${error.message}`); record(type, false); }
};

const home = path.join(work, ".amy");
const project = path.join(work, "invoices");
fs.mkdirSync(home, { recursive: true });

/** A phase directory as somebody writes one: an index exporting a workflow. */
function phase(name, { exportsWorkflow = true, root = project } = {}) {
  const directory = path.join(root, name);
  fs.mkdirSync(directory, { recursive: true });
  const body = exportsWorkflow ? `
    registry.workflow({
      name: "invoices-${name}", states: ["START", "DONE"], waitingStates: [],
      initialState: "START", terminalStates: ["DONE"], usesObservers: [],
      plan: () => ({ kind: "settled", why: "scenario" }),
    });
    registry.contribute("workflow-runtime", "invoices-${name}", {
      policy: {}, found: async () => [], observe: async () => ({}), actions: {},
      newRecord: (id, now) => ({ id, state: "START", updatedAt: now.toISOString(), attempts: {}, history: [] }),
      apply: (record) => record,
    });` : "";
  fs.writeFileSync(path.join(directory, "index.js"),
    `export const plugin = { name: "invoices-${name}", version: "1.0.0", register(registry) {${body}\n} };\n`, "utf-8");
  return directory;
}

const mounts = (workflow) => [
  "@amykit/plugin-file-queue", "@amykit/plugin-file-store", "@amykit/plugin-file-brief-store",
  workflow, "@amykit/plugin-notify-fanout", "@amykit/plugin-serial-engine",
];
const configured = (workflows) => ({
  ...DEFAULT_CONFIG,
  notify: { hermes: null, inbox: false },
  workflows: Object.fromEntries(Object.entries(workflows).map(([name, entry]) => [name, { ...entry, plugins: mounts(entry.workflow) }])),
});

const services = {
  runner: { run: async () => ({ ok: true, exitCode: 0, stdout: "", stderr: "" }) },
  load: (specs) => {
    const fromHome = pluginsRootResolver(home, path.join(home, "plugins"));
    return load(specs, (spec) => isFilesystemWorkflow(spec) ? fromHome(spec) : spec);
  },
  log: (file) => new FileEventLog(file),
  host: [],
};
const mountedAs = async (config, name) => assembleProfile(home, config, profiles(config, home)[name], services);
const briefOf = async (config, name) => {
  const assembled = await mountedAs(config, name);
  if (!assembled.ok) throw new Error(assembled.problems.join("; "));
  return assembled.mounted.ports.get("brief");
};

// 0. A packaged workflow is not a phase, and keeps the layout it always had.
const packaged = profiles(configured({ tickets: { workflow: "@amykit/workflow-ticket-to-qa" } }), home).tickets;
record("project.a_packaged_workflow_is_unchanged",
  packaged.project === undefined
  && profilePaths(home, packaged).records === path.join(home, "tickets", "records")
  && profilePaths(home, packaged).pid === path.join(home, "daemon.pid"));

// A project that so far has only `workflow/`: a phase already, and its
// grooming is simply missing. Asked for a brief, the real command says so.
const workflowDir = phase("workflow");
const alone = configured({ execution: { workflow: workflowDir } });
await attempt("project.a_lone_workflow_is_a_phase", async () =>
  profiles(alone, home).execution.project?.phase === "workflow" && (await mountedAs(alone, "execution")).ok);
await attempt("project.a_project_without_brief_keeps_no_briefs", async () => {
  fs.writeFileSync(path.join(home, "config.yaml"), `workflows:\n  execution:\n    workflow: ${JSON.stringify(workflowDir)}\n`, "utf-8");
  const asked = spawnSync(process.execPath, [path.join(dist, "index.js"), "--workflow", "execution", "brief", "invoices"], {
    env: { ...process.env, AMY_HOME: home }, encoding: "utf-8",
  });
  fs.rmSync(path.join(home, "config.yaml"));
  return asked.status === 1 && asked.stderr.includes(path.join(project, "brief"));
});

// An old profile of the same name left records behind; the phase never reads them.
fs.mkdirSync(path.join(home, "execution", "records"), { recursive: true });
fs.writeFileSync(path.join(home, "execution", "records", "OLD-1.json"), "{}\n", "utf-8");

// 1. The project: grooming plans on an expensive model with a large budget,
// execution runs on a cheap one with a small one, proving takes the defaults.
const config = configured({
  grooming: { workflow: phase("brief"), agent: { ladder: ["claude:opus"], budget: { perFiveHours: { tokens: 1000 } } } },
  execution: { workflow: workflowDir, agent: { ladder: ["claude:haiku"], budget: { perFiveHours: { tokens: 20 } } } },
  proving: { workflow: phase("test") },
});
const known = profiles(config, home);
const places = Object.values(known).map((profile) => profilePaths(home, profile));
const distinct = (key) => new Set(places.map((place) => place[key])).size === places.length;

await attempt("project.every_phase_mounts", async () => {
  for (const name of ["grooming", "execution", "proving"]) {
    const assembled = await mountedAs(config, name);
    if (!assembled.ok) throw new Error(`${name}: ${assembled.problems.join("; ")}`);
  }
  return true;
});
record("project.each_phase_has_its_own_queue", distinct("queue"));
await attempt("project.each_phase_spends_its_own_budget", async () => {
  const groomingLog = new FileEventLog(profilePaths(home, known.grooming).log);
  groomingLog.append({ at: new Date().toISOString(), kind: "agent.run", detail: { tokens: { input: 1000, output: 0, cacheRead: 0, cacheWrite: 0 } } });
  const grooming = new LogBudget(groomingLog, { ...config.workflows.grooming.agent.budget, stopAt: 0.8 });
  const execution = new LogBudget(new FileEventLog(profilePaths(home, known.execution).log), { ...config.workflows.execution.agent.budget, stopAt: 0.8 });
  return grooming.mayStart(new Date()).ok === false && execution.mayStart(new Date()).ok === true;
});
await attempt("project.each_phase_is_its_own_daemon", async () => {
  const cli = path.join(dist, "index.js");
  const run = (name, command) => spawnSync(process.execPath, [cli, "--workflow", name, command, ...(command === "start" ? ["--every", "1"] : [])], {
    env: { ...process.env, AMY_HOME: home }, encoding: "utf-8",
  });
  const live = (file) => {
    if (!fs.existsSync(file)) return false;
    const { pid } = JSON.parse(fs.readFileSync(file, "utf-8"));
    try { process.kill(pid, 0); return true; } catch { return false; }
  };
  const waitFor = async (check) => {
    for (let attempt = 0; attempt < 50; attempt += 1) {
      if (check()) return true;
      await new Promise((resolve) => setTimeout(resolve, 20));
    }
    return false;
  };
  const groomingPid = profilePaths(home, known.grooming).pid;
  const executionPid = profilePaths(home, known.execution).pid;
  const pluginsRoot = path.join(home, "plugins", "node_modules", "@amykit");
  fs.mkdirSync(pluginsRoot, { recursive: true });
  for (const name of ["plugin-file-queue", "plugin-file-store", "plugin-file-brief-store", "plugin-notify-fanout", "plugin-serial-engine"]) {
    fs.symlinkSync(path.join(repo, "node_modules", "@amykit", name), path.join(pluginsRoot, name));
  }
  fs.writeFileSync(path.join(home, "config.yaml"), JSON.stringify(config), "utf-8");
  try {
    const groomingStart = run("grooming", "start");
    const executionStart = run("execution", "start");
    if (groomingStart.status !== 0 || executionStart.status !== 0) {
      throw new Error(`start failed: ${groomingStart.stderr}${executionStart.stderr}`);
    }
    if (!(await waitFor(() => live(groomingPid) && live(executionPid)))) {
      const output = (file) => fs.existsSync(file) ? fs.readFileSync(path.join(path.dirname(file), "daemon.log"), "utf-8") : "missing pid";
      throw new Error(`daemons were not both live: grooming=${output(groomingPid)}, execution=${output(executionPid)}`);
    }
    const groomingStop = run("grooming", "stop");
    if (groomingStop.status !== 0) throw new Error(`stop failed: ${groomingStop.stderr}`);
    const stopped = await waitFor(() => !fs.existsSync(groomingPid));
    if (!stopped || !live(executionPid)) throw new Error(`stop leaked across phases: stopped=${stopped}, execution=${live(executionPid)}`);
    return true;
  } finally {
    if (live(groomingPid)) run("grooming", "stop");
    if (live(executionPid)) run("execution", "stop");
    fs.rmSync(path.join(home, "config.yaml"), { force: true });
  }
});
record("project.each_phase_keeps_its_own_tasks", distinct("tasks"));
const relay = (name) => pluginSlices(config, known[name], home)["@amykit/plugin-agent-relay"];
record("project.grooming_and_execution_choose_their_own_models",
  relay("grooming").ladder[0] === "claude:opus" && relay("execution").ladder[0] === "claude:haiku"
  && JSON.stringify(relay("grooming").budget) !== JSON.stringify(relay("execution").budget));

// 2. The point of the whole thing.
await attempt("project.a_brief_crosses_the_phase_boundary", async () => {
  const grooming = await briefOf(config, "grooming");
  await grooming.write({
    id: "invoices",
    sections: [{ name: "Goal", body: "One currency on every invoice line." }],
    explains: ["BILL-4021"],
    at: "2026-09-30T12:00:00.000Z",
  });
  const execution = await briefOf(config, "execution");
  const proving = await briefOf(config, "proving");
  const read = [await execution.get("invoices"), await proving.get("invoices")];
  return read.every((brief) => brief?.sections[0]?.body === "One currency on every invoice line.");
});
record("project.no_config_names_a_shared_directory", !JSON.stringify(config).includes("briefs"));
record("project.no_phase_state_escapes_home",
  places.every((place) => Object.values(place).every((dir) => !path.relative(home, dir).startsWith(".."))));
record("project.a_phase_never_reads_an_old_profiles_records",
  profilePaths(home, known.execution).records !== path.join(home, "execution", "records"));

// 3. A phase that exports no workflow is refused at boot, by its directory.
// Another project, because a module this process imported stays imported.
const other = path.join(work, "payroll");
const empty = configured({
  grooming: { workflow: phase("brief", { exportsWorkflow: false, root: other }) },
  execution: { workflow: phase("workflow", { root: other }) },
});
await attempt("project.a_phase_without_a_workflow_is_refused_by_name", async () => {
  const assembled = await mountedAs(empty, "grooming");
  return !assembled.ok && assembled.problems.some((problem) => problem.startsWith("brief/"));
});

const failed = assertions.filter((a) => a.status !== "passed");

fs.writeFileSync(
  report,
  `${JSON.stringify(
    {
      scenario: "project-phases",
      status: failed.length === 0 ? "passed" : "failed",
      goal:
        "I keep one project as three phases: grooming decides the work on an expensive model, execution does it continuously on a cheap one, and proving shows it holds. Prove each phase keeps its own queue, budget and daemon, that execution and proving read the brief grooming wrote without my config naming any directory, that a project with no brief/ is told so by name when I ask it for a brief, that a phase never reads records an old profile of the same name left, that a phase with no workflow is refused by name, and that a packaged workflow keeps the layout it always had.",
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
PROBE
