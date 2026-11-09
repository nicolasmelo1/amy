// The proof behind `plugin-telegram`: the installed amy, driving
// `ticket-to-qa` with the Telegram plugin as its conversation, asks a
// ticket's question in that ticket's own topic of the operator's private
// chat with the bot; the operator answers there, and only that ticket reads
// the answer and moves on.
//
// Usage: tsx drive.ts <repo> <amy-binary> <report-path> [--keep]
//
// The world is the ticket-to-qa scenario's — the stand-in Linear, `gh` and
// agent, real git — with a second ticket in progress, and Telegram's Bot
// API served by a stand-in held to the vendored contract. Every `amy` here
// is its own process, so the question is asked by one and the answer read by
// another: a restart between them is every look.
import { execFileSync, spawn, spawnSync, type ChildProcess } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { OPERATOR, SOMEBODY_ELSE, TOKEN } from "../../../plugins/telegram/tests/stand-in.js";
import { TICKET, build, configure, editRoster, lines, read, write, type TrackerState } from "../ticket-to-qa/world.js";

const [repo = "", binary = "", reportPath = ""] = process.argv.slice(2);
if (!repo || !binary || !reportPath) {
  console.error("usage: tsx drive.ts <repo> <amy-binary> <report-path> [--keep]");
  process.exit(2);
}
const keep = process.argv.includes("--keep");
const TSX = path.join(repo, "node_modules", ".bin", "tsx");
const world = path.join(repo, ".software-factory/evidence/ticket-to-qa");

/** A second ticket, in progress and asking its own question, which an answer to the first must not move. */
const OTHER = "BILL-4030";
const OTHER_TITLE = "Round nothing on the invoice";
const TITLE = "Show the currency on the invoice total";
const ANSWER = "BRL, beside the total";

interface Assertion { type: string; status: "passed" | "failed"; detail?: unknown }
const assertions: Assertion[] = [];
const record = (type: string, ok: boolean, detail?: unknown) => assertions.push({ type, status: ok ? "passed" : "failed", ...(detail === undefined ? {} : { detail }) });

interface TelegramWorld {
  topics: Record<string, string>;
  sent: { topic: number; text: string }[];
  pending: number;
  violations: string[];
  calls: string[];
}

const root = fs.mkdtempSync(path.join(os.tmpdir(), "amy-telegram-"));
const home = path.join(root, "home");
const recordsDir = path.join(home, ".amy", "tickets", "records");
const children: ChildProcess[] = [];

const amy = (...args: string[]) => {
  const result = spawnSync(binary, args, {
    cwd: home, encoding: "utf-8",
    env: { ...process.env, AMY_E2E_TSX: TSX, PATH: `${path.join(root, "bin")}:${process.env.PATH}`, HOME: home, AMY_E2E_WORLD: path.join(root, "world"), AMY_E2E_ORIGINS: path.join(root, "origins") },
  });
  return { code: result.status, out: `${result.stdout ?? ""}${result.stderr ?? ""}`.trim() };
};

try {
  build(root, { source: world });
  addSecondTicket();
  const tracker = serve(path.join(world, "tracker.ts"), path.join(root, "world", "tracker.json"), path.join(root, "world", "tracker.port"));
  const telegram = serve(path.join(repo, ".software-factory/evidence/plugin-telegram/bot-api.ts"), path.join(root, "world", "telegram.port"));
  const bot = `http://127.0.0.1:${telegram}`;
  const said = async (text: string, where: { topic?: number; from?: number } = {}) =>
    void (await fetch(`${bot}/operator/say`, { method: "POST", body: JSON.stringify({ text, ...where }) }));
  const telegramWorld = async () => (await (await fetch(`${bot}/operator/world`)).json()) as TelegramWorld;

  amy("init");
  configure(root, `http://127.0.0.1:${tracker}/graphql`);
  fs.appendFileSync(path.join(home, ".amy", "config.yaml"), `
# The conversation: one topic per ticket in the operator's private chat with
# the bot, on a stand-in Bot API.
extraPlugins:
  - "@amykit/plugin-telegram"
`);
  const config = fs.readFileSync(path.join(home, ".amy", "config.yaml"), "utf-8").replace(/^plugins:\n/m, `plugins:\n  "@amykit/plugin-telegram":\n    operator: "${OPERATOR}"\n    server: ${bot}\n`);
  fs.writeFileSync(path.join(home, ".amy", "config.yaml"), config);
  fs.appendFileSync(path.join(home, ".env"), `TELEGRAM_BOT_TOKEN=${TOKEN}\n`);
  installPlugins();
  editRoster(root);
  amy("roster", "confirm");

  const doctor = amy("doctor");
  const telegramLines = doctor.out.split("\n").filter((line) => /\btelegram (bot|chat|updates)\b/.test(line));
  record("telegram.doctor_asks_telegram_and_passes",
    telegramLines.length === 3 && ["bot", "chat", "updates"].every((part) => telegramLines.some((line) => line.startsWith("ok") && line.includes(`telegram ${part}`))),
    telegramLines);

  // Until both tickets have asked: each in its own topic, each by its own process.
  amy("discover");
  for (let tick = 0; tick < 30; tick += 1) {
    const result = amy("tick");
    if (result.code !== 0) throw new Error(`amy tick exited ${result.code}: ${result.out}`);
    if (stateOf(TICKET) === "CLARIFYING" && stateOf(OTHER) === "CLARIFYING") break;
  }
  const asked = await telegramWorld();
  const topicOf = (title: string) => Number(Object.entries(asked.topics).find(([, name]) => name === title)?.[0]);
  const questionsOnTracker = lines<{ query?: string; variables?: { input?: { body?: string } } }>(path.join(root, "world", "tracker.log"))
    .filter((call) => /commentCreate/.test(call.query ?? "") && /currency/i.test(call.variables?.input?.body ?? ""));
  record("telegram.a_question_reaches_its_own_topic",
    Object.keys(asked.topics).length === 2 &&
      asked.sent.some((message) => message.topic === topicOf(TITLE) && message.text.includes("Should the invoice total use BRL?")) &&
      asked.sent.some((message) => message.topic === topicOf(OTHER_TITLE)) &&
      questionsOnTracker.length === 0,
    { topics: asked.topics, sent: asked.sent, questionsOnTracker: questionsOnTracker.length, states: [stateOf(TICKET), stateOf(OTHER)] });

  // The operator answers in the first ticket's topic. Somebody else writes
  // there too, and the operator says something outside every topic.
  await said("USD", { topic: topicOf(TITLE), from: SOMEBODY_ELSE });
  await said("EUR, for everything");
  await said(ANSWER, { topic: topicOf(TITLE) });

  for (let tick = 0; tick < 10 && stateOf(TICKET) === "CLARIFYING"; tick += 1) {
    const result = amy("tick");
    if (result.code !== 0) throw new Error(`amy tick exited ${result.code}: ${result.out}`);
  }
  const reread = lines<{ step: string; prompt: string }>(path.join(root, "world", "claude.log"))
    .filter((call) => call.step === "triage" && call.prompt.includes(ANSWER));
  record("telegram.the_answer_moves_its_own_ticket_and_no_other",
    stateOf(TICKET) !== "CLARIFYING" && stateOf(OTHER) === "CLARIFYING" &&
      reread.length >= 1 && reread.every((call) => !call.prompt.includes("USD") && !call.prompt.includes("EUR, for everything")),
    { states: { [TICKET]: stateOf(TICKET), [OTHER]: stateOf(OTHER) }, rereads: reread.length });

  const after = await telegramWorld();
  record("telegram.every_call_is_one_the_bot_api_takes", after.violations.length === 0 && after.pending === 0, { violations: after.violations, pending: after.pending, calls: [...new Set(after.calls)] });

  const leaked = filesUnder(path.join(home, ".amy")).filter((file) => fs.readFileSync(file).includes(TOKEN));
  record("telegram.the_token_is_in_no_file_amy_wrote", leaked.length === 0, leaked);
} catch (error) {
  record("telegram.the_scenario_ran", false, error instanceof Error ? error.message : String(error));
} finally {
  for (const child of children) child.kill();
  if (!keep) fs.rmSync(root, { recursive: true, force: true });
  else console.log(`kept the world in ${root}`);
}

const failed = assertions.filter((assertion) => assertion.status !== "passed");
const report = {
  scenario: "plugin-telegram",
  goal: "Prove ticket-to-qa, mounted through the installed executable with the Telegram plugin as its conversation, asks each ticket's question in that ticket's own topic of the operator's private chat with the bot, and that the operator's answer there, read by a later process, moves that ticket and no other, with every call one the Bot API takes and the token in no file amy wrote.",
  status: failed.length === 0 ? "passed" : "failed",
  assertions,
};
fs.writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`);
for (const assertion of assertions) console.log(`${assertion.status === "passed" ? "✓" : "✗"} ${assertion.type}${assertion.status === "passed" ? "" : ` ${JSON.stringify(assertion.detail)}`}`);
process.exit(failed.length === 0 ? 0 : 1);

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
  return fs.existsSync(file) ? read<{ state: string }>(file).state : undefined;
}

function installPlugins(): void {
  const tarballs = process.env.AMY_E2E_TARBALLS;
  if (!tarballs) throw new Error("the scenario did not name the packaged plugins");
  const packed = fs.readdirSync(tarballs).filter((name) => name.endsWith(".tgz")).map((name) => path.join(tarballs, name)).map((file) => ({
    file,
    manifest: JSON.parse(execFileSync("tar", ["-xOf", file, "package/package.json"], { encoding: "utf-8" })) as { name: string },
  }));
  const prefix = path.join(home, ".amy", "plugins");
  const overrides = Object.fromEntries(packed.filter(({ manifest }) => manifest.name !== "@amykit/cli").map(({ file, manifest }) => [manifest.name, `file:${file}`]));
  fs.mkdirSync(prefix, { recursive: true });
  fs.writeFileSync(path.join(prefix, "package.json"), `${JSON.stringify({ name: "amy-e2e-plugins", private: true, dependencies: overrides, overrides }, null, 2)}\n`);
  const result = spawnSync("npm", ["install", "--prefix", prefix, "--no-audit", "--no-fund"], { encoding: "utf-8" });
  if (result.status !== 0) throw new Error(`could not install the packaged plugins: ${result.stderr}`);
}

function filesUnder(directory: string): string[] {
  if (!fs.existsSync(directory)) return [];
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(directory, entry.name);
    if (entry.isDirectory()) return entry.name === "node_modules" ? [] : filesUnder(full);
    return [full];
  });
}
