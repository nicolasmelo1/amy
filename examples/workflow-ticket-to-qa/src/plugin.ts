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
  Tracker,
  Worktree,
  call,
  defineOperation,
  defineWorkflow,
  fail,
  optional,
  port,
  scopeOf,
  unitOf,
} from "@amykit/core";
import { z } from "zod";
import { after, before, decide } from "./machine.js";
import { DEFAULT_POLICY, ESCALATION, Policy } from "./observation.js";
import { TicketRecord } from "./record.js";
import { EXAMPLE_ROSTER, ROSTER_FILE, Roster, confirmRoster, isConfirmedFor, loadRoster } from "./roster.js";
import { isTicketId } from "./ticket.js";
import { actionsFor, discover, observe, progress, remember, splitWorkId } from "./actions.js";
import { Finding, gateLane, selfReviewLane } from "./lanes.js";

type Settings = ConfigOf<typeof configSchema>;

/** One person on the roster, as the roster operations answer it. */
const member = z.object({
  host: z.string().describe("login"),
  tracker: z.string().describe("tracker"),
  available: z.enum(["in", "out"]).describe("today"),
});

const roster = {
  reviewers: z.array(member).describe("reviewers"),
  qa: member.describe("qa"),
};

/** The roster as an operation answers it: who, and whether they are in. */
function rosterOutput(read: Roster) {
  const one = (person: Roster["qa"]) => ({ host: person.host, tracker: person.tracker, available: person.available ? "in" as const : "out" as const });
  return { reviewers: read.reviewers.map(one), qa: one(read.qa) };
}

const NO_ROSTER = { "ticket-to-qa.no_roster": { description: "the profile has no roster file, or one missing confirmedOn, reviewers or qa" } };

/** The roster file, or the declared error naming why it cannot be read. */
function readRoster(state: string, home: string): Roster | ReturnType<typeof fail> {
  try {
    return loadRoster(state, home);
  } catch (error) {
    return fail("ticket-to-qa.no_roster", error instanceof Error ? error.message : String(error));
  }
}

/**
 * Who is reviewing, as this workflow's own operations: `amy roster` and
 * `amy roster confirm`.
 *
 * It used to be the host's, on every install, for the one workflow that
 * assigns anybody. Here it is a file beside the profile's records: two teams
 * running two ticket-to-qa profiles do not share reviewers, and a machine
 * that never assigns one has no roster to keep.
 */
const showRoster = defineOperation({
  id: "ticket-to-qa.show-roster",
  domain: "ticket-to-qa",
  summary: "Print the roster and whether it is current",
  description: "Reads this profile's roster file and says who is in and whether it was confirmed today. Changes nothing.",
  input: z.object({}),
  output: z.object({
    confirmedOn: z.string().describe("confirmed on"),
    current: z.enum(["current", "stale"]).describe("today"),
    ...roster,
  }),
  errors: NO_ROSTER,
  writes: [],
  http: { method: "get", path: "/ticket-to-qa/roster" },
  cli: { words: ["roster", "show"], default: true },
  examples: [{
    summary: "a roster confirmed today",
    input: {},
    output: {
      confirmedOn: "2026-11-07",
      current: "current",
      reviewers: [{ host: "ada", tracker: "ada@example.test", available: "in" }],
      qa: { host: "grace", tracker: "grace@example.test", available: "in" },
    },
  }],
  async handler(_input, context) {
    const { state, home } = scopeOf<Settings>(context, "ticket-to-qa.show-roster");
    const read = readRoster(state, home);
    if ("error" in read) return read;
    return { confirmedOn: read.confirmedOn, current: isConfirmedFor(read, new Date()) ? "current" as const : "stale" as const, ...rosterOutput(read) };
  },
});

const confirmRosterOperation = defineOperation({
  id: "ticket-to-qa.confirm-roster",
  domain: "ticket-to-qa",
  summary: "Stamp the roster with today's date",
  description: "Writes today's date into this profile's roster file, so the machine assigns from it again today. Changes nobody on it.",
  input: z.object({}),
  output: z.object({
    confirmedOn: z.string().describe("confirmed for"),
    ...roster,
  }),
  errors: NO_ROSTER,
  writes: ["roster"],
  http: { method: "post", path: "/ticket-to-qa/roster/confirmation" },
  cli: { words: ["roster", "confirm"] },
  examples: [{
    summary: "confirming today's roster",
    input: {},
    output: {
      confirmedOn: "2026-11-07",
      reviewers: [{ host: "ada", tracker: "ada@example.test", available: "in" }],
      qa: { host: "grace", tracker: "grace@example.test", available: "in" },
    },
  }],
  async handler(_input, context) {
    const { state, home } = scopeOf<Settings>(context, "ticket-to-qa.confirm-roster");
    // Only a roster that cannot be read is the declared error; a write that
    // fails after it was read — a full disk, a read-only directory — is not,
    // and propagates as internal.
    const read = readRoster(state, home);
    if ("error" in read) return read;
    const confirmed = confirmRoster(state, new Date(), home);
    return { confirmedOn: confirmed.confirmedOn, ...rosterOutput(confirmed) };
  },
});

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
  onlyTickets: {
    type: "string[]",
    default: [] as string[],
    description:
      "the ticket ids this install works, and no others; empty is every ticket the tracker reports. An entry that is not a ticket id is refused at mount",
  },
  stackBases: {
    type: "record",
    default: {},
    description:
      "the parent each ticket's branch is cut from, by ticket id, for a stack its description does not state. An entry that is not a ticket id is refused at mount",
  },
  // The numbers every escalation rests on. A level is how many rounds it
  // allows before the work climbs one rung; the origins say which level each
  // kind of new work is counted at, and how much it must find to be counted at
  // the stricter one; the ladder's length is where a person is.
  "escalation.scale.patient": {
    type: "number",
    required: true,
    description: "how many rounds a patient level allows before the work climbs one rung",
  },
  "escalation.scale.normal": {
    type: "number",
    required: true,
    description: "how many rounds a normal level allows before the work climbs one rung",
  },
  "escalation.scale.immediate": {
    type: "number",
    required: true,
    description: "how many rounds an immediate level allows before the work climbs one rung",
  },
  "escalation.origins.gate.level": {
    type: "oneOf",
    group: "escalation.scale",
    default: "normal",
    description: "the level the gate's rounds are counted at",
  },
  "escalation.origins.gate.beyond": {
    type: "oneOf",
    group: "escalation.scale",
    default: "immediate",
    description: "the level the gate's rounds are counted at once a round brings back findingsAt findings or more",
  },
  "escalation.origins.gate.findingsAt": {
    type: "number",
    default: 3,
    description: "how many findings a gate's round must bring back for the beyond level to apply",
  },
  "escalation.origins.thread.level": {
    type: "oneOf",
    group: "escalation.scale",
    default: "normal",
    description: "the level a review thread's rounds are counted at",
  },
  "escalation.origins.thread.beyond": {
    type: "oneOf",
    group: "escalation.scale",
    default: "immediate",
    description: "the level a review thread's rounds are counted at once a round brings back findingsAt findings or more",
  },
  "escalation.origins.thread.findingsAt": {
    type: "number",
    default: 3,
    description: "how many findings a round of review threads must bring back for the beyond level to apply",
  },
  "escalation.origins.owner.level": {
    type: "oneOf",
    group: "escalation.scale",
    default: "immediate",
    description: "the level the owner's word is counted at: what the person whose ticket it is asks for is not a round to be patient about",
  },
  "escalation.origins.self-review.level": {
    type: "oneOf",
    group: "escalation.scale",
    default: "normal",
    description: "the level the work's own review of itself is counted at",
  },
  "escalation.origins.self-review.beyond": {
    type: "oneOf",
    group: "escalation.scale",
    default: "immediate",
    description: "the level the self-review's rounds are counted at once a round brings back findingsAt findings or more",
  },
  "escalation.origins.self-review.findingsAt": {
    type: "number",
    default: 3,
    description: "how many findings the self-review must bring back for the beyond level to apply",
  },
  "escalation.rungs": {
    type: "number",
    default: 3,
    description: "how long the ladder is; its last rung is a person, so work that runs out one rung below escalates",
  },
  // The rule set the decision reads. It is filled from the `escalation` block
  // above at every mount, and declared here so the policy's defaults are the
  // schema's own rather than a second answer kept somewhere else.
  "policy.escalation": {
    type: "record",
    default: ESCALATION as unknown as Record<string, unknown>,
    description: "the levels, origins and ladder an escalation is counted on, read from the escalation block",
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

/**
 * The policy the declaration is held to, and the decision reads.
 *
 * `DEFAULT_POLICY` without the two attempt ceilings this move replaces: both
 * were settings once, and neither is any more. What is left is every number a
 * decision reads that `config.yaml` still names, plus the escalation rules,
 * which are filled from the `escalation` block at every mount.
 */
const MOUNTED_POLICY: Policy = {
  escalation: ESCALATION,
  pollBackoffMs: DEFAULT_POLICY.pollBackoffMs,
  rosterBackoffMs: DEFAULT_POLICY.rosterBackoffMs,
  maxOpenReviewsPerReviewer: DEFAULT_POLICY.maxOpenReviewsPerReviewer,
  maxPullRequestFiles: DEFAULT_POLICY.maxPullRequestFiles,
  maxPullRequestLines: DEFAULT_POLICY.maxPullRequestLines,
  writes: DEFAULT_POLICY.writes,
  conversation: DEFAULT_POLICY.conversation,
  // Read by a record saved before rounds were counted per origin, and by
  // nothing this version writes. `policyFits` holds them to the schema, which
  // declares no such setting, so they are left off here and put back on the
  // runtime, where a folded record's attempts are all that reads them.
} as unknown as Policy;

export const plugin = defineWorkflow({
  name: "ticket-to-qa",
  pluginName: "@amykit/workflow-ticket-to-qa",
  configSchema,
  // The policy the decision reads, without the two attempt ceilings this move
  // replaces: both were settings, both are gone from the schema, and a record
  // saved by a version that counted them is read against their last values
  // (`DEFAULT_POLICY`), never against a number written here.
  policy: MOUNTED_POLICY,
  needs,
  // A project is brief, work and proof; a ticket's walk is the work half
  // alone. The ticket already carries its own statement of the work, and the
  // gate's scenario run before every pull request is what proves a ticket's
  // code holds — so no brief phase and no proving phase of amy's own.
  phases: {
    brief: "the ticket itself says what the work is; grooming a feature is not what this walk does, so no brief phase runs first",
    prove: "the command gate's scenario run after every implementation is what proves the work; this walk keeps no separate proving phase",
  },
  // Where work comes back from, and the kinds of new work each of those
  // states can raise. The diagram marks the same states `sendsBack`, and the
  // two lists are held equal at mount.
  origins: {
    GATE: ["gate"],
    SELF_REVIEW: ["self-review"],
    COPILOT_WAIT: ["thread", "gate"],
    REVIEWER_ASSIGNED: ["gate", "thread"],
    HUMAN_REVIEW: ["thread", "owner"],
  },
  // The one step whose reply its own `verify` judges, so the diagram marks it
  // `verified` and a second rung is asked of a run that did not hold.
  verifies: ["IMPLEMENTING"],
  // Publishing, as two actions of this workflow's own. The round's commits go
  // out from the workplace's tree — the port a tree comes from is the one
  // `push` needs mounted, and the git inside it is the workplace's, not a
  // port's. An answer goes back where the review was written: the work's own
  // thread where a chat is mounted, and the ticket where one is not, which is
  // the port every install of this walk has.
  catalogue: {
    push: { port: "worktree", method: "push" },
    "reply-thread": { port: "tracker", method: "comment" },
  },
  trackerWrites: ({ policy }) => writesOf(policy) === "operator"
    ? []
    : ["comment", "set-status", "assign", "create-follow-up"],
  codeHostWrites: ({ policy }) => writesOf(policy) === "operator"
    ? []
    : ["open-pull-request", "request-review", "resolve-thread"],
  runtimePolicy: ({ ports, policy, config }) => ({
    ...policy,
    // Kept on the runtime for a record saved before rounds were counted per
    // origin: its failed attempts were read against these, and its next look
    // still is. They are no longer settings, and no config may name them.
    maxImplementAttempts: DEFAULT_POLICY.maxImplementAttempts,
    maxGateAttempts: DEFAULT_POLICY.maxGateAttempts,
    escalation: escalationOf(config),
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
      // The unit's work id, never the call's: a project's phase record is
      // named for the call (`PROJ-1239/WORKFLOW#1`), and the brief is the
      // unit's, the same id triage and the project's gate read.
      input: (work: TicketRecord) => ({
        ...checkInput(work),
        workId: unitOf(work),
        ticketId: splitWorkId(unitOf(work)).ticketId,
      }),
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
  operations: [showRoster, confirmRosterOperation],
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

/**
 * The escalation rules the decision reads, from the `escalation` block.
 *
 * Two settings that name another setting's keys have no type the schema can
 * give them, so the ids an install limits itself with are checked here, at
 * mount, by that name: a value that is not a ticket id is a typo that would
 * silently work nothing, and it is refused with the value it read.
 */
function escalationOf(config: Settings): Policy["escalation"] {
  for (const id of config.onlyTickets ?? []) {
    if (!isTicketId(id)) {
      throw new Error(`\`onlyTickets\` names ${JSON.stringify(id)}, which is not a ticket id; name tickets by the id the tracker gives them`);
    }
  }
  for (const [ticket, parent] of Object.entries(config.stackBases ?? {})) {
    for (const id of [ticket, parent]) {
      if (!isTicketId(id)) {
        throw new Error(`\`stackBases\` names ${JSON.stringify(id)}, which is not a ticket id; a stack base is a ticket's id`);
      }
    }
  }
  return config.escalation as unknown as Policy["escalation"];
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
