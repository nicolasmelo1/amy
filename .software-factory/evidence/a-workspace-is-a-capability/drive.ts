// The proof behind `a-workspace-is-a-capability`.
//
// Half one: the installed amy, on a machine whose config names no
// repository and mounts no workspace, drives a support inbox added from a
// path. A request arrives as a file; the agent triages it and drafts the
// answer; the draft is put to the operator in a Telegram topic; somebody
// else's "approve" moves nothing; the operator's does, and the answer is
// sent. Every `amy` here is its own process.
//
// Half two: the ticket-to-qa, errand and note-to-plan scenarios, run as they
// stand, each world kept long enough to read where its workspace was said.
//
// Usage: tsx drive.ts <repo> <scratch> <report-path> [--keep]
import { execFileSync, spawn, spawnSync, type ChildProcess } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { parse } from "yaml";
import { OPERATOR, SOMEBODY_ELSE, TOKEN } from "../../../plugins/telegram/tests/stand-in.js";

const [repo = "", root = "", reportPath = ""] = process.argv.slice(2);
if (!repo || !root || !reportPath) {
  console.error("usage: tsx drive.ts <repo> <scratch> <report-path> [--keep]");
  process.exit(2);
}
const keep = process.argv.includes("--keep");
const TSX = path.join(repo, "node_modules", ".bin", "tsx");
const here = path.join(repo, ".software-factory/evidence/a-workspace-is-a-capability");
const binary = path.join(root, "bin", "amy");

/** The seven keys a machine that drives no code should never be asked for. */
const MACHINE_KEYS = ["repos", "workspaceRoot", "checkouts", "defaultBranch", "baseBranch", "gate", "worktrees"] as const;
const WORKSPACE_PLUGIN = "@amykit/plugin-file-worktree";
const WORKFLOW = "@acme/workflow-support-inbox";
const REQUEST = "REQ-1";

interface Assertion { type: string; status: "passed" | "failed"; detail?: unknown }
const assertions: Assertion[] = [];
const record = (type: string, ok: boolean, detail?: unknown) => assertions.push({ type, status: ok ? "passed" : "failed", ...(detail === undefined ? {} : { detail }) });

interface TelegramWorld {
  topics: Record<string, string>;
  sent: { topic: number; text: string }[];
  pending: number;
  violations: string[];
}

const home = path.join(root, "home");
const world = path.join(root, "world");
const amyHome = path.join(home, ".amy");
const children: ChildProcess[] = [];

const amy = (...args: string[]) => {
  const result = spawnSync(binary, args, {
    cwd: home, encoding: "utf-8",
    env: { ...process.env, AMY_E2E_TSX: TSX, PATH: `${path.join(root, "stand-ins")}:${process.env.PATH}`, HOME: home, AMY_E2E_WORLD: world },
  });
  return { code: result.status, out: `${result.stdout ?? ""}${result.stderr ?? ""}`.trim() };
};
const PROFILE = "support-inbox";
const support = (...args: string[]) => amy("--workflow", PROFILE, ...args);

try {
  for (const dir of [home, world, path.join(root, "stand-ins")]) fs.mkdirSync(dir, { recursive: true });
  for (const tool of ["claude", "claude.ts"]) fs.copyFileSync(path.join(here, "bin", tool), path.join(root, "stand-ins", tool));
  fs.chmodSync(path.join(root, "stand-ins", "claude"), 0o755);

  const telegram = serve(path.join(repo, ".software-factory/evidence/plugin-telegram/bot-api.ts"), path.join(world, "telegram.port"));
  const bot = `http://127.0.0.1:${telegram}`;
  const said = async (text: string, where: { topic?: number; from?: number } = {}) =>
    void (await fetch(`${bot}/operator/say`, { method: "POST", body: JSON.stringify({ text, ...where }) }));
  const telegramWorld = async () => (await (await fetch(`${bot}/operator/world`)).json()) as TelegramWorld;

  // The operator's machine, as their answers to `amy setup` left it: a
  // harness on the ladder, a channel to reach them, nothing else. `amy
  // setup` asks a person one question at a time, and a scenario has no
  // person to answer it — the installed-plugins and bare-install scenarios
  // are what prove the install path; this one drives the machine the
  // answers leave behind.
  installPlugins();
  fs.mkdirSync(amyHome, { recursive: true });
  fs.appendFileSync(path.join(home, ".env"), `TELEGRAM_BOT_TOKEN=${TOKEN}\n`);
  fs.writeFileSync(path.join(amyHome, "config.yaml"), [
    "agent:",
    "  ladder: [claude]",
    "extraPlugins:",
    '  - "@amykit/plugin-telegram"',
    "plugins:",
    '  "@amykit/plugin-telegram":',
    `    operator: "${OPERATOR}"`,
    `    server: ${bot}`,
    "",
  ].join("\n"));
  // The conversation first: the inbox asks for one, and `amy add` refuses a
  // machine that would not boot with the entry it wrote.
  const added = amy("add", path.join(root, "workflow-support-inbox"));
  if (added.code !== 0) throw new Error(`amy add exited ${added.code}: ${added.out}`);
  configure(bot);

  // What the operator's machine says about itself: no repository anywhere.
  const config = parse(fs.readFileSync(path.join(amyHome, "config.yaml"), "utf-8")) as Record<string, unknown> & {
    plugins?: Record<string, unknown>;
    workflows?: Record<string, { plugins?: string[] }>;
  };
  const named = MACHINE_KEYS.filter((key) => key in config);
  const mounted = config.workflows?.[PROFILE]?.plugins ?? [];
  record("workspace.the_config_names_no_workspace",
    named.length === 0 && !mounted.includes(WORKSPACE_PLUGIN) && !(WORKSPACE_PLUGIN in (config.plugins ?? {})) && mounted.includes(WORKFLOW),
    { named, mounted, added: added.out });

  const doctor = amy("doctor");
  const asked = doctor.out.split("\n").filter((line) => /repositor|checkout|worktree|workspace|\bgh\b|\bgit\b/i.test(line));
  record("workspace.the_doctor_asks_nothing_of_a_repository_and_says_ready", doctor.code === 0 && asked.length === 0, { code: doctor.code, asked, out: doctor.out });

  // A request arrives, the way a mail rule would leave one.
  const inbox = path.join(amyHome, "requests");
  fs.mkdirSync(inbox, { recursive: true });
  fs.writeFileSync(path.join(inbox, `${REQUEST}.md`), [
    "From: Grace",
    "Subject: charged twice",
    "",
    "My card was charged twice for order 7731. Can I have the second charge refunded?",
    "",
  ].join("\n"));

  const discovered = support("discover");
  const ticks: string[] = [];
  for (let tick = 0; tick < 10 && stateOf(REQUEST) !== "AWAITING_APPROVAL"; tick += 1) {
    const result = support("tick");
    ticks.push(result.out);
    if (result.code !== 0) throw new Error(`amy tick exited ${result.code}: ${result.out}`);
  }
  const outbox = path.join(amyHome, "answers", `${REQUEST}.md`);
  const askedWorld = await telegramWorld();
  const topic = Number(Object.keys(askedWorld.topics)[0]);
  const draftedRequest = lines<{ queue: string; cwd: string; prompt: string }>(path.join(world, "claude.log"));

  // Somebody else in the chat says the word, and outside the topic the
  // operator does too: neither is the operator approving this draft.
  await said("approve", { topic, from: SOMEBODY_ELSE });
  await said("approve");
  for (let tick = 0; tick < 3; tick += 1) support("tick");
  const heldState = stateOf(REQUEST);
  const sentEarly = fs.existsSync(outbox);
  record("workspace.nothing_is_sent_before_the_operator_approves",
    heldState === "AWAITING_APPROVAL" && !sentEarly &&
      askedWorld.sent.some((message) => message.topic === topic && /refunded/.test(message.text) && /approve/.test(message.text)),
    { state: heldState, sentEarly, topics: askedWorld.topics, sent: askedWorld.sent });

  await said("approve", { topic });
  for (let tick = 0; tick < 10 && stateOf(REQUEST) !== "SENT"; tick += 1) {
    const result = support("tick");
    ticks.push(result.out);
    if (result.code !== 0) throw new Error(`amy tick exited ${result.code}: ${result.out}`);
  }
  const sent = fs.existsSync(outbox) ? fs.readFileSync(outbox, "utf-8") : "";
  const after = await telegramWorld();
  const trees = ["checkouts", "trees", "worktrees"].filter((name) => fs.existsSync(path.join(amyHome, name)));
  record("workspace.a_workflow_without_code_needs_no_workspace",
    stateOf(REQUEST) === "SENT" &&
      draftedRequest.length === 1 && draftedRequest[0]?.queue === "billing" && /order 7731/.test(draftedRequest[0]?.prompt ?? "") &&
      /Hi Grace/.test(sent) && /refunded/.test(sent) &&
      after.violations.length === 0 && trees.length === 0,
    { state: stateOf(REQUEST), discovered: discovered.out, ticks, drafted: draftedRequest.map(({ queue, cwd }) => ({ queue, cwd })), sent, violations: after.violations, trees });

  record("workspace.the_code_workflows_walk_with_their_workspace_in_its_plugin", ...(await codeWorkflows()));
  record("update.the_workspace_moves_into_its_plugin", ...theUpdateMovesTheWorkspace());
} catch (error) {
  record("workspace.the_scenario_ran", false, error instanceof Error ? error.message : String(error));
} finally {
  for (const child of children) child.kill();
  if (keep) console.log(`kept the world in ${root}`);
}

const failed = assertions.filter((assertion) => assertion.status !== "passed");
const report = {
  scenario: "a-workspace-is-a-capability",
  goal: "Prove an install whose config names none of repos, workspaceRoot, checkouts, defaultBranch, baseBranch, gate and worktrees, and mounts no workspace, is told it is ready by amy doctor and walks an installed support inbox from a request to an answer sent only after the operator approved it in the conversation; and that ticket-to-qa, errand and note-to-plan walk as their scenarios prove with their workspace said in the file-worktree plugin's slice.",
  status: failed.length === 0 ? "passed" : "failed",
  assertions,
};
fs.writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`);
for (const assertion of assertions) console.log(`${assertion.status === "passed" ? "✓" : "✗"} ${assertion.type}${assertion.status === "passed" ? "" : ` ${JSON.stringify(assertion.detail)}`}`);
process.exit(failed.length === 0 ? 0 : 1);

/**
 * The operator's edit to what their answers and `amy add` wrote: the inbox
 * mounts what it asks for and nothing a code workflow would, Telegram is
 * the conversation, and nothing here reaches the internet.
 */
function configure(bot: string): void {
  const file = path.join(amyHome, "config.yaml");
  const config = parse(fs.readFileSync(file, "utf-8")) as Record<string, unknown> & { workflows?: Record<string, Record<string, unknown>> };
  const profile = config.workflows?.[PROFILE];
  if (!profile) throw new Error(`amy add wrote no support profile: ${JSON.stringify(config.workflows)}`);
  const workflow = String(profile.workflow);
  fs.writeFileSync(file, `# A machine that answers support requests and touches no code.
workflows:
  ${PROFILE}:
    workflow: ${JSON.stringify(workflow)}
    settings:
      policy:
        # Zero, because this run is driven a move at a time.
        backoffMs: 0
    plugins:
      - "@amykit/plugin-file-queue"
      - "@amykit/plugin-file-store"
      - "@amykit/plugin-telegram"
      - ${JSON.stringify(workflow)}
      - "@amykit/plugin-claude"
      - "@amykit/plugin-agent-relay"
      - "@amykit/plugin-notify-fanout"
      - "@amykit/plugin-notify-inbox"
      - "@amykit/plugin-serial-engine"
defaultWorkflow: ${PROFILE}

plugins:
  "@amykit/plugin-telegram":
    operator: "${OPERATOR}"
    server: ${bot}

maxItemAttempts: 1

autoUpdate:
  enabled: false

agent:
  model: sonnet
  ladder:
    - claude:sonnet

notify:
  tracker: false
  hermes: null
  inbox: true
`);
}

/**
 * The three code workflows, each driven by its own scenario as it stands, and
 * the config each one drove with, written by the same `configure` its world
 * calls into a scratch root of this run's. Read that way rather than off a
 * kept world: ticket-to-qa proves its run leaves nothing behind, so keeping
 * its world would fail the very scenario it is meant to repeat.
 */
async function codeWorkflows(): Promise<[boolean, unknown]> {
  const worlds: Record<string, (root: string) => Promise<void>> = {
    "ticket-to-qa": async (scratch) => (await import("../ticket-to-qa/world.js")).configure(scratch, "http://127.0.0.1:1/graphql"),
    errand: async (scratch) => (await import("../errand/world.js")).configure(scratch),
    "note-to-plan": async (scratch) => (await import("../note-to-plan/world.js")).configure(scratch),
  };
  const found: Record<string, unknown> = {};
  let ok = true;
  for (const [gate, configureInto] of Object.entries(worlds)) {
    const reportFile = path.join(root, `${gate}-run.json`);
    const run = spawnSync(path.join(repo, ".software-factory/evidence", `${gate}-scenario.sh`), [reportFile], { encoding: "utf-8" });
    const out = `${run.stdout ?? ""}${run.stderr ?? ""}`;
    const walked = fs.existsSync(reportFile) ? (JSON.parse(fs.readFileSync(reportFile, "utf-8")) as { status: string; assertions: Assertion[] }) : undefined;

    const scratch = path.join(root, `${gate}-config`);
    fs.mkdirSync(path.join(scratch, "home", ".amy"), { recursive: true });
    await configureInto(scratch);
    const config = parse(fs.readFileSync(path.join(scratch, "home", ".amy", "config.yaml"), "utf-8")) as Record<string, unknown> & { plugins?: Record<string, Record<string, unknown>> };
    const named = MACHINE_KEYS.filter((key) => key in config);
    const slice = config.plugins?.[WORKSPACE_PLUGIN] ?? {};
    const passed = run.status === 0 && walked?.status === "passed" && named.length === 0 && Array.isArray(slice.repos) && typeof slice.workspaceRoot === "string";
    ok &&= passed;
    found[gate] = {
      status: walked?.status,
      assertions: walked?.assertions.length,
      failed: walked?.assertions.filter((assertion) => assertion.status !== "passed").map((assertion) => assertion.type),
      machineKeys: named,
      workspaceSlice: Object.keys(slice),
      ...(passed ? {} : { out: out.slice(-2000) }),
    };
  }
  return [ok, found];
}

/**
 * A5, as the amy-update scenario proves it: an old machine's seven keys moved
 * under the plugins that read them, the original kept, a key put back refused
 * by name. Run here as it stands, and its one assertion carried over.
 */
function theUpdateMovesTheWorkspace(): [boolean, unknown] {
  const reportFile = path.join(root, "amy-update-run.json");
  const run = spawnSync(path.join(repo, ".software-factory/evidence", "amy-update-scenario.sh"), [reportFile], { encoding: "utf-8" });
  const walked = fs.existsSync(reportFile) ? (JSON.parse(fs.readFileSync(reportFile, "utf-8")) as { assertions: Assertion[] }) : undefined;
  const moved = walked?.assertions.find((assertion) => assertion.type === "update.the_workspace_moves_into_its_plugin");
  return [moved?.status === "passed", { exit: run.status, moved, ...(moved?.status === "passed" ? {} : { out: `${run.stdout ?? ""}${run.stderr ?? ""}`.slice(-2000) }) }];
}

/** Every packaged plugin, installed where amy looks for them, as `amy add` would. */
function installPlugins(): void {
  const tarballs = process.env.AMY_E2E_TARBALLS;
  if (!tarballs) throw new Error("the scenario did not name the packaged plugins");
  const packed = fs.readdirSync(tarballs).filter((name) => name.endsWith(".tgz")).map((name) => path.join(tarballs, name)).map((file) => ({
    file,
    manifest: JSON.parse(execFileSync("tar", ["-xOf", file, "package/package.json"], { encoding: "utf-8" })) as { name: string },
  }));
  const prefix = path.join(amyHome, "plugins");
  const overrides = Object.fromEntries(packed.filter(({ manifest }) => manifest.name !== "@amykit/cli").map(({ file, manifest }) => [manifest.name, `file:${file}`]));
  fs.mkdirSync(prefix, { recursive: true });
  fs.writeFileSync(path.join(prefix, "package.json"), `${JSON.stringify({ name: "amy-e2e-plugins", private: true, dependencies: overrides, overrides }, null, 2)}\n`);
  const result = spawnSync("npm", ["install", "--prefix", prefix, "--no-audit", "--no-fund"], { encoding: "utf-8" });
  if (result.status !== 0) throw new Error(`could not install the packaged plugins: ${result.stderr}`);
}

/** A stand-in in its own process, listening on the port it writes down. */
function serve(script: string, ...args: string[]): string {
  const portFile = args.at(-1)!;
  const child = spawn(TSX, [script, ...args], { stdio: "ignore" });
  children.push(child);
  if (process.env.AMY_E2E_PIDFILE) fs.appendFileSync(process.env.AMY_E2E_PIDFILE, `${child.pid}\n`);
  const deadline = Date.now() + 20_000;
  while (!fs.existsSync(portFile) || fs.readFileSync(portFile, "utf-8").trim() === "") {
    if (Date.now() > deadline) throw new Error(`${path.basename(script)} never listened`);
    spawnSync("sleep", ["0.1"]);
  }
  return fs.readFileSync(portFile, "utf-8").trim();
}

function stateOf(id: string): string | undefined {
  for (const file of [path.join(amyHome, PROFILE, "records", `${id}.json`), path.join(amyHome, "records", `${id}.json`)]) {
    if (fs.existsSync(file)) return (JSON.parse(fs.readFileSync(file, "utf-8")) as { state: string }).state;
  }
  return undefined;
}

function lines<T>(file: string): T[] {
  if (!fs.existsSync(file)) return [];
  return fs.readFileSync(file, "utf-8").split("\n").filter(Boolean).map((line) => JSON.parse(line) as T);
}
