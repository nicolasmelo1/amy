// The proof behind `amy-answers-in-the-chat`: the installed amy, driving
// `ticket-to-qa` with Telegram as its conversation, answers in the operator's
// private chat outside every topic while its work goes on in the topics.
//
// Usage: tsx drive.ts <repo> <amy-binary> <report-path> [--keep]
//
// The world is plugin-telegram's, with the agent's chat answers scripted in
// chat.json. One loop, `amy daemon --supervised`, is run the way a supervisor
// would: started again after a failure, never after a clean exit. The real
// supervisors are proved by packages/cli/tests/supervisor.test.ts.
//
// A chat without topics is driven in-process through the built adapter.
import { execFileSync, spawn, spawnSync, type ChildProcess } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { BotApiStandIn, OPERATOR, TOKEN, botApiStandIn } from "../../../plugins/telegram/tests/stand-in.js";
import { TICKET, build, configure, editRoster, lines, read, write, type TrackerState } from "../ticket-to-qa/world.js";

const [repo = "", binary = "", reportPath = ""] = process.argv.slice(2);
if (!repo || !binary || !reportPath) {
  console.error("usage: tsx drive.ts <repo> <amy-binary> <report-path> [--keep]");
  process.exit(2);
}
const keep = process.argv.includes("--keep");
const TSX = path.join(repo, "node_modules", ".bin", "tsx");
const world = path.join(repo, ".software-factory/evidence/ticket-to-qa");

const OTHER = "BILL-4030";
const OTHER_TITLE = "Round nothing on the invoice";
const TITLE = "Show the currency on the invoice total";

interface Assertion { type: string; status: "passed" | "failed"; detail?: unknown }
const assertions: Assertion[] = [];
const record = (type: string, ok: boolean, detail?: unknown) => assertions.push({ type, status: ok ? "passed" : "failed", ...(detail === undefined ? {} : { detail }) });

interface TelegramWorld {
  topics: Record<string, string>;
  sent: { topic: number; text: string }[];
  inTheChat: { id: number; text: string }[];
  pending: number;
  violations: string[];
  calls: string[];
}
interface ClaudeCall { step: string; model: string; readOnly?: boolean; prompt: string }

/** What the stand-in `claude` answers in the chat, by the words of the person's newest message. */
const CHAT_SCRIPT = [
  { when: "what is waiting on me?", answer: "Two tickets wait on you: BILL-4021 and BILL-4030 each asked a question in its topic.\n\n```amy\nstop\n```" },
  { when: "note in the config that the chat was here", answer: "I would add the note to the config.", configLine: "# the chat was here" },
  { when: "groom BILL-4021", answer: "Grooming BILL-4021 through the workflow's brief.\n\n```amy\nbrief sections\nbrief write BILL-4021 Scope \"the total and its currency\"\n```" },
  { when: "remember the word kiwi", answer: "Noted: kiwi." },
  { when: "and the colour teal", answer: "Noted: teal." },
  { when: "what did I ask you to remember?", answer: "You asked me to remember kiwi and teal." },
  { when: "is the loop still up?", answer: "It is up, and both tickets are where you left them." },
  { when: "restart please", answer: "Restarting.\n\n```amy\nrestart\n```" },
  { when: "are you there?", answer: "It is up, answering here." },
  { when: "put the workflow back", answer: "Putting ticket-to-qa back and restarting.", configReplace: ["@amykit/workflow-not-installed", "@amykit/workflow-ticket-to-qa"], commands: ["config apply", "restart"] },
];

const root = fs.mkdtempSync(path.join(os.tmpdir(), "amy-chat-"));
const home = path.join(root, "home");
const amyDir = path.join(home, ".amy");
const configFile = path.join(amyDir, "config.yaml");
const recordsDir = path.join(amyDir, "tickets", "records");
const loopLog = path.join(root, "loop.log");
const children: ChildProcess[] = [];
/** What amy said in the chat that an assertion already read, so the next one waits for something new. */
const seen = new Set<string>();
const env = { ...process.env, AMY_E2E_TSX: TSX, PATH: `${path.join(root, "bin")}:${process.env.PATH}`, HOME: home, AMY_E2E_WORLD: path.join(root, "world"), AMY_E2E_ORIGINS: path.join(root, "origins") } as Record<string, string>;
delete env.AMY_HOME;
// The harness's own skills are the stand-in HOME's, never the operator's.
delete env.CLAUDE_CONFIG_DIR;

const amy = (...args: string[]) => {
  const result = spawnSync(binary, args, { cwd: home, encoding: "utf-8", env });
  return { code: result.status, out: `${result.stdout ?? ""}${result.stderr ?? ""}`.trim() };
};

/** The loop, and this run as its supervisor: started again after a failure, never after a clean exit. */
const loop = { pids: [] as number[], exits: [] as (number | null)[], wanted: true, current: undefined as ChildProcess | undefined };
function startLoop(): void {
  const child = spawn(binary, ["daemon", "--supervised", "--every", "1", "--log", loopLog], { cwd: home, env, stdio: "ignore" });
  loop.current = child;
  children.push(child);
  if (child.pid) loop.pids.push(child.pid);
  child.on("exit", (code) => {
    loop.exits.push(code);
    if (loop.wanted && code !== 0) setTimeout(startLoop, 300);
  });
}

try {
  build(root, { source: world });
  addSecondTicket();
  const tracker = serve(path.join(world, "tracker.ts"), path.join(root, "world", "tracker.json"), path.join(root, "world", "tracker.port"));
  const telegram = serve(path.join(repo, ".software-factory/evidence/plugin-telegram/bot-api.ts"), path.join(root, "world", "telegram.port"));
  const bot = `http://127.0.0.1:${telegram}`;
  const say = async (text: string, where: { topic?: number; quotes?: number } = {}) =>
    (await (await fetch(`${bot}/operator/say`, { method: "POST", body: JSON.stringify({ text, ...where }) })).json()) as { message_id: number };
  const telegramWorld = async () => (await (await fetch(`${bot}/operator/world`)).json()) as TelegramWorld;

  // The machine as the operator's `amy setup` left it: its state directory,
  // with the config the run writes next.
  fs.mkdirSync(path.join(home, ".amy"), { recursive: true });
  configure(root, `http://127.0.0.1:${tracker}/graphql`);
  let config = fs.readFileSync(configFile, "utf-8")
    .replace(/^plugins:\n/m, `plugins:\n  "@amykit/plugin-telegram":\n    operator: "${OPERATOR}"\n    server: ${bot}\n`)
    .replace(/^agent:\n {2}model: sonnet\n/m, "agent:\n  model: sonnet\n  ladder: [\"claude:sonnet\", \"claude:opus\"]\n")
    .replace(/(\n {6}- "@amykit\/plugin-serial-engine")/, `$1\n      - "@amykit/plugin-telegram"`);
  fs.writeFileSync(configFile, config);
  fs.appendFileSync(path.join(home, ".env"), `TELEGRAM_BOT_TOKEN=${TOKEN}\n`);
  write(path.join(root, "world", "chat.json"), CHAT_SCRIPT);
  // A skill the operator installed in their harness, and the config asking
  // for the harness's skills to be linked for the run.
  fs.mkdirSync(path.join(home, ".claude", "skills", "northwind-review"), { recursive: true });
  fs.writeFileSync(path.join(home, ".claude", "skills", "northwind-review", "SKILL.md"), "# northwind-review\n");
  // The chat later shows this config whole inside one Telegram message, so a
  // comment the run does not need makes room for the line.
  fs.writeFileSync(configFile, fs.readFileSync(configFile, "utf-8")
    .replace(/^# The question the machine asks the person[\s\S]*?\n(?=notify:)/m, "")
    .replace(/^defaultWorkflow: (.*)\n/m, "defaultWorkflow: $1\nharnessSkills: { claude: true }\n"));
  installPlugins();
  editRoster(root);
  amy("roster", "confirm");
  config = fs.readFileSync(configFile, "utf-8");

  startLoop();
  await until(() => stateOf(TICKET) === "CLARIFYING" && stateOf(OTHER) === "CLARIFYING", 180_000, "both tickets asking in their topics");
  await quiet();
  const asked = await telegramWorld();
  const topicOf = (title: string) => Number(Object.entries(asked.topics).find(([, name]) => name === title)?.[0]);
  const firstPid = loop.pids.at(-1)!;

  // The run linked the harness's skill into amy's own root, and copied nothing.
  const linked = path.join(amyDir, "skills", "northwind-review");
  const link = fs.lstatSync(linked, { throwIfNoEntry: false });
  record("chat.a_harness_skill_is_linked_for_the_run",
    link?.isSymbolicLink() === true && fs.readlinkSync(linked) === path.join(home, ".claude", "skills", "northwind-review"),
    { linked: link?.isSymbolicLink() ? fs.readlinkSync(linked) : "no link" });

  // An ask: answered in the chat, read-only, and the stop its answer names is not run.
  const writesBefore = writes();
  await say("what is waiting on me?");
  const ask = await answered("Two tickets wait on you");
  const askCall = chatCalls().at(-1);
  record("chat.an_ask_writes_nothing",
    ask.includes("Nothing ran: a command runs only when the message starts with /action.") &&
      askCall?.readOnly === true && alive(firstPid) && loop.pids.length === 1 &&
      fs.readFileSync(configFile, "utf-8") === config && writes() === writesBefore,
    { answer: ask, readOnly: askCall?.readOnly, loops: loop.pids, writes: [writesBefore, writes()] });

  // The same answer with and without /action: a config change, shown and applied only under /action.
  await say("note in the config that the chat was here");
  const without = await answered("I would add the note");
  const untouched = fs.readFileSync(configFile, "utf-8") === config;
  await say("/action note in the config that the chat was here");
  const withAction = await answered("config apply: written");
  config = fs.readFileSync(configFile, "utf-8");
  record("chat.only_an_action_acts",
    untouched && without.includes("Nothing ran") && withAction.includes("+ # the chat was here") && config.includes("# the chat was here") &&
      chatCalls().slice(-2).every((call) => call.readOnly === true),
    { without, withAction });

  // Grooming from the chat runs the mounted workflow's grooming: ticket-to-qa
  // declares none, so the workflow refuses the write and nothing is written.
  await quiet();
  const groomingBefore = writes();
  const briefsBefore = briefs();
  await say("/action groom BILL-4021");
  const grooming = await answered("amy brief sections: ");
  record("chat.grooming_writes_what_its_workflow_claims",
    /amy brief sections: (done|failed)/.test(grooming) && /amy brief write BILL-4021 Scope .*: failed/.test(grooming) &&
      writes() === groomingBefore && briefs() === briefsBefore,
    { grooming, writes: [groomingBefore, writes()] });

  // A conversation carries its turns, and a harness switched to mid-way is given them.
  await say("/new");
  await answered("A new conversation");
  await say("remember the word kiwi");
  await answered("Noted: kiwi");
  await say("and the colour teal");
  await answered("Noted: teal");
  await say("/harness claude:opus");
  await answered("answered by claude:opus from now on");
  await say("what did I ask you to remember?");
  await answered("You asked me to remember");
  const third = chatCalls().at(-1);
  record("chat.a_conversation_carries_its_turns",
    third?.model === "opus" &&
      /Person: remember the word kiwi\n\namy: Noted: kiwi\.\n\nPerson: and the colour teal\n\namy: Noted: teal\./.test(third.prompt) &&
      !third.prompt.includes("what is waiting on me?"),
    { model: third?.model, prompt: third?.prompt.slice(-600) });

  // The work threads still decide while the chat is read all the time.
  await say("/discuss why does it ask about rounding?", { topic: topicOf(OTHER_TITLE) });
  await until(() => lines<ClaudeCall>(path.join(root, "world", "claude.log")).some((call) => call.step === "discuss"), 60_000, "the discussion answered");
  await say("is the loop still up?");
  await answered("It is up");
  await say("BRL, beside the total", { topic: topicOf(TITLE) });
  await until(() => stateOf(TICKET) !== "CLARIFYING", 120_000, `${TICKET} moving on its unmarked answer`);
  const heldByDiscussion = stateOf(OTHER) === "CLARIFYING";
  await say("/decide round half up", { topic: topicOf(OTHER_TITLE) });
  await until(() => stateOf(OTHER) !== "CLARIFYING", 120_000, `${OTHER} moving on its decision`);
  record("chat.the_work_thread_still_decides", heldByDiscussion && stateOf(TICKET) !== "CLARIFYING" && stateOf(OTHER) !== "CLARIFYING",
    { states: { [TICKET]: stateOf(TICKET), [OTHER]: stateOf(OTHER) }, heldByDiscussion });

  // A restart lets only a booting mount through.
  await quiet();
  const running = loop.pids.at(-1)!;
  const broken = config.replace(/workflow: "@amykit\/workflow-ticket-to-qa"/, 'workflow: "@amykit/workflow-not-installed"');
  fs.writeFileSync(configFile, broken);
  await say("/action restart please");
  const refused = await answered("restart: not restarted");
  const stayed = alive(running) && loop.pids.at(-1) === running;
  fs.writeFileSync(configFile, config);
  await say("/action restart please");
  await answered("restart: the new mount boots");
  const restarted = await answered("Restarted: pid");
  const newPid = Number(/Restarted: pid (\d+), was (\d+)/.exec(restarted)?.[1]);
  record("chat.a_restart_lets_only_a_booting_mount_through",
    stayed && refused.includes(`pid ${running}`) && /not restarted — the new mount does not boot[^\n]*\n```\n.+\n```/s.test(refused) &&
      loop.exits.includes(75) && newPid === loop.pids.at(-1) && newPid !== running && restarted.includes(`was ${running}`) && alive(newPid),
    { refused, restarted, loops: loop.pids, exits: loop.exits });

  // The chat outlives a broken mount: a loop killed with a config that does not
  // mount comes back answering in the chat, naming the failure, and takes /action.
  fs.writeFileSync(configFile, broken);
  process.kill(loop.pids.at(-1)!, "SIGKILL");
  await until(() => loop.pids.length >= 3 && alive(loop.pids.at(-1)!), 30_000, "the killed loop started again");
  const degraded = loop.pids.at(-1)!;
  await say("are you there?");
  const warned = await answered("The workflow did not mount");
  await say("/action put the workflow back");
  const healed = await answered("Restarted: pid");
  const healedPid = Number(/Restarted: pid (\d+)/.exec(healed)?.[1]);
  await until(() => fs.readFileSync(loopLog, "utf-8").includes(`loop up as pid ${healedPid}, looking every 1s`), 30_000, "the healed loop driving work again");
  record("chat.the_chat_outlives_a_broken_mount",
    /^⚠️ The workflow did not mount, so only the chat is running: .+\n\nIt is up/s.test(warned) &&
      fs.readFileSync(configFile, "utf-8") === config && healedPid === loop.pids.at(-1) && healedPid !== degraded && !healed.includes("did not mount"),
    { warned, healed, loops: loop.pids });

  const after = await telegramWorld();
  record("chat.every_call_is_one_the_bot_api_takes", after.violations.length === 0, { violations: after.violations, calls: [...new Set(after.calls)] });

  record("chat.a_chat_without_threads_is_addressed_not_guessed", ...await withoutTopics());
} catch (error) {
  record("chat.the_scenario_ran", false, { error: error instanceof Error ? error.message : String(error), log: fs.existsSync(loopLog) ? fs.readFileSync(loopLog, "utf-8").slice(-4000) : "" });
} finally {
  loop.wanted = false;
  for (const child of children) child.kill();
  if (!keep) fs.rmSync(root, { recursive: true, force: true });
  else console.log(`kept the world in ${root}`);
}

const failed = assertions.filter((assertion) => assertion.status !== "passed");
const report = {
  scenario: "amy-answers-in-the-chat",
  goal: "Prove the installed amy, its loop supervised and its work going on in Telegram topics, answers the operator's private chat: an ask read-only and running nothing, /action running only amy's own commands, a conversation carried whole across a harness switch, the work threads still deciding, a restart let through only when the new mount boots, and the chat outliving a broken mount; and that a chat without topics reaches a work only when a message is addressed to it.",
  status: failed.length === 0 ? "passed" : "failed",
  assertions,
};
fs.writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`);
for (const assertion of assertions) console.log(`${assertion.status === "passed" ? "✓" : "✗"} ${assertion.type}${assertion.status === "passed" ? "" : ` ${JSON.stringify(assertion.detail)}`}`);
process.exit(failed.length === 0 ? 0 : 1);

/** The newest thing amy said in the chat that holds `words`, waiting for it. */
async function answered(words: string): Promise<string> {
  let found: string | undefined;
  await until(async () => {
    const said = (await (await fetch(`http://127.0.0.1:${fs.readFileSync(path.join(root, "world", "telegram.port"), "utf-8").trim()}/operator/world`)).json()) as TelegramWorld;
    found = [...said.inTheChat].reverse().find((one) => one.text.includes(words))?.text;
    return found !== undefined && !seen.has(found);
  }, 90_000, `amy to say "${words}" in the chat`);
  seen.add(found!);
  return found!;
}

/** Waits for something to hold, or says what never did. */
async function until(what: () => boolean | Promise<boolean>, ms: number, waiting: string): Promise<void> {
  const deadline = Date.now() + ms;
  while (Date.now() < deadline) {
    if (await what()) return;
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(`waited ${ms / 1000}s for ${waiting}`);
}

/** Until nothing writes to the tracker or the code host for a while: the work is parked. */
async function quiet(): Promise<void> {
  let last = writes();
  let since = Date.now();
  await until(() => {
    const now = writes();
    if (now !== last) {
      last = now;
      since = Date.now();
    }
    return Date.now() - since > 6_000;
  }, 180_000, "the work to park");
}

/** Every write the tracker and the code host took, as one count. */
function writes(): number {
  const tracker = lines<{ query?: string }>(path.join(root, "world", "tracker.log")).filter((call) => /^\s*mutation\b/.test(call.query ?? "")).length;
  const host = lines<{ argv?: string[] }>(path.join(root, "world", "gh.log")).filter((call) => {
    const argv = call.argv ?? [];
    return ["create", "edit", "merge", "comment", "review", "close", "ready"].includes(argv[1] ?? "") || argv.some((arg) => /^(POST|PATCH|PUT|DELETE)$/.test(arg));
  }).length;
  return tracker + host;
}

/** The brief store's files, as one string. */
function briefs(): string {
  const directory = path.join(amyDir, "briefs");
  return fs.existsSync(directory) ? fs.readdirSync(directory).sort().map((name) => fs.readFileSync(path.join(directory, name), "utf-8")).join("\0") : "";
}

function chatCalls(): ClaudeCall[] {
  return lines<ClaudeCall>(path.join(root, "world", "claude.log")).filter((call) => call.step === "chat");
}

function alive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

/**
 * A chat without topics, in-process through the built adapter and core: a
 * quote of amy's message for one work reaches it, a message starting with
 * another's id reaches that one, anything else is an ask answered in the chat,
 * and only /new starts another conversation.
 */
async function withoutTopics(): Promise<[boolean, unknown]> {
  const { BotApi, TelegramConversation } = await import(path.join(repo, "plugins/telegram/dist/index.js")) as typeof import("../../../plugins/telegram/src/index.js");
  const { answerTheChat } = await import(path.join(repo, "packages/core/dist/index.js")) as typeof import("../../../packages/core/src/index.js");
  const telegram: BotApiStandIn = botApiStandIn({ topicsEnabled: false });
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "amy-chat-unthreaded-"));
  try {
    const chat = new TelegramConversation(new BotApi(TOKEN, { transport: telegram.transport, sleep: async () => {} }), { operator: String(OPERATOR), directory: path.join(directory, "profile"), shared: path.join(directory, "bot"), topics: false });
    const one = await chat.open("PROJ-1", "Totals");
    const two = await chat.open("PROJ-2", "Taxes");
    const since = new Date(telegram.now() * 1000).toISOString();
    const forOne = Number(await chat.post(one, { text: "Which currency?" }));
    await chat.post(two, { text: "Which tax?" });

    telegram.say("BRL", { quotes: forOne });
    telegram.say("PROJ-2: the federal one");
    telegram.say("remember the word kiwi");
    const prompts: string[] = [];
    const harness = { name: "claude", ask: async (prompt: string) => (prompts.push(prompt), { text: `answer ${prompts.length}`, run: { outcome: "completed" } as never }) };
    const desk = { conversation: chat, harnesses: new Map([["claude", harness]]), cwd: directory, directory: path.join(directory, "chat"), commands: [], act: async () => ({ text: "" }) };
    await answerTheChat(desk);
    telegram.say("/new");
    await answerTheChat(desk);
    telegram.say("what was the word?");
    await answerTheChat(desk);

    const toOne = (await chat.replies(one, since)).map((reply) => reply.text);
    const toTwo = (await chat.replies(two, since)).map((reply) => reply.text);
    const ok = chat.threads === undefined &&
      JSON.stringify(toOne) === JSON.stringify(["BRL"]) && JSON.stringify(toTwo) === JSON.stringify(["the federal one"]) &&
      prompts.length === 2 && prompts[0]!.endsWith("Person: remember the word kiwi") && !prompts[1]!.includes("kiwi") &&
      telegram.inTheChat.some((said) => said.text === "A new conversation: nothing said before this is carried.");
    return [ok, { toOne, toTwo, prompts: prompts.map((prompt) => prompt.slice(-120)), said: telegram.inTheChat.map((said) => said.text) }];
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
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

/** A second ticket of mine in progress, asking a question of its own. */
function addSecondTicket(): void {
  const file = path.join(root, "world", "tracker.json");
  const state = read<TrackerState>(file);
  const first = state.issues.find((issue) => issue.identifier === TICKET)!;
  state.issues.push({ ...first, id: `uuid-${OTHER}`, identifier: OTHER, title: OTHER_TITLE, url: `https://tracker.test/issue/${OTHER}`, branchName: "amy/bill-4030-round-nothing-on-the-invoice", comments: [] });
  write(file, state);
}

function stateOf(id: string): string | undefined {
  const file = path.join(recordsDir, `${id}.json`);
  try {
    return fs.existsSync(file) ? read<{ state: string }>(file).state : undefined;
  } catch {
    return undefined;
  }
}

function installPlugins(): void {
  const tarballs = process.env.AMY_E2E_TARBALLS;
  if (!tarballs) throw new Error("the scenario did not name the packaged plugins");
  const packed = fs.readdirSync(tarballs).filter((name) => name.endsWith(".tgz")).map((name) => path.join(tarballs, name)).map((file) => ({
    file,
    manifest: JSON.parse(execFileSync("tar", ["-xOf", file, "package/package.json"], { encoding: "utf-8" })) as { name: string },
  }));
  const prefix = path.join(amyDir, "plugins");
  const overrides = Object.fromEntries(packed.filter(({ manifest }) => manifest.name !== "@amykit/cli").map(({ file, manifest }) => [manifest.name, `file:${file}`]));
  fs.mkdirSync(prefix, { recursive: true });
  fs.writeFileSync(path.join(prefix, "package.json"), `${JSON.stringify({ name: "amy-e2e-plugins", private: true, dependencies: overrides, overrides }, null, 2)}\n`);
  const result = spawnSync("npm", ["install", "--prefix", prefix, "--no-audit", "--no-fund"], { encoding: "utf-8" });
  if (result.status !== 0) throw new Error(`could not install the packaged plugins: ${result.stderr}`);
}
