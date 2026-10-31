import {
  Agent,
  Action,
  ActionContext,
  ActionHandler,
  AskContext,
  BRANCH_SETTINGS,
  BriefStore,
  CodeHost,
  ConfigSchema,
  ConfigOf,
  Conversation,
  Gate,
  HarnessReply,
  Notifier,
  PluginContext,
  Tracker,
  WorkflowPieceContext,
  Worktree,
  call,
  defineWorkflow,
  optional,
  parseBudget,
  port,
} from "@amykit/core";
import { after, before, decide } from "./machine.js";
import { DEFAULT_POLICY, Observation, Policy } from "./observation.js";
import { TicketRecord } from "./record.js";
import { Roster } from "./roster.js";
import { ticketRuntime } from "./runtime.js";
import { WRITE_EFFECTS } from "./effects.js";
import { Finding, gateLane, selfReviewLane } from "./lanes.js";
import { splitWorkId } from "./runtime.js";

export const WORKFLOW_DATA = "workflow-data";

export interface Provider<T> {
  read(): T;
}

function rosterProvider(readFromHost?: () => Roster): () => Roster {
  if (readFromHost) return readFromHost;
  return () => {
    throw new Error(
      "no roster was contributed, and the workflow does not know where this machine keeps one — run `amy init` first",
    );
  };
}

export const configSchema = {
  repos: { type: "string[]", required: true, description: "every repository review load is counted across" },
  ...BRANCH_SETTINGS,
  qaStatusName: { type: "string", required: true, description: "the status a ticket moves to when it is handed to QA" },
  reviewerHints: {
    type: "record",
    description: "guidance appended to the review prompt when answering a particular reviewer, by host login",
    default: {},
  },
  policy: {
    type: "record",
    description:
      "maxImplementAttempts, maxGateAttempts, pollBackoffMs, rosterBackoffMs, maxOpenReviewsPerReviewer, maxPullRequestFiles, maxPullRequestLines, and writes — `machine` makes the tracker and code-host writes, `operator` hands each one to you once, in the work's thread or through the notifier, waits until it sees it made, and claims no writes at all — and conversation — `answer` reads a reply nobody marked as the decision, `discuss` reads it as a turn in a discussion, answered in the thread while the work waits for a reply marked as the decision. Anything left out keeps its default",
    default: {},
  },
  budget: {
    type: "record",
    description: "agent budget, including an optional progress block that stops repeated no-evidence runs",
    default: {},
  },
} satisfies ConfigSchema;

type Context = PluginContext<ConfigOf<typeof configSchema>>;

const needs = {
  tracker: port<Tracker>(),
  conversation: optional<Conversation>(),
  "code-host": port<CodeHost>(),
  agent: port<Agent & { ask(prompt: string, cwd: string, context?: AskContext): Promise<HarnessReply> }>(),
  gate: port<Gate>(),
  notifier: port<Notifier>(),
  brief: optional<BriefStore>(),
  worktree: optional<Worktree>(),
};

type Scope = WorkflowPieceContext<typeof configSchema, Policy, typeof needs>;
const built = new WeakMap<Scope, ReturnType<typeof ticketRuntime>>();

function runtimeFor(scope: Scope): ReturnType<typeof ticketRuntime> {
  const existing = built.get(scope);
  if (existing) return existing;
  const runtime = ticketRuntime({
    tracker: scope.ports.tracker,
    conversation: scope.ports.conversation,
    host: scope.ports["code-host"],
    agent: scope.ports.agent,
    gate: scope.ports.gate,
    notifier: scope.ports.notifier,
    roster: () => provided<Roster>(scope.ctx, "roster") ?? rosterProvider()(),
    ...scope.checkouts,
    briefs: scope.ports.brief,
    now: scope.ctx.now,
    log: scope.ctx.log,
    accountsAgentRuns: false,
    config: {
      repos: scope.config.repos,
      qaStatusName: scope.config.qaStatusName,
      reviewerHints: scope.config.reviewerHints as Record<string, string>,
    },
    progress: progressPolicy(scope.config.budget),
    policy: scope.policy,
  });
  built.set(scope, runtime);
  return runtime;
}

async function run(scope: Scope, work: ActionContext<TicketRecord, Observation>, effect: Action): Promise<void> {
  const handler = runtimeFor(scope).actions[effect.type] as ActionHandler<TicketRecord, Observation>;
  await handler(effect, work);
}

const actionNames = [
  "triage", "ask-question", "implement", "open-pull-request",
  "resolve-review-thread", "address-threads", "discuss", "assign-reviewer", "request-rereview",
  "escalate", "hand-off-to-qa", "announce", "hand-over",
] as const;

export const plugin = defineWorkflow({
  name: "ticket-to-qa",
  pluginName: "@amykit/workflow-ticket-to-qa",
  configSchema,
  policy: DEFAULT_POLICY,
  needs,
  trackerWrites: ({ policy }) => writesOf(policy) === "operator"
    ? []
    : ["comment", "set-status", "assign", "create-follow-up"],
  codeHostWrites: ({ policy }) => writesOf(policy) === "operator"
    ? []
    : ["open-pull-request", "request-review", "resolve-thread"],
  runtimePolicy: ({ ports, policy }) => ({
    ...policy,
    writes: writesOf(policy),
    conversation: conversationOf(policy, ports.conversation),
  }),
  // The gate and the self-review, as two lanes of the `checks` fork: each
  // lent the implementation's commit, read-only, and each folded back into
  // the record the implementation is retried from.
  calls: {
    GATE: call(gateLane, {
      input: (work: TicketRecord) => checkInput(work),
      revision: (work: TicketRecord) => work.implemented?.revision,
      output: {
        GREEN: (work: TicketRecord, found: Finding) => ({ ...work, lastGate: found }),
        RED: (work: TicketRecord, found: Finding) => ({ ...work, lastGate: found }),
      },
    }),
    SELF_REVIEW: call(selfReviewLane, {
      input: (work: TicketRecord) => ({ ...checkInput(work), ticketId: splitWorkId(work.id).ticketId }),
      revision: (work: TicketRecord) => work.implemented?.revision,
      output: {
        APPROVED: (work: TicketRecord, found: Finding) => ({ ...work, lastSelfReview: { ...found, verdict: "APPROVED" as const } }),
        CHANGES_ASKED: (work: TicketRecord, found: Finding) => ({ ...work, lastSelfReview: { ...found, verdict: "CHANGES_ASKED" as const } }),
      },
    }),
  },
  before,
  decide,
  after,
  record: () => ({ judged: [] }),
  progress: (scope) => runtimeFor(scope).progress,
  discover: (scope) => runtimeFor(scope).found(),
  observe: (scope, record) => runtimeFor(scope).observe(record),
  actions: (scope) => Object.fromEntries(actionNames
    .filter((name) => scope.policy.writes === "operator"
      ? !(WRITE_EFFECTS as readonly string[]).includes(name)
      : name !== "hand-over")
    .map((name) => [name, run])),
  remember: (scope, record, outcomes, observation, moved, decision, now) =>
    runtimeFor(scope).apply(record, decision, outcomes, observation, now, moved),
});


/** Where the work is and the commit to check, as both checks are called with it. */
function checkInput(work: TicketRecord): { repo: string; workId: string; revision?: string } {
  const repo = work.implemented?.repo;
  if (!repo) throw new Error(`${work.id} reached the checks with no repository recorded for its implementation`);
  return { repo, workId: work.id, ...(work.implemented?.revision ? { revision: work.implemented.revision } : {}) };
}

function writesOf(policy: Policy): Policy["writes"] {
  if (policy.writes !== "machine" && policy.writes !== "operator") {
    throw new Error(`ticket-to-qa policy.writes must be "machine" or "operator", not ${JSON.stringify(policy.writes)}`);
  }
  return policy.writes;
}

function conversationOf(policy: Policy, conversation: Conversation | undefined): Policy["conversation"] {
  if (policy.conversation !== "answer" && policy.conversation !== "discuss") {
    throw new Error(`ticket-to-qa policy.conversation must be "answer" or "discuss", not ${JSON.stringify(policy.conversation)}`);
  }
  return conversation ? policy.conversation : "answer";
}

function provided<T>(ctx: Context, name: string): T | undefined {
  const entry = ctx.contributions(WORKFLOW_DATA).get(name);
  return entry ? (entry as Provider<T>).read() : undefined;
}

function progressPolicy(budget: Record<string, unknown>) {
  const parsed = parseBudget(budget);
  if (!parsed.ok) throw new Error(parsed.problems.join("; "));
  return parsed.limits.progress;
}
