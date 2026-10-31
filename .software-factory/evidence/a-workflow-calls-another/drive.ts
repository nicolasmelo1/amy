// Drives the installed `amy` through a workflow of somebody's own that calls
// another workflow copied into it, and writes down what came of it.
//
// Usage: tsx drive.ts <amy-binary> <report-path> [--keep]
//
// Every command here is one an operator types: `amy workflow new`, `amy
// workflow add --into`, `amy discover`, `amy tick`, `amy status` and `amy
// workflow export`. The only things read back are what amy printed and what
// it left on disk.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync, spawnSync } from "node:child_process";

function usage(): never {
  throw new Error("usage: drive.ts <amy-binary> <report-path> [--keep]");
}

const [binary = usage(), reportPath = usage()] = process.argv.slice(2);
const keep = process.argv.includes("--keep");

const MAX_TICKS = 20;

/** The workflow somebody wrote for themselves: a page, a review it calls, and two ends. */
const PAGER = `stateDiagram-v2
    %% A page is reviewed by a workflow copied in from elsewhere.
    [*] --> PAGED
    PAGED --> REVIEW
    state "review the fix · copied from @acme/workflow-review" as REVIEW
    REVIEW --> RESOLVED: APPROVED
    RESOLVED --> [*]
    class REVIEW call
`;

/** The callee: it reads the change, and hands one too large to read to its owner. */
const REVIEW = `stateDiagram-v2
    [*] --> READING
    READING --> ESCALATED: too large to review
    ESCALATED --> APPROVED: the owner looked
    APPROVED --> [*]
    class ESCALATED attention
`;

/** What the stand-in callee says when it stops, which the root has to show. */
const STOPPED_BECAUSE = "nobody can review a change this large without its owner";

function pagerIndex(): string {
  return `// Somebody's own workflow, calling one copied into it as code they now own.
import fs from "node:fs";
import path from "node:path";
import { advance, call, defineWorkflow, settled } from "@amykit/core";
import { plugin as review } from "./workflows/review/index.ts";

const looked = (what: string) => fs.appendFileSync(path.join(process.env.AMY_E2E_WORLD ?? ".", "looked.log"), what + "\\n");

export const plugin = defineWorkflow({
  name: "pager",
  configSchema: {},
  policy: {},
  needs: {},
  calls: { REVIEW: call(review, { input: () => ({ change: "the retry storm fix" }) }) },
  decide: {
    PAGED: () => advance("REVIEW", "a fix is up for review"),
    RESOLVED: () => settled("resolved"),
  },
  record: () => ({}),
  discover: async () => ["page-1"],
  observe: async (_scope, record) => { looked("pager@" + record.state); return {}; },
  actions: {},
});
`;
}

/** A workflow package in three files, one reached only by a relative import. */
function reviewPackage(root: string): string {
  const directory = path.join(root, "world", "acme-workflow-review");
  fs.mkdirSync(path.join(directory, "src"), { recursive: true });
  fs.writeFileSync(path.join(directory, "package.json"), `${JSON.stringify({
    name: "@acme/workflow-review",
    version: "1.0.0",
    type: "module",
    exports: { ".": { import: "./index.ts" } },
    dependencies: { "@amykit/core": "^0.6.0" },
  }, null, 2)}\n`);
  fs.writeFileSync(path.join(directory, "workflow.mmd"), REVIEW);
  fs.writeFileSync(path.join(directory, "index.ts"), `import fs from "node:fs";
import path from "node:path";
import { defineWorkflow, withDiagramBeside } from "@amykit/core";
import { decide } from "./src/decide.ts";

const looked = (what: string) => fs.appendFileSync(path.join(process.env.AMY_E2E_WORLD ?? ".", "looked.log"), what + "\\n");

export const plugin = withDiagramBeside(defineWorkflow({
  name: "review",
  configSchema: {},
  policy: {},
  needs: {},
  input: { change: { type: "string", required: true, description: "what is up for review" } },
  decide,
  record: () => ({}),
  observe: async (_scope, record) => { looked("review@" + record.state); return {}; },
  actions: {},
}), import.meta.url);
`);
  fs.writeFileSync(path.join(directory, "src", "decide.ts"), `import { advance, settled, wait } from "@amykit/core";

export const decide = {
  READING: () => advance("ESCALATED", ${JSON.stringify(STOPPED_BECAUSE)}),
  ESCALATED: () => wait(60 * 60 * 1000, "waiting on the owner"),
  APPROVED: () => settled("approved"),
};
`);
  return directory;
}

function config(root: string): string {
  return `# One workflow of somebody's own, and nothing that reaches the internet.
workflows:
  pager:
    workflow: pager
defaultWorkflow: pager

repos: []
workspaceRoot: ${path.join(root, "checkouts")}
defaultBranch: main
maxItemAttempts: 1

autoUpdate:
  enabled: false

notify:
  tracker: false
  hermes: null
  inbox: true
`;
}

interface Said {
  code: number | null;
  out: string;
}

interface Record {
  id: string;
  state: string;
  calling?: string;
  history?: { from: string; to: string; why: string }[];
  calls?: { [id: string]: { id: string; state: string; input?: { change?: string }; history?: { from: string; to: string; why: string }[] } };
}

function amy(root: string, args: string[]): Said {
  const result = spawnSync(binary, args, {
    cwd: path.join(root, "home"),
    encoding: "utf-8",
    env: { ...process.env, HOME: path.join(root, "home"), AMY_E2E_WORLD: path.join(root, "world") },
  });
  return { code: result.status, out: `${result.stdout ?? ""}${result.stderr ?? ""}`.trim() };
}

function installPlugins(root: string): void {
  const tarballs = process.env.AMY_E2E_TARBALLS;
  if (!tarballs) throw new Error("the scenario did not name the packaged plugins");
  const packed = fs.readdirSync(tarballs)
    .filter((name) => name.endsWith(".tgz"))
    .map((name) => path.join(tarballs, name))
    .map((file) => ({
      file,
      manifest: JSON.parse(execFileSync("tar", ["-xOf", file, "package/package.json"], { encoding: "utf-8" })) as { name: string },
    }));
  // The CLI is installed by install.sh already; npm wants a direct
  // dependency and its override to use the same specifier.
  const dependencies = Object.fromEntries(packed
    .filter(({ manifest }) => manifest.name !== "@amykit/cli")
    .map(({ file, manifest }) => [manifest.name, `file:${file}`]));
  const prefix = path.join(root, "home", ".amy", "plugins");
  fs.mkdirSync(prefix, { recursive: true });
  fs.writeFileSync(path.join(prefix, "package.json"), `${JSON.stringify({ name: "amy-e2e-plugins", private: true, dependencies, overrides: dependencies }, null, 2)}\n`);
  const result = spawnSync("npm", ["install", "--prefix", prefix, "--no-audit", "--no-fund"], { encoding: "utf-8" });
  if (result.status !== 0) throw new Error(`the scenario could not install the packaged plugins: ${result.stderr}`);
}

interface State {
  added: Said;
  copied: string[];
  ticks: Said[];
  record: Record | null;
  status: Said;
  statusJson: Said;
  expanded: Said;
  looked: string[];
  leftBehind: boolean;
}

function walkthrough(): State {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "amy-calls-"));
  try {
    for (const dir of ["home", "world", "checkouts"]) fs.mkdirSync(path.join(root, dir), { recursive: true });
    amy(root, ["init"]);
    installPlugins(root);

    // A workflow of one's own, drawn first, then given its decisions.
    fs.writeFileSync(path.join(root, "world", "pager.mmd"), PAGER);
    amy(root, ["workflow", "new", "pager", "--from", path.join(root, "world", "pager.mmd")]);
    fs.writeFileSync(path.join(root, "home", ".amy", "config.yaml"), config(root));
    const pager = path.join(root, "home", ".amy", "workflows", "pager");
    fs.writeFileSync(path.join(pager, "index.ts"), pagerIndex());

    // The callee is somebody else's, and is copied in to be owned.
    const added = amy(root, ["workflow", "add", reviewPackage(root), "--into", "pager"]);
    const copiedTo = path.join(pager, "workflows", "review");
    const copied = fs.existsSync(copiedTo) ? fs.readdirSync(copiedTo, { recursive: true }).map(String).sort() : [];

    amy(root, ["--workflow", "pager", "discover"]);
    const ticks: Said[] = [];
    for (let look = 0; look < MAX_TICKS; look += 1) {
      const said = amy(root, ["--workflow", "pager", "tick"]);
      ticks.push(said);
      if (said.out.includes("nothing due")) break;
    }

    const recordFile = path.join(root, "home", ".amy", "pager", "records", "page-1.json");
    const state: State = {
      added,
      copied,
      ticks,
      record: fs.existsSync(recordFile) ? (JSON.parse(fs.readFileSync(recordFile, "utf-8")) as Record) : null,
      status: amy(root, ["--workflow", "pager", "status"]),
      statusJson: amy(root, ["--workflow", "pager", "status", "--json"]),
      expanded: amy(root, ["workflow", "export", "pager", "--expand", "--work", "page-1"]),
      looked: fs.existsSync(path.join(root, "world", "looked.log"))
        ? fs.readFileSync(path.join(root, "world", "looked.log"), "utf-8").split("\n").filter(Boolean)
        : [],
      leftBehind: fs.existsSync(path.join(process.cwd(), ".amy")),
    };
    if (keep) process.stdout.write(`kept ${root}\n`);
    return state;
  } finally {
    if (!keep) fs.rmSync(root, { recursive: true, force: true });
  }
}

type Check = [type: string, ok: boolean | undefined];

function statusRecord(state: State): { attention?: boolean; calls?: { id: string; state: string }[] } | undefined {
  try {
    const parsed = JSON.parse(state.statusJson.out) as { records: { id: string; attention?: boolean; calls?: { id: string; state: string }[] }[] };
    return parsed.records.find((record) => record.id === "page-1");
  } catch {
    return undefined;
  }
}

/** Copied whole, then called and drawn the way the package would be. */
function copiedIsCalled(state: State): boolean {
  const call = state.record?.calls?.["page-1/REVIEW#1"];
  const copiedWhole = state.added.code === 0 && ["index.ts", "package.json", "src/decide.ts", "workflow.mmd"].every((file) => state.copied.includes(file));
  const called = state.record?.state === "REVIEW" &&
    state.record.calling === "page-1/REVIEW#1" &&
    call?.input?.change === "the retry storm fix" &&
    (call.history ?? []).some((move) => move.from === "READING" && move.to === "ESCALATED");
  const drawn = state.expanded.code === 0 &&
    state.expanded.out.includes("state REVIEW {") &&
    state.expanded.out.includes("REVIEW__READING --> REVIEW__ESCALATED: too large to review") &&
    state.expanded.out.includes("class REVIEW,REVIEW__ESCALATED current");
  return copiedWhole && called && drawn;
}

/** The child escalated, and the root shows attention with the move that stopped it. */
function escalatesToRoot(state: State): boolean {
  return state.record?.calls?.["page-1/REVIEW#1"]?.state === "ESCALATED" &&
    /page-1\s+REVIEW › ESCALATED\s+attention/.test(state.status.out) &&
    state.status.out.includes(`page-1 needs you: page-1/REVIEW#1 stopped in ESCALATED — ${STOPPED_BECAUSE}`) &&
    statusRecord(state)?.attention === true;
}

function assertionsFor(state: State): { type: string; status: "passed" | "failed" }[] {
  const checks: Check[] = [
    // Copied whole: the diagram, the manifest, the entry and the file it
    // reaches by a relative import — and then called, and drawn, the way
    // the package would be.
    ["mine.a_copied_callee_is_called", copiedIsCalled(state)],
    // The child escalated, and the root is what a person sees.
    ["calls.a_callee_escalates_to_its_root", escalatesToRoot(state)],
    [
      // While the call runs, the deepest record is the only one observed:
      // the caller was looked at before it called, and never since.
      "calls.only_the_deepest_record_is_looked_at",
      state.looked[0] === "pager@PAGED" &&
        state.looked.slice(1).length > 0 &&
        state.looked.slice(1).every((line) => line.startsWith("review@")),
    ],
    [
      "calls.the_machine_settles_instead_of_spinning",
      state.ticks.at(-1)?.out.includes("nothing due") === true && state.ticks.every((tick) => tick.code === 0),
    ],
    ["calls.the_run_leaves_nothing_behind", !state.leftBehind],
  ];
  return checks.map(([type, ok]) => ({ type, status: ok ? "passed" : "failed" }));
}

const state = walkthrough();
const assertions = assertionsFor(state);
const failed = assertions.filter((assertion) => assertion.status === "failed");
for (const assertion of failed) process.stderr.write(`FAILED ${assertion.type}\n`);
if (failed.length > 0) {
  process.stderr.write(`${JSON.stringify({ added: state.added, ticks: state.ticks, status: state.status, looked: state.looked, record: state.record, expanded: state.expanded.out }, null, 2)}\n`);
}

fs.writeFileSync(reportPath, `${JSON.stringify({
  scenario: "a-workflow-calls-another",
  status: failed.length === 0 ? "passed" : "failed",
  goal:
    "I want to use somebody else's workflow inside my own the way I use a library: copy it into my workflow's " +
    "directory, call it from a state, and see where my work is through it — and when the workflow I called stops " +
    "on me, I want my own work to say so, with the reason, without opening the copy.",
  artifact: {
    package: "@amykit/cli",
    entry: "the installed executable, driven by `amy workflow new`, `amy workflow add --into`, `amy discover`, `amy tick`, `amy status` and `amy workflow export --expand`",
    built_by: "scripts/install.sh",
  },
  observed: {
    assertions_run: assertions.length,
    assertions_failed: failed.length,
    looks: state.ticks.length,
    looked: state.looked,
    copied: state.copied,
    record: state.record,
  },
  assertions,
}, null, 2)}\n`);

process.stdout.write(`${assertions.length - failed.length}/${assertions.length} assertions passed in ${state.ticks.length} looks\n`);
process.exit(failed.length === 0 ? 0 : 1);
