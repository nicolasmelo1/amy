// A support inbox, in the shape somebody else would ship one: a request
// arrives as a file, an agent triages it and drafts the answer, the operator
// approves the draft in the conversation, and the answer is sent.
//
// It is the proof's fixture, not a package anybody installs: what it proves
// is that a workflow which never reads a repository mounts and walks on an
// install that names none and mounts no workspace. So it asks for an agent
// and a conversation, and for nothing a code workflow would.
import fs from "node:fs";
import path from "node:path";
import { advance, act, defineWorkflow, port, settled, wait } from "@amykit/core";
import type { Conversation, Harness, WorkRecord } from "@amykit/core";

interface SupportRecord extends WorkRecord {
  /** The answer the agent drafted, before anybody approved it. */
  draft?: string;
  /** How the agent filed the request. */
  triage?: string;
  /** The conversation thread the operator is asked in. */
  thread?: string;
  /** When the operator was asked, so only what was said after it is read. */
  askedAt?: string;
  /** When the answer went out. */
  sentAt?: string;
}

interface Observation {
  request: string;
  approved: boolean;
}

// Drafting is the core's generic ask of the agent, a prompt in and a piece of
// writing out; asking the operator and sending the answer run on the inbox's
// own desk, which is the port its catalogue names.
type Effect =
  | { type: "draft-plan" }
  | { type: "ask-operator" }
  | { type: "send-answer" };

interface Outcomes {
  draft?: string;
  triage?: string;
  "ask-operator"?: { thread: string; askedAt: string };
  "send-answer"?: { sentAt: string };
}

const DESK = "desk";

interface Desk {
  ask(record: SupportRecord): Promise<{ thread: string; askedAt: string }>;
  send(record: SupportRecord): Promise<{ sentAt: string }>;
}

const configSchema = {
  inbox: {
    type: "string",
    default: "requests",
    description: "where a request arrives, as one file per request, relative to the state root",
  },
  outbox: {
    type: "string",
    default: "answers",
    description: "where an approved answer is sent, as one file per request, relative to the state root",
  },
  "policy.backoffMs": {
    type: "number",
    default: 60_000,
    description: "how long a draft waits for the operator before it is looked at again",
  },
} as const;

/** The operator's word for "send it", said on its own line of a reply. */
const APPROVAL = /^\s*(approve|approved|send it)\b/im;

const requestFile = (state: string, inbox: string, id: string): string => path.join(state, inbox, `${id}.md`);

export const plugin = defineWorkflow({
  name: "support",
  pluginName: "@acme/workflow-support-inbox",
  configSchema,
  policy: { backoffMs: 60_000 },
  needs: {
    agent: port<Harness>(),
    conversation: port<Conversation>(),
    desk: port<Desk>(),
  },
  record: (): Partial<SupportRecord> => ({}),
  decide: {
    ARRIVED: (record: SupportRecord) =>
      record.draft
        ? advance("AWAITING_APPROVAL", "the agent drafted an answer, and the operator is asked", { type: "ask-operator" } as Effect)
        : act("the agent triages the request and drafts the answer", { type: "draft-plan" } as Effect),
    AWAITING_APPROVAL: (_record: SupportRecord, observation: Observation, policy: { backoffMs: number }) =>
      observation.approved
        ? advance("SENT", "the operator approved the draft", { type: "send-answer" } as Effect)
        : wait(policy.backoffMs, "the draft waits for the operator"),
    SENT: () => settled("the answer was sent"),
  },
  // A request is a file somebody's mail rule dropped in a directory.
  discover: async ({ ctx, config }) => {
    const inbox = path.join(ctx.paths.state, config.inbox);
    return fs.existsSync(inbox)
      ? fs.readdirSync(inbox).filter((file) => file.endsWith(".md")).map((file) => path.parse(file).name)
      : [];
  },
  observe: async ({ ctx, config, ports }, record: SupportRecord): Promise<Observation> => {
    const request = fs.readFileSync(requestFile(ctx.paths.state, config.inbox, record.id), "utf-8");
    if (!record.thread || !record.askedAt) return { request, approved: false };
    const replies = await ports.conversation.replies({ id: record.thread }, record.askedAt);
    return { request, approved: replies.some((reply) => APPROVAL.test(reply.text)) };
  },
  // The desk the inbox keeps: it asks the operator in the conversation and
  // sends what they approved. Its two actions are catalogued on it, so the
  // machine knows which port each one runs on; the conversation is read
  // through the context when the desk is used, so the one mounted after this
  // plugin is the one asked.
  extend: (registry, ctx) => {
    const desk: Desk = {
      async ask(record) {
        const conversation = ctx.port("conversation") as Conversation;
        const thread = await conversation.open(record.id, `Support request ${record.id}`);
        const askedAt = ctx.now().toISOString();
        await conversation.post(thread, {
          text: `A request filed under ${record.triage ?? "unsorted"}. The answer I would send:\n\n${record.draft ?? ""}\n\nSay "approve" to send it.`,
        });
        return { thread: thread.id, askedAt };
      },
      async send(record) {
        const outbox = path.join(ctx.paths.state, ctx.config.outbox);
        fs.mkdirSync(outbox, { recursive: true });
        fs.writeFileSync(path.join(outbox, `${record.id}.md`), `${record.draft ?? ""}\n`, "utf-8");
        return { sentAt: ctx.now().toISOString() };
      },
    };
    registry.action("ask-operator", { port: DESK, method: "ask" }, desk);
    registry.action("send-answer", { port: DESK, method: "send" }, desk);
  },
  actions: {
    "draft-plan": async ({ ctx, ports }, work) => {
      const { request } = work.observation as Observation;
      const reply = await ports.agent.ask(
        "Triage this support request and draft the answer the customer gets. " +
          "Start with one line `triage: <queue>`, then the answer.\n\n" + request,
        ctx.paths.state,
        { workId: work.record.id, step: "draft" },
      );
      if (reply.run.outcome !== "completed") return;
      const [first = "", ...rest] = reply.text.split("\n");
      const outcomes = work.outcomes as Outcomes;
      outcomes.triage = first.replace(/^triage:\s*/i, "").trim();
      outcomes.draft = rest.join("\n").trim();
    },
    "ask-operator": async ({ ports }, work) => {
      (work.outcomes as Outcomes)["ask-operator"] = await ports.desk.ask(work.record as SupportRecord);
    },
    "send-answer": async ({ ports }, work) => {
      (work.outcomes as Outcomes)["send-answer"] = await ports.desk.send(work.record as SupportRecord);
    },
  },
  remember: (_scope, current: SupportRecord, outcomes) => {
    const { draft, triage, "ask-operator": asked, "send-answer": sent } = outcomes as Outcomes;
    return {
      ...current,
      ...(draft === undefined ? {} : { draft, triage }),
      ...(asked ? { thread: asked.thread, askedAt: asked.askedAt } : {}),
      ...(sent ? { sentAt: sent.sentAt } : {}),
    };
  },
});
