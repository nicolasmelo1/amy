import {
  Agent,
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
  Worktree,
  call,
  defineWorkflow,
  optional,
  port,
} from "@amykit/core";
import { after, before, decide } from "./machine.js";
import { DEFAULT_POLICY, Policy } from "./observation.js";
import { TicketRecord } from "./record.js";
import { EXAMPLE_ROSTER, ROSTER_FILE, Roster, confirmRoster, isConfirmedFor, loadRoster } from "./roster.js";
import { actionsFor, discover, observe, progress, remember, splitWorkId } from "./actions.js";
import { Finding, gateLane, selfReviewLane } from "./lanes.js";

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
  qaStatusName: {
    type: "string",
    required: true,
    example: "In QA",
    description: "the status a ticket moves to when it is handed to QA",
  },
  reviewerHints: {
    type: "record",
    description: "guidance appended to the review prompt when answering a particular reviewer, by host login",
    default: {},
  },
  "policy.maxImplementAttempts": {
    type: "number",
    default: 3,
    description: "how many times an agent may try to implement one ticket before it is escalated",
  },
  "policy.maxGateAttempts": {
    type: "number",
    default: 3,
    description: "how many times the gate may see one change before the work is escalated",
  },
  "policy.pollBackoffMs": {
    type: "number",
    default: 5 * 60 * 1000,
    description: "how long a waiting state holds before it looks again: waiting on an answer, or on a review",
  },
  "policy.rosterBackoffMs": {
    type: "number",
    default: 30 * 60 * 1000,
    description: "how long to hold while the roster is waiting to be confirmed",
  },
  "policy.maxOpenReviewsPerReviewer": {
    type: "number",
    default: 2,
    description:
      "how many open reviews one person may be carrying before this machine stops adding to their pile. Review time is somebody else's, and it is the one currency here that cannot be topped up",
  },
  "policy.maxPullRequestFiles": {
    type: "number",
    default: 60,
    description:
      "how large a pull request may get, in files, before this machine stops handing it to an agent. The forge has already told us the size, so a pull request nobody should automate is handed back before an agent is called. Zero switches it off",
  },
  "policy.maxPullRequestLines": {
    type: "number",
    default: 2000,
    description: "how large a pull request may get, in changed lines, under the same rule as maxPullRequestFiles. Zero switches it off",
  },
  "policy.writes": {
    type: "string",
    default: "machine",
    description:
      "machine: amy comments, opens pull requests, requests reviews and moves the ticket to QA. operator: each of those is said to you once instead, and amy waits until it sees you made it. Nothing is written on the tracker or the code host",
  },
  "policy.conversation": {
    type: "string",
    default: "answer",
    description:
      "answer: a reply in the work's thread is your decision, and the work moves on it. discuss: a reply is a turn in a discussion, answered in the thread while the work waits; mark the reply that decides and only that one moves it. A reply you marked reads as marked under either, and without a thread a comment on the ticket is always the decision",
  },
  budget: {
    type: "record",
    description: "agent budget, including an optional progress block that stops repeated no-evidence runs",
    default: {},
  },
} satisfies ConfigSchema;

export const needs = {
  tracker: port<Tracker>(),
  conversation: optional<Conversation>(),
  "code-host": port<CodeHost>(),
  agent: port<Agent & { ask(prompt: string, cwd: string, context?: AskContext): Promise<HarnessReply> }>(),
  gate: port<Gate>(),
  notifier: port<Notifier>(),
  brief: optional<BriefStore>(),
  worktree: optional<Worktree>(),
};

export const plugin = defineWorkflow({
  name: "ticket-to-qa",
  pluginName: "@amykit/workflow-ticket-to-qa",
  configSchema,
  policy: DEFAULT_POLICY,
  needs,
  // A project is brief, work and proof; a ticket's walk is the work half
  // alone. The ticket already carries its own statement of the work, and the
  // gate's scenario run before every pull request is what proves a ticket's
  // code holds — so no brief phase and no proving phase of amy's own.
  phases: {
    brief: "the ticket itself says what the work is; grooming a feature is not what this walk does, so no brief phase runs first",
    prove: "the command gate's scenario run after every implementation is what proves the work; this walk keeps no separate proving phase",
  },
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
  progress,
  discover,
  observe,
  actions: (scope) => actionsFor(scope.policy),
  remember,
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
