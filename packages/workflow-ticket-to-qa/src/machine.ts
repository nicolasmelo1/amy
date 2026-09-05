import { Observation, Policy } from "./observation.js";
import { Plan, PullRequestView, ReviewThread, Workflow } from "@amykit/core";
import { USES_ACTIONS, act, advance, settled, wait } from "./effects.js";
import {
  TicketRecord,
  attemptsIn,
  disagreements,
  judgedThreadIds,
} from "./record.js";
import { TICKET_STATES, TicketState, WAITING_STATES } from "./state.js";
import {
  automatedReviewerSawHead,
  hasReviewedHead,
  unresolvedThreads,
} from "./review.js";
import { isConfirmedFor, leastLoadedReviewer } from "./roster.js";

/**
 * Decides the single next move for one ticket.
 *
 * Pure on purpose. Every branch below is a predicate over the record and the
 * observation, so the whole lifecycle can be driven in a test without a
 * tracker, a code host, a repository or an agent.
 */
export function plan(record: TicketRecord, obs: Observation, policy: Policy): Plan {
  switch (record.state) {
    case "DISCOVERED":
      return planDiscovered(record);
    case "CLARIFYING":
      return planClarifying(obs, policy);
    case "READY":
      return advance("IMPLEMENTING", "nothing is blocking the implementation");
    case "IMPLEMENTING":
      return planImplementing(record, policy);
    case "CHECKED":
      return planChecked(record, policy);
    case "PR_OPEN":
      return planPullRequestOpen(obs);
    case "COPILOT_WAIT":
      return planAutomatedReviewWait(record, obs, policy);
    case "COPILOT_FIX":
      return planAutomatedReviewFix(record, obs, policy);
    case "REVIEWER_ASSIGNED":
      return planReviewerAssignment(record, obs, policy);
    case "HUMAN_REVIEW":
      return planHumanReview(record, obs, policy);
    case "HUMAN_FIX":
      return planHumanFix(record, obs, policy);
    case "ESCALATED":
      return planEscalated(obs, policy);
    case "RE_REVIEW":
      return planReReview(record);
    case "APPROVED":
      return advance("QA_HANDOFF", "a human approved the current head");
    case "QA_HANDOFF":
      return planQaHandoff(record, obs, policy);
    case "DONE":
      return settled("the ticket is in QA and owned by somebody else");
  }
}

function planDiscovered(record: TicketRecord): Plan {
  if (!record.triage) {
    return act("the ticket has not been read yet", { type: "triage" });
  }

  if (record.triage.clear) {
    return advance("READY", "the ticket can be implemented as written");
  }

  return advance(
    "CLARIFYING",
    `the ticket leaves ${record.triage.questions.length} question(s) open`,
    { type: "ask-question", questions: record.triage.questions },
  );
}

function planClarifying(obs: Observation, policy: Policy): Plan {
  if (obs.questionAnswered) {
    return advance("READY", "the question on the ticket was answered");
  }
  return wait(policy.pollBackoffMs, "waiting for an answer on the ticket");
}

/**
 * An implementation only counts as current if it happened after the last gate
 * run. Without that check a red gate would bounce back into IMPLEMENTING,
 * find the old successful attempt still recorded, and go straight back to the
 * gate forever.
 */
function implementationIsCurrent(record: TicketRecord): boolean {
  const attempt = record.lastImplementation;
  if (!attempt) return false;
  if (!record.lastGate) return true;
  return attempt.at > record.lastGate.at;
}

function gateIsCurrent(record: TicketRecord): boolean {
  const gate = record.lastGate;
  if (!gate) return false;
  if (!record.lastImplementation) return true;
  return gate.at > record.lastImplementation.at;
}

function retryContextFor(record: TicketRecord): string | undefined {
  if (record.lastGate && !record.lastGate.ok && gateIsCurrent(record)) {
    return record.lastGate.output;
  }
  if (record.lastImplementation && !record.lastImplementation.ok) {
    return record.lastImplementation.output;
  }
  return undefined;
}

function planImplementing(record: TicketRecord, policy: Policy): Plan {
  if (implementationIsCurrent(record) && record.lastImplementation?.ok) {
    return advance("CHECKED", "the agent finished, the gate decides if it holds");
  }

  const attempts = attemptsIn(record, "IMPLEMENTING");
  if (attempts >= policy.maxImplementAttempts) {
    return advance(
      "ESCALATED",
      `the agent failed ${attempts} times, this needs the owner`,
      {
        type: "escalate",
        reason: `Implementation failed ${attempts} times. Last output:\n${record.lastImplementation?.output ?? "none"}`,
        threadIds: [],
      },
    );
  }

  return act(`implementation attempt ${attempts + 1}`, {
    type: "implement",
    retryContext: retryContextFor(record),
  });
}

function planChecked(record: TicketRecord, policy: Policy): Plan {
  if (!gateIsCurrent(record)) {
    return act("the gate has not run against this implementation", { type: "run-gate" });
  }

  if (record.lastGate?.ok) {
    return advance("PR_OPEN", "the gate is green");
  }

  const attempts = attemptsIn(record, "CHECKED");
  if (attempts >= policy.maxGateAttempts) {
    return advance("ESCALATED", `the gate stayed red across ${attempts} attempts`, {
      type: "escalate",
      reason: `The gate stayed red across ${attempts} attempts. Last output:\n${record.lastGate?.output ?? "none"}`,
      threadIds: [],
    });
  }

  // No effect here on purpose. IMPLEMENTING sees that the gate ran after the
  // last attempt, so it acts again and picks the gate output up as its retry
  // context. That keeps every retry counted in exactly one place.
  return advance("IMPLEMENTING", "the gate is red, back to the agent with its output");
}

function planPullRequestOpen(obs: Observation): Plan {
  if (obs.pullRequest) {
    return advance("COPILOT_WAIT", `pull request #${obs.pullRequest.number} exists`);
  }
  return act("the branch has no pull request yet", { type: "open-pull-request" });
}

/** Guards a state that cannot mean anything without a pull request. */
function requirePullRequest(obs: Observation, state: TicketState): PullRequestView | Plan {
  if (!obs.pullRequest) {
    return advance("PR_OPEN", `${state} has no pull request to look at`);
  }
  return obs.pullRequest;
}

function isPlan(value: PullRequestView | Plan): value is Plan {
  return "kind" in value;
}

function outstanding(
  pr: PullRequestView,
  from: "automated" | "human",
  record: TicketRecord,
): readonly ReviewThread[] {
  const judged = judgedThreadIds(record);
  return unresolvedThreads(pr, from).filter((t) => !judged.includes(t.id));
}

function planAutomatedReviewWait(
  record: TicketRecord,
  obs: Observation,
  policy: Policy,
): Plan {
  const pr = requirePullRequest(obs, "COPILOT_WAIT");
  if (isPlan(pr)) return pr;

  if (!automatedReviewerSawHead(pr)) {
    return wait(
      policy.pollBackoffMs,
      `waiting for the automated reviewer to look at ${pr.headSha.slice(0, 7)}`,
    );
  }

  const open = outstanding(pr, "automated", record);
  if (open.length > 0) {
    return advance("COPILOT_FIX", `the automated reviewer left ${open.length} open thread(s)`);
  }

  return advance("REVIEWER_ASSIGNED", "the automated reviewer has nothing outstanding");
}

/**
 * Whether the change is too large to hand to an agent, and why.
 *
 * Pure and free: the size came back with the pull request, so refusing costs
 * nothing where making the call would have cost the most. Returns the
 * sentence rather than a boolean, because what a person needs to read in the
 * escalation is which ceiling was passed and by how much.
 */
function tooLargeForAnAgent(pr: PullRequestView, policy: Policy): string | null {
  const lines = pr.additions + pr.deletions;

  if (policy.maxPullRequestFiles > 0 && pr.changedFiles > policy.maxPullRequestFiles) {
    return `${pr.changedFiles} files changed, over the ${policy.maxPullRequestFiles} I will hand to an agent`;
  }
  if (policy.maxPullRequestLines > 0 && lines > policy.maxPullRequestLines) {
    return `${lines} lines changed, over the ${policy.maxPullRequestLines} I will hand to an agent`;
  }

  return null;
}

function planAutomatedReviewFix(record: TicketRecord, obs: Observation, policy: Policy): Plan {
  const pr = requirePullRequest(obs, "COPILOT_FIX");
  if (isPlan(pr)) return pr;

  const open = outstanding(pr, "automated", record);
  if (open.length === 0) {
    return advance("COPILOT_WAIT", "every automated thread has been judged");
  }

  const tooLarge = tooLargeForAnAgent(pr, policy);
  if (tooLarge) return handBack(record, pr, policy, tooLarge, open.map((t) => t.id));

  return act(`addressing ${open.length} automated thread(s)`, {
    type: "address-threads",
    threadIds: open.map((t) => t.id),
    from: "automated",
  });
}

/**
 * Gives the review back to the ticket owner, once.
 *
 * `ESCALATED` already means "this needs the person whose ticket it is", so a
 * change nobody should automate lands in the state that already exists for
 * it rather than in one invented for size.
 */
function handBack(
  record: TicketRecord,
  pr: PullRequestView,
  policy: Policy,
  why: string,
  threadIds: string[],
): Plan {
  if (record.escalation && !record.escalation.resolvedAt) {
    return wait(policy.pollBackoffMs, `waiting on the owner: ${why}`);
  }

  return advance("ESCALATED", why, {
    type: "escalate",
    reason: `This pull request is bigger than I will work on unattended — ${why}. The review is yours: ${pr.url}`,
    threadIds,
  });
}

/**
 * What the forge already knows is wrong with the branch, and nothing else.
 *
 * Read before a person is asked, because review time is the one currency
 * here nobody can top up — the same reason the per-reviewer ceiling exists.
 * A reading of red checks, of a branch that will not merge, or of one sitting
 * on a base it has moved off, is a reading that has to be done again.
 *
 * No checks at all is not a complaint. A repository that runs none reports
 * exactly that, and a machine that read it as "not passing" would hold every
 * pull request for a verdict nobody is coming to give.
 */
function whatTheForgeSays(pr: PullRequestView): string | null {
  if (pr.checks?.state === "failing") return `the checks on ${pr.headSha.slice(0, 7)} are red`;
  if (pr.mergeState === "conflicting") return "the branch conflicts with its base";
  if (pr.mergeState === "behind") return "the branch is behind its base";
  return null;
}

/** The forge's complaint, handed to the owner once, the way size already is. */
function handBackBroken(
  record: TicketRecord,
  pr: PullRequestView,
  policy: Policy,
  why: string,
): Plan {
  if (record.escalation && !record.escalation.resolvedAt) {
    return wait(policy.pollBackoffMs, `waiting on the owner: ${why}`);
  }

  return advance("ESCALATED", why, {
    type: "escalate",
    reason: `I am not asking anybody to review this yet — ${why}. It is yours: ${pr.url}`,
    threadIds: [],
  });
}

function planReviewerAssignment(
  record: TicketRecord,
  obs: Observation,
  policy: Policy,
): Plan {
  const pr = requirePullRequest(obs, "REVIEWER_ASSIGNED");
  if (isPlan(pr)) return pr;

  // A verdict that has not arrived is not a bad one. Waiting costs a poll;
  // asking somebody to read what CI is about to fail costs their afternoon.
  //
  // Bounded, because a check that is configured and never reports leaves a
  // rollup that says `running` for ever, and an unbounded wait here is a
  // ticket that stops without anybody being told. The remote checks are a
  // gate, so they answer to the same ceiling the local one does.
  if (pr.checks?.state === "running") {
    const looks = attemptsIn(record, "REVIEWER_ASSIGNED");
    if (looks < policy.maxGateAttempts) {
      return wait(policy.pollBackoffMs, `the checks on ${pr.headSha.slice(0, 7)} have not finished`);
    }
    return handBackBroken(
      record,
      pr,
      policy,
      `the checks on ${pr.headSha.slice(0, 7)} never finished`,
    );
  }

  const broken = whatTheForgeSays(pr);
  if (broken) return handBackBroken(record, pr, policy, broken);

  const firstLook = attemptsIn(record, "REVIEWER_ASSIGNED") === 0;

  if (!isConfirmedFor(obs.roster, obs.now)) {
    return holdAndSayOnce(
      firstLook,
      policy.rosterBackoffMs,
      `the roster was last confirmed on ${obs.roster.confirmedOn}, not today`,
      `Confirm today's reviewers and QA before I assign ${record.id}.`,
    );
  }

  const reviewer = leastLoadedReviewer(obs.roster, obs.reviewLoad);
  if (!reviewer) {
    return holdAndSayOnce(
      firstLook,
      policy.rosterBackoffMs,
      "every reviewer on the roster is marked unavailable",
      `No reviewer is available for ${record.id}.`,
    );
  }

  // Nobody else is emptier, so if this one is at the ceiling they all are.
  // The pull request stays open with no reviewer on it, which is the point:
  // the work is done and only somebody's attention is being rationed.
  const load = obs.reviewLoad[reviewer.host] ?? 0;
  if (load >= policy.maxOpenReviewsPerReviewer) {
    return holdAndSayOnce(
      firstLook,
      policy.pollBackoffMs,
      `every reviewer is carrying ${policy.maxOpenReviewsPerReviewer} open review(s) or more`,
      `${record.id} has a pull request open and nobody assigned: ` +
        `every reviewer is at ${policy.maxOpenReviewsPerReviewer} open review(s).`,
    );
  }

  return advance(
    "HUMAN_REVIEW",
    `${reviewer.host} carries the fewest open reviews (${load})`,
    { type: "assign-reviewer", host: reviewer.host },
  );
}

/**
 * Holds, and tells the operator once rather than on every look.
 *
 * The three reasons this state waits for are all somebody else's move, and a
 * message repeated every five minutes is a message nobody reads.
 */
function holdAndSayOnce(
  firstLook: boolean,
  retryAfterMs: number,
  why: string,
  text: string,
): Plan {
  return wait(retryAfterMs, why, ...(firstLook ? [{ type: "announce" as const, text }] : []));
}

function planHumanReview(record: TicketRecord, obs: Observation, policy: Policy): Plan {
  const pr = requirePullRequest(obs, "HUMAN_REVIEW");
  if (isPlan(pr)) return pr;

  const reviewer = record.reviewer;
  if (!reviewer) {
    return advance("REVIEWER_ASSIGNED", "no reviewer is recorded for this ticket");
  }

  if (!hasReviewedHead(pr, reviewer)) {
    return wait(
      policy.pollBackoffMs,
      `waiting for ${reviewer} to review ${pr.headSha.slice(0, 7)}`,
    );
  }

  if (pr.reviewDecision === "APPROVED") {
    return advance("APPROVED", `${reviewer} approved the current head`);
  }

  const open = outstanding(pr, "human", record);
  if (open.length > 0) {
    return advance("HUMAN_FIX", `${reviewer} left ${open.length} open thread(s)`);
  }

  if (pr.reviewDecision === "CHANGES_REQUESTED") {
    return advance("RE_REVIEW", "every thread was judged, the review has to be redone");
  }

  return wait(policy.pollBackoffMs, `${reviewer} commented without deciding`);
}

function planHumanFix(record: TicketRecord, obs: Observation, policy: Policy): Plan {
  const pr = requirePullRequest(obs, "HUMAN_FIX");
  if (isPlan(pr)) return pr;

  const open = outstanding(pr, "human", record);
  if (open.length > 0) {
    const tooLarge = tooLargeForAnAgent(pr, policy);
    if (tooLarge) return handBack(record, pr, policy, tooLarge, open.map((t) => t.id));

    return act(`judging ${open.length} human thread(s)`, {
      type: "address-threads",
      threadIds: open.map((t) => t.id),
      from: "human",
    });
  }

  const disagreed = disagreements(record);
  const alreadyEscalated = record.escalation && !record.escalation.resolvedAt;

  if (disagreed.length > 0 && !alreadyEscalated) {
    return advance("ESCALATED", `${disagreed.length} comment(s) need the owner's call`, {
      type: "escalate",
      reason: disagreed.map((d) => `${d.threadId}: ${d.note}`).join("\n"),
      threadIds: disagreed.map((d) => d.threadId),
    });
  }

  return advance("RE_REVIEW", "every comment was addressed");
}

function planEscalated(obs: Observation, policy: Policy): Plan {
  if (obs.escalationAnswered) {
    return advance("HUMAN_FIX", "the owner answered, the comments can be judged again");
  }
  return wait(policy.pollBackoffMs, "waiting for the owner to settle a disagreement");
}

function planReReview(record: TicketRecord): Plan {
  if (!record.reviewer) {
    return advance("REVIEWER_ASSIGNED", "no reviewer is recorded for this ticket");
  }
  return advance("HUMAN_REVIEW", `asking ${record.reviewer} to look again`, {
    type: "request-rereview",
    host: record.reviewer,
  });
}

function planQaHandoff(record: TicketRecord, obs: Observation, policy: Policy): Plan {
  const firstLook = attemptsIn(record, "QA_HANDOFF") === 0;

  if (!isConfirmedFor(obs.roster, obs.now)) {
    return wait(
      policy.rosterBackoffMs,
      `the roster was last confirmed on ${obs.roster.confirmedOn}, not today`,
      ...(firstLook
        ? ([
            {
              type: "announce" as const,
              text: `Confirm today's QA owner before I hand over ${record.id}.`,
            },
          ] as const)
        : []),
    );
  }

  if (!obs.roster.qa.available) {
    return wait(
      policy.rosterBackoffMs,
      `${obs.roster.qa.tracker} is marked unavailable for QA`,
      ...(firstLook
        ? ([
            {
              type: "announce" as const,
              text: `The QA owner for ${record.id} is away, who takes it?`,
            },
          ] as const)
        : []),
    );
  }

  return advance("DONE", `handing ${record.id} to ${obs.roster.qa.tracker}`, {
    type: "hand-off-to-qa",
    tracker: obs.roster.qa.tracker,
  });
}

/**
 * The workflow as the core mounts it.
 *
 * `usesActions` and `usesObservers` are data on purpose: the loader refuses a
 * mount where an action has no port behind it, and the capability surface can
 * be measured without anybody reading the logic below.
 *
 * The cast is the one boundary where this workflow's typed record meets the
 * core's generic one. It lives here, once, rather than being spread through
 * the decision functions.
 */
export const ticketToQa: Workflow<Observation, Policy> = {
  name: "ticket-to-qa",
  states: TICKET_STATES,
  waitingStates: WAITING_STATES,
  initialState: "DISCOVERED",
  terminalStates: ["DONE"],
  usesActions: USES_ACTIONS,
  // Empty, and honestly so. This workflow's engine assembles the observation
  // from the very ports its actions already require: the tracker, the code
  // host and the roster. There is no separate slice for a plugin to
  // contribute, so declaring one would be a need nothing could ever meet and
  // the loader would refuse every mount.
  //
  // A workflow that needs something no action already reaches, a browser
  // check say, would name it here and a plugin would contribute it.
  usesObservers: [],
  plan: (record, observation, policy) => plan(record as TicketRecord, observation, policy),
};
