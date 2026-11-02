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
  PluginCheck,
  PluginCommand,
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
import { EXAMPLE_ROSTER, ROSTER_FILE, Roster, confirmRoster, isConfirmedFor, loadRoster } from "./roster.js";
import { ticketRuntime } from "./runtime.js";
import { WRITE_EFFECTS } from "./effects.js";
import { Finding, gateLane, selfReviewLane } from "./lanes.js";
import { splitWorkId } from "./runtime.js";

type Settings = ConfigOf<typeof configSchema>;

/**
 * Who is reviewing, as this workflow's own command.
 *
 * It used to be the host's, on every install, for the one workflow that
 * assigns anybody. Here it is a file beside the profile's records: two teams
 * running two ticket-to-qa profiles do not share reviewers, and a machine
 * that never assigns one has no roster to keep.
 */
const rosterCommand: PluginCommand<Settings> = {
  name: "roster",
  description: "Who is reviewing today",
  subcommands: [
    {
      name: "confirm",
      description: "Stamp the roster with today's date",
      run({ state, home, out }) {
        const roster = confirmRoster(state, new Date(), home);
        out.line(`confirmed for ${roster.confirmedOn}`);
        for (const reviewer of roster.reviewers) {
          out.line(`  ${reviewer.available ? "in " : "out"} ${reviewer.host}`);
        }
        out.line(`  qa  ${roster.qa.available ? "in " : "out"} ${roster.qa.host}`);
      },
    },
    {
      name: "show",
      description: "Print the roster and whether it is current",
      default: true,
      run({ state, home, out }) {
        const roster = loadRoster(state, home);
        const now = new Date();
        const current = isConfirmedFor(roster, now);
        out.line(`confirmed on ${roster.confirmedOn}${current ? " (current)" : " (stale)"}`);
        for (const reviewer of roster.reviewers) {
          out.line(`  ${reviewer.available ? "in " : "out"} ${reviewer.host}  ${reviewer.tracker}`);
        }
        out.line(`  qa  ${roster.qa.available ? "in " : "out"} ${roster.qa.host}  ${roster.qa.tracker}`);
      },
    },
  ],
};

/** A roster nobody confirmed today is a review nobody would answer. */
const rosterCheck: PluginCheck<Settings> = {
  name: "roster confirmed for today",
  run({ state, home }) {
    const roster: Roster = loadRoster(state, home);
    const current = isConfirmedFor(roster, new Date());
    return {
      label: "roster confirmed for today",
      ok: current,
      detail: current ? "" : `last confirmed ${roster.confirmedOn}, run \`amy roster confirm\``,
    };
  },
};

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
    // With the recovery root named: the runtime's paths.state is the
    // machine's own state directory, and a phase's profile-own directory is
    // not its parent, so the fallback must not guess from dirname.
    roster: () => loadRoster(scope.ctx.paths.profile ?? scope.ctx.paths.state, scope.ctx.paths.state),
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
  commands: [rosterCommand],
  checks: [rosterCheck],
  files: [{ path: ROSTER_FILE, content: EXAMPLE_ROSTER }],
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

function progressPolicy(budget: Record<string, unknown>) {
  const parsed = parseBudget(budget);
  if (!parsed.ok) throw new Error(parsed.problems.join("; "));
  return parsed.limits.progress;
}
