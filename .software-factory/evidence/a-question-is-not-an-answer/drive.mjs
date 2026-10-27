// Drives an escalated record through a discussion in a Slack thread, and
// writes down what the world looked like afterwards.
//
// Usage: node drive.mjs <repo> <report-path>
//
// What is real: the built ticket-to-qa workflow, its runtime and machine, the
// built serial engine and file queue, and the built Slack adapter with every
// byte it sends and reads. What is a stand-in: Slack's Web API, answered
// in-process from a thread the owner writes into, and the agent, the tracker,
// the code host and git, which this claim never reaches past.
//
// The owner only ever writes into the thread, the way a person would, and
// every assertion is read off the thread, the agent's prompts and the record
// on disk — never off the machine's own account of itself.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { URLSearchParams, pathToFileURL } from "node:url";
import { TextEncoder } from "node:util";

const [repo, reportPath] = process.argv.slice(2);
const dist = (relative) => import(pathToFileURL(path.join(repo, relative)).href);
const { dispatchesTo } = await dist("packages/core/dist/index.js");
const { SlackApi, SlackConversation } = await dist("plugins/slack/dist/index.js");
const { FileQueue } = await dist("plugins/file-queue/dist/index.js");
const { Worker } = await dist("plugins/serial-engine/dist/index.js");
const { DEFAULT_POLICY, ticketRuntime, ticketToQa } = await dist("packages/workflow-ticket-to-qa/dist/index.js");

const CHANNEL = "C0WORK";
const OWNER = "U0ADA";
const BOT = "U0AMY";
const TICKET = "BILL-7";
const ASKED = "2026-10-27T10:00:00.000Z";

/** A deep copy, the way a record leaves and re-enters the store. */
const clone = (value) => JSON.parse(JSON.stringify(value));

const assertions = [];
const record = (type, ok, detail) => assertions.push({ type, status: ok ? "passed" : "failed", ...(ok || detail === undefined ? {} : { detail }) });

/** Slack's Web API for one channel, answered from memory, shaped as Slack answers. */
function slackWorld() {
  const messages = [];
  let seq = 0;
  const ts = () => `${1793095200 + (seq += 1)}.000100`;
  const answer = (body) => ({ status: 200, headers: { "x-oauth-scopes": "chat:write,channels:read,channels:history,files:read" }, body: new TextEncoder().encode(JSON.stringify({ ok: true, ...body })) });
  const transport = async (request) => {
    const method = request.url.split("/").at(-1);
    const args = Object.fromEntries(new URLSearchParams(request.body ?? ""));
    if (method === "auth.test") return answer({ user_id: BOT, user: "amy", team: "Workshop" });
    if (method === "chat.postMessage") {
      const message = { ts: ts(), user: BOT, bot_id: "B0AMY", text: args.text, ...(args.thread_ts ? { thread_ts: args.thread_ts } : {}) };
      messages.push(message);
      return answer({ ts: message.ts, channel: CHANNEL });
    }
    if (method === "conversations.replies") {
      const oldest = Number(args.oldest ?? 0);
      const thread = messages.filter((m) => (m.ts === args.ts || m.thread_ts === args.ts) && Number(m.ts) >= oldest);
      return answer({ messages: thread.map((m) => clone(m)), has_more: false });
    }
    if (method === "conversations.history") return answer({ messages: [], has_more: false });
    throw new Error(`the stand-in Slack has no ${method}`);
  };
  const root = () => messages.find((m) => !m.thread_ts);
  return {
    transport,
    messages,
    /** The owner writes in the thread, optionally marking the reply with a reaction of their own. */
    say(text, reaction) {
      const message = { ts: ts(), thread_ts: root().ts, user: OWNER, text };
      if (reaction) message.reactions = [{ name: reaction, users: [OWNER], count: 1 }];
      messages.push(message);
      return message;
    },
    fromAmy: () => messages.filter((m) => m.thread_ts && m.user === BOT).map((m) => m.text),
  };
}

function world(conversationPolicy) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "amy-discussion-"));
  const slack = slackWorld();
  let clock = new Date("2026-10-27T10:01:00.000Z");
  const now = () => clock;
  const api = new SlackApi("xoxb-stand-in", { transport: slack.transport, sleep: async () => {} });
  const conversation = new SlackConversation(api, { channel: CHANNEL, operator: OWNER, directory: path.join(dir, "slack"), now });

  const ticket = {
    id: TICKET,
    title: "Show the currency on the invoice total",
    url: "https://tracker.example/BILL-7",
    repo: "acme/widgets",
    branchName: "amy/bill-7-currency",
    labels: [],
    body: "The total has no currency.",
    status: "In Progress",
  };
  const asks = [];
  const commits = [];
  const deps = {
    tracker: {
      inProgress: async () => [],
      get: async () => ticket,
      comments: async () => { throw new Error("the tracker is not where a thread's replies are read"); },
      hasReplyAfter: async () => { throw new Error("the tracker is not where a thread's replies are read"); },
      comment: async () => { throw new Error("a discussion writes nothing on the ticket"); },
      setStatus: async () => {},
      assign: async () => {},
      createFollowUp: async () => "BILL-8",
    },
    conversation,
    host: { findPullRequest: async () => null, reviewLoad: async () => ({}) },
    agent: {
      async ask(prompt, cwd, context = {}) {
        asks.push({ step: context.step, prompt });
        const run = { outcome: "completed", harness: "stand-in", model: "stand-in-1", durationMs: 1, costSource: "unknown", output: "" };
        const said = asks.filter((a) => a.step === "discuss").length;
        const reply = { text: context.step === "discuss" ? `answer ${said}` : "changed the test", run };
        return context.verify ? context.verify(reply) : reply;
      },
    },
    gate: { run: async () => ({ ok: true, output: "", at: clock.toISOString() }) },
    notifier: { announce: async () => {} },
    roster: () => ({ confirmedOn: "2026-10-27", qa: { tracker: "qa@example.test", available: true }, reviewers: [] }),
    now,
    config: { repos: ["acme/widgets"], qaStatusName: "In QA" },
    policy: { ...DEFAULT_POLICY, conversation: conversationPolicy },
    git: {
      pathFor: () => dir,
      acquire: async () => dir,
      prepareBranch: async () => {},
      commitAndPush: async (...args) => {
        commits.push(args);
        return true;
      },
    },
    layout: { workspaceRoot: dir, defaultBranch: "main" },
  };

  const records = new Map();
  records.set(TICKET, {
    id: TICKET,
    state: "ESCALATED",
    updatedAt: ASKED,
    attempts: { IMPLEMENTING: 3 },
    history: [{ at: ASKED, from: "IMPLEMENTING", to: "ESCALATED", why: "the agent failed 3 times" }],
    judged: [],
    resumeAt: "IMPLEMENTING",
    escalation: { reason: "Implementation failed 3 times: the invoice test expects no currency.", askedAt: ASKED, followUpTicketId: "BILL-8" },
  });
  const queue = new FileQueue(path.join(dir, "queue"));
  const worker = new Worker({
    queue,
    records: {
      load: (id) => (records.has(id) ? clone(records.get(id)) : null),
      save: (r) => records.set(r.id, clone(r)),
      all: () => [...records.values()],
    },
    workflow: ticketToQa,
    runtime: ticketRuntime(deps),
    notifier: deps.notifier,
    now,
    config: { staleClaimMs: 60000, retentionDays: 7, maxItemAttempts: 1, retryDelayMs: 0 },
  });

  return {
    slack,
    asks,
    commits,
    // The escalation was raised in the thread; the thread exists before anybody answers it.
    open: () => conversation.open(TICKET, ticket.title).then((thread) => conversation.post(thread, { text: `${TICKET} needs your call, answer in this thread` })),
    now: () => clock,
    tick: () => (clock = new Date(clock.getTime() + 60_000)),
    /** One look, as `amy poke` would make one, and the poll after it. */
    async look() {
      clock = new Date(clock.getTime() + 60_000);
      queue.enqueue({ workId: TICKET, reason: "poke" }, clock);
      const result = await worker.tick();
      if (result.kind === "failed" || result.kind === "parked") throw new Error(`${result.kind}: ${result.reason ?? result.error}`);
      return result;
    },
    record: () => records.get(TICKET),
    cleanup: () => fs.rmSync(dir, { recursive: true, force: true }),
  };
}

// Under `discuss`: three questions, three answers, no move; then a decision.
const discuss = world("discuss");
await discuss.open();
const questions = ["why did the agent fail three times?", "is the test wrong, or the code?", "what would you change?"];
let stayed = true;
// Every look counts an attempt in the state it looked at, a wait included;
// the look that only discussed must be the one that does not.
const counted = [];
for (const question of questions) {
  discuss.slack.say(question);
  const before = discuss.record().attempts.ESCALATED ?? 0;
  await discuss.look();
  counted.push((discuss.record().attempts.ESCALATED ?? 0) - before);
  await discuss.look();
  stayed &&= discuss.record().state === "ESCALATED";
}
const answers = discuss.slack.fromAmy().slice(1);
record(
  "escalated.a_question_does_not_resume",
  stayed && answers.length === 3 && answers.every((text, i) => text === `answer ${i + 1}`) && discuss.commits.length === 0,
  { stayed, answers, commits: discuss.commits.length },
);
record(
  "escalated.a_discussion_counts_no_attempt",
  counted.every((delta) => delta === 0) && discuss.record().attempts.IMPLEMENTING === 3,
  { counted, attempts: discuss.record().attempts },
);
record("escalated.a_discussion_is_charged_to_the_agent", dispatchesTo("discuss", "agent") && discuss.asks.filter((a) => a.step === "discuss").length === 3);

discuss.slack.say("change the test, keep the code", "white_check_mark");
await discuss.look();
const resumed = discuss.record();
record(
  "escalated.a_decision_resumes",
  resumed.state === "IMPLEMENTING" && resumed.history.at(-1)?.from === "ESCALATED" && Boolean(resumed.escalation?.resolvedAt),
  { state: resumed.state, last: resumed.history.at(-1) },
);
await discuss.look();
const implement = discuss.asks.find((a) => a.step === "implement")?.prompt ?? "";
const six = [
  `${OWNER} asked: ${questions[0]}`,
  "You answered: answer 1",
  `${OWNER} asked: ${questions[1]}`,
  "You answered: answer 2",
  `${OWNER} asked: ${questions[2]}`,
  "You answered: answer 3",
];
const decisionLine = `${OWNER} decided, and this settles it: change the test, keep the code`;
const block = [...six, decisionLine].map((line) => `- ${line}`).join("\n");
record(
  "conversation.decision_carries_the_discussion",
  implement.includes(block) && implement.lastIndexOf(OWNER) === implement.indexOf(decisionLine),
  { implement },
);
discuss.cleanup();

// Under `answer`: a marked discussion is answered and moves nothing; the
// first unmarked reply is the decision, as it always was.
const answer = world("answer");
await answer.open();
answer.slack.say("before you go on — why the test?", "speech_balloon");
await answer.look();
await answer.look();
const markedStayed = answer.record().state === "ESCALATED" && answer.slack.fromAmy().length === 2;
record("escalated.a_marked_discussion_never_resumes", markedStayed, { state: answer.record().state, posts: answer.slack.fromAmy() });
answer.slack.say("fine, change the test");
await answer.look();
record("escalated.an_unmarked_reply_under_answer_is_the_decision", answer.record().state === "IMPLEMENTING", { state: answer.record().state });
answer.cleanup();

const failed = assertions.filter((assertion) => assertion.status !== "passed");
fs.writeFileSync(
  reportPath,
  `${JSON.stringify(
    {
      scenario: "a-question-is-not-an-answer",
      status: failed.length === 0 ? "passed" : "failed",
      goal: "Prove that a reply in an escalated record's Slack thread is answered there and moves nothing until the owner decides, and that the decision resumes the work carrying the whole discussion.",
      artifact: { package: "@amykit/workflow-ticket-to-qa", entry: "the built dist of core, slack, file-queue, serial-engine and ticket-to-qa" },
      observed: { assertions_run: assertions.length, assertions_failed: failed.length, node: process.version },
      assertions,
    },
    null,
    2,
  )}\n`,
);
console.log(`${assertions.length - failed.length}/${assertions.length} assertions passed`);
for (const assertion of failed) console.log(`failed: ${assertion.type} ${JSON.stringify(assertion.detail)}`);
if (failed.length) process.exit(1);
