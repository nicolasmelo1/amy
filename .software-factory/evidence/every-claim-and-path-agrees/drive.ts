/**
 * The `every-claim-and-path-agrees` gate's driver.
 *
 * Every claim is read off the built tree, never off the sources: a claim is
 * about what a process does, so the processes here are separate and the
 * modules they load are the ones `npm run build` wrote.
 *
 * Usage: tsx drive.ts <work-directory> <report-path>
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import { checkoutFor, sayToOperator } from "../../../packages/core/dist/index.js";
import { readWorktreeSlice } from "../../../packages/cli/dist/slices.js";
import { launcherOf, taskScheduler } from "../../../packages/cli/dist/supervisor/windows.js";
import { WorktreeManager } from "../../../plugins/file-worktree/dist/manager.js";
import { SlackApi, SlackConversation } from "../../../plugins/slack/dist/index.js";
import type { CommandResult } from "../../../packages/core/dist/index.js";

const [workArgument, reportArgument] = process.argv.slice(2);
if (!workArgument || !reportArgument) throw new Error("usage: drive.ts <work-directory> <report-path>");

const work = workArgument;
const reportPath = reportArgument;
const PROFILE = "oncall";

interface Assertion {
  readonly type: string;
  readonly status: "passed" | "failed";
}

const assertions: Assertion[] = [];
const observed: Record<string, string | number | boolean> = {};

function record(name: string, passed: boolean, said?: string): void {
  assertions.push({ type: name, status: passed ? "passed" : "failed" });
  if (said !== undefined) observed[name] = said;
  if (!passed) console.error(`FAILED ${name}${said === undefined ? "" : `: ${said}`}`);
}

function homeFor(name: string): string {
  const home = path.join(work, name);
  fs.mkdirSync(path.join(home, "workflows", PROFILE), { recursive: true });
  return home;
}

const dueOf = (home: string): string => path.join(home, "workflows", PROFILE, "auto-update-daemon");
const claimOf = (home: string): string => `${dueOf(home)}.claimed`;

/** One starter, in a process of its own, taking the due the way the built amy does. */
function starter(script: string, home: string, log: string): Promise<number | null> {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [script, home, PROFILE, log], { stdio: ["ignore", "ignore", "pipe"] });
    child.stderr.pipe(process.stderr);
    child.on("close", (code) => resolve(code));
  });
}

function writeStarter(directory: string, module: string): string {
  const script = path.join(directory, "starter.mjs");
  fs.writeFileSync(script, `
import fs from "node:fs";
import { settleClaimedDaemonUpdate, takeDaemonUpdate } from ${JSON.stringify(module)};
const [home, profile, log] = process.argv.slice(2);
if (takeDaemonUpdate(home, profile)) {
  fs.appendFileSync(log, "took\\n");
  await settleClaimedDaemonUpdate(home, profile, async () => 0);
} else {
  fs.appendFileSync(log, "skipped\\n");
}
`, "utf-8");
  return script;
}

async function takeTheDue(home: string, script: string, starters: number): Promise<number> {
  const log = path.join(home, "took.log");
  fs.writeFileSync(log, "");
  await Promise.all(Array.from({ length: starters }, () => starter(script, home, log)));
  return fs.readFileSync(log, "utf-8").split("\n").filter((line) => line === "took").length;
}

async function claims(): Promise<void> {
  const directory = path.join(work, "claims");
  fs.mkdirSync(directory, { recursive: true });
  const module = path.join(process.cwd(), "packages/cli/dist/auto-update.js");
  const script = writeStarter(directory, module);

  // A dead owner consumed the due: one of the two starters recovers it.
  const stale = homeFor("stale");
  fs.writeFileSync(claimOf(stale), `${JSON.stringify({ pid: 999_999, stamp: "gone" })}\n`);
  const recovered = await takeTheDue(stale, script, 2);
  record("agree.a_stale_update_claim_is_recovered_once", recovered === 1, `took ${recovered}`);

  // A live owner holds it: neither starter acts on the due.
  const live = homeFor("live");
  fs.writeFileSync(dueOf(live), "due\n");
  fs.writeFileSync(claimOf(live), `${JSON.stringify({ pid: process.pid, stamp: "here" })}\n`);
  const stolen = await takeTheDue(live, script, 2);
  record("agree.a_live_claim_is_not_taken", stolen === 0, `took ${stolen}`);
}

async function stopMarker(): Promise<void> {
  const calls: string[] = [];
  const machine = {
    platform: "win32" as const,
    home: os.homedir(),
    user: "fixture",
    uid: 0,
    env: { AMY_HOME: "  amy-home  " },
    runner: {
      run: async (command: string, args: readonly string[]): Promise<CommandResult> => {
        calls.push([command, ...args].join(" "));
        return { ok: true, exitCode: 0, stdout: "", stderr: "" };
      },
    },
  };
  const label = "amy-every-claim";
  // cwd is the work directory, so the relative AMY_HOME resolves inside it.
  const previous = process.cwd();
  process.chdir(work);
  try {
    await taskScheduler(machine).stop(label);
  } finally {
    process.chdir(previous);
  }
  const directory = path.join(work, "amy-home", "supervisor");
  const marker = path.join(directory, `${label}.stopped`);
  const launcher = launcherOf({
    label,
    description: "amy, driving every claim",
    program: process.execPath,
    args: [],
    env: {},
    workingDirectory: os.homedir(),
    log: path.join(os.homedir(), "daemon.log"),
    directory,
  });
  record(
    "agree.amy_stop_writes_where_the_launcher_reads",
    fs.existsSync(marker) && launcher.includes(marker) && calls.some((call) => call.startsWith("schtasks")),
    marker,
  );
}

async function longPost(): Promise<void> {
  const posted: string[] = [];
  let clock = 0;
  const api = new SlackApi("xoxb-fixture", {
    transport: async (request) => {
      posted.push(new URLSearchParams(request.body ?? "").get("text") ?? "");
      clock += 1;
      return {
        status: 200,
        headers: {},
        body: new TextEncoder().encode(JSON.stringify({ ok: true, ts: `1790000${String(clock).padStart(3, "0")}.000100` })),
      };
    },
  });
  const conversation = new SlackConversation(api, {
    channel: "C0WORK",
    operator: "U0ADA",
    directory: path.join(work, "slack"),
  });
  const said = "a".repeat(9_001);
  await conversation.say("1790000000.000100", said);
  record(
    "agree.a_long_post_is_split_in_order",
    posted.length > 1 && posted.every((one) => one.length <= 4_000) && posted.join("") === said,
    `${posted.length} posts`,
  );
}

function workspaceSlice(): void {
  let refused = "";
  try {
    readWorktreeSlice({ workspaceRoot: "   " });
  } catch (error) {
    refused = (error as Error).message;
  }
  record("agree.a_blank_workspace_root_is_refused", refused.includes("workspaceRoot"), refused);
}

async function oneCheckout(): Promise<void> {
  const root = path.join(work, "checkouts");
  const parsed = readWorktreeSlice({ workspaceRoot: ` ${root} `, checkouts: { "acme/gadgets": `${root}/named` } });
  const asked: string[] = [];
  const manager = new WorktreeManager(
    {
      run: async (_command: string, _args: readonly string[], options?: { cwd?: string }): Promise<CommandResult> => {
        if (options?.cwd) asked.push(options.cwd);
        return { ok: true, exitCode: 0, stdout: "", stderr: "" };
      },
    },
    {
      root: path.join(work, "trees"),
      workflow: "oncall",
      defaultBranch: "main",
      workspaceRoot: parsed.workspaceRoot,
      checkouts: parsed.checkouts,
      retentionDays: 7,
      record: () => null,
      terminalStates: [],
    },
  );
  await manager.acquire("PROJ-1", "acme/widgets");
  const expected = checkoutFor({ workspaceRoot: parsed.workspaceRoot, defaultBranch: "main", checkouts: parsed.checkouts }, "acme/widgets");
  record(
    "agree.the_doctor_and_the_manager_name_one_checkout",
    asked[0] === expected && expected === path.join(root, "widgets"),
    `${asked[0] ?? "never asked"} / ${expected}`,
  );
}

async function metaRead(): Promise<void> {
  const directory = path.join(work, "meta");
  const root = path.join(directory, "trees");
  const tree = path.join(root, "oncall", "PROJ-1", "acme-widgets");
  const file = path.join(root, "oncall", ".meta", "PROJ-1", "acme-widgets.json");
  fs.mkdirSync(tree, { recursive: true });
  // A tree the manager already holds: touching it writes the meta, and no
  // checkout is cut for it.
  fs.writeFileSync(path.join(tree, ".git"), "gitdir: elsewhere\n");
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${JSON.stringify({ workId: "PROJ-1", repo: "acme/widgets", acquiredAt: "0", updatedAt: "0" }, null, 2)}\n`);
  const module = path.join(process.cwd(), "plugins/file-worktree/dist/manager.js");
  const script = path.join(directory, "writer.mjs");
  fs.writeFileSync(script, `
import { WorktreeManager } from ${JSON.stringify(module)};
const [root, rounds] = process.argv.slice(2);
const manager = new WorktreeManager(
  { run: async () => ({ ok: true, exitCode: 0, stdout: "", stderr: "" }) },
  { root, workflow: "oncall", defaultBranch: "main", workspaceRoot: "", retentionDays: 7, record: () => null, terminalStates: [] },
);
for (let n = 0; n < Number(rounds); n += 1) manager.touch("PROJ-1", "acme/widgets");
`, "utf-8");

  let finished = false;
  const writing = new Promise<number | null>((resolve) => {
    const child = spawn(process.execPath, [script, root, "600"], { stdio: ["ignore", "ignore", "pipe"] });
    child.stderr.pipe(process.stderr);
    child.on("close", (code) => {
      finished = true;
      resolve(code);
    });
  });
  let torn = 0;
  let reads = 0;
  while (!finished) {
    const text = fs.readFileSync(file, "utf-8");
    reads += 1;
    if (text.trim() === "") torn += 1;
    else {
      try {
        JSON.parse(text);
      } catch {
        torn += 1;
      }
    }
    await new Promise((resolve) => setImmediate(resolve));
  }
  record("agree.a_meta_is_never_read_torn", (await writing) === 0 && reads > 0 && torn === 0, `${reads} reads, ${torn} torn`);
}

async function unitThread(): Promise<void> {
  const opened: string[] = [];
  await sayToOperator(
    {
      conversation: {
        known: async () => undefined,
        open: async (workId: string) => {
          opened.push(workId);
          return { id: workId };
        },
        post: async () => "1",
        replies: async () => [],
      },
      notifier: { announce: async () => undefined },
    },
    { text: "moved", workId: "PROJ-1/WORK#1/CHECK#2", title: "one work", state: "queued" },
  );
  record("agree.a_child_speaks_in_its_unit_thread", opened[0] === "PROJ-1", opened[0] ?? "no thread");
}

async function main(): Promise<void> {
  await claims();
  await stopMarker();
  await longPost();
  workspaceSlice();
  await oneCheckout();
  await metaRead();
  await unitThread();

  const failed = assertions.filter((one) => one.status === "failed").length;
  fs.writeFileSync(reportPath, `${JSON.stringify({
    scenario: "every-claim-and-path-agrees",
    status: failed === 0 ? "passed" : "failed",
    goal: "I want every claim a workflow, a supervisor or an operator channel makes about a piece of work to name the same path and the same record that every other part of amy acts on, with a stale claim recovered once and a long message delivered whole.",
    artifact: {
      package: "@amykit/cli",
      entry: "the dist modules `npm run build` wrote, loaded in processes of their own",
      built_by: "tsc --build",
    },
    observed: { ...observed, assertions_run: assertions.length, assertions_failed: failed },
    assertions,
  }, null, 2)}\n`);
  console.log(`${assertions.length - failed}/${assertions.length} assertions passed`);
  if (failed !== 0) process.exitCode = 1;
}

await main();
