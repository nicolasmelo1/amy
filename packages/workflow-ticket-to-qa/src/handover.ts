import { Plan, PullRequestView } from "@amykit/core";
import { Effect, HandOverTurn, WriteEffect, act, advance, isWrite, wait } from "./effects.js";
import { Observation, Policy } from "./observation.js";
import { TicketRecord } from "./record.js";
import { TicketState } from "./state.js";

/**
 * The same decision, with every write handed to the operator.
 *
 * Pure, and applied after `plan` rather than threaded through it, so the
 * lifecycle stays one function and this switch is one more. A write becomes a
 * turn: said once, under a key the record keeps, and followed by waiting
 * until the observation shows the effect — the pull request there, the
 * thread closed, the review requested, the status moved. A write that moves
 * the state anyway, a question or an escalation, is said on the move, and the
 * state it moves to already waits for the answer.
 */
export function handOver(decided: Plan, record: TicketRecord, obs: Observation, policy: Policy): Plan {
  const pending = pendingReview(record, obs, policy);
  if (pending) return pending;

  if (decided.kind === "settled") return decided;
  // The plan carries this workflow's own effects; the core types them loosely.
  const effects = decided.effects as Effect[];
  const writes = effects.filter(isWrite);
  if (writes.length === 0) return decided;

  const others = effects.filter((effect) => !isWrite(effect));
  const turns = writes.map((write) => ({ key: keyFor(write, record, obs), write }));

  if (decided.kind === "advance" && writes.every(movesOnItsOwn)) {
    return advance(decided.to as TicketState, decided.why, ...others, handOverOf(turns));
  }

  return turnOrWait(turns, others, record, obs, policy);
}

/**
 * A write the state stays put for: said if it has not been, and waited on
 * until the observation shows it made if it has.
 */
function turnOrWait(turns: HandOverTurn[], others: Effect[], record: TicketRecord, obs: Observation, policy: Policy): Plan {
  const said = new Set(record.handedOver ?? []);
  const write = turns[0]!.write;
  if (write.type === "hand-off-to-qa" && handedToQa(obs)) {
    return advance("DONE", `${obs.ticket.id} is in QA and owned by ${obs.roster.qa.tracker}, as the operator left it`, ...others);
  }
  if (write.type === "request-rereview" && said.has(turns[0]!.key)) {
    return observedReview(write.host, obs, record.handedOverAt?.[turns[0]!.key])
      ? advance("HUMAN_REVIEW", `${write.host} was asked to look again`, ...others)
      : wait(policy.pollBackoffMs, `waiting for the operator to ask ${write.host} to look again`, ...others);
  }

  const unsaid = turns.filter((turn) => !said.has(turn.key));
  if (unsaid.length === 0) {
    return wait(policy.pollBackoffMs, `waiting for the operator to ${describe(turns.map((turn) => turn.write))}`, ...others);
  }
  return act(`handing ${describe(unsaid.map((turn) => turn.write))} to the operator`, ...others, handOverOf(unsaid));
}

/**
 * A review the operator was asked to request, read off the forge until it is
 * there. Decided from the record, not the roster: the reviewer was chosen
 * when the turn was said, and the load that chose them has since moved.
 */
function pendingReview(record: TicketRecord, obs: Observation, policy: Policy): Plan | null {
  if (record.state !== "REVIEWER_ASSIGNED" || !record.reviewer) return null;
  const key = `request-review@${record.reviewer}`;
  if (!(record.handedOver ?? []).includes(key)) return null;

  return observedReview(record.reviewer, obs, record.handedOverAt?.[key])
    ? advance("HUMAN_REVIEW", `${record.reviewer} was asked to review`)
    : wait(policy.pollBackoffMs, `waiting for the operator to request a review from ${record.reviewer}`);
}

/**
 * The review the operator was asked to request: pending on the forge, or
 * already submitted since they were asked. A review from before the turn is
 * the round that sent the work back, not an answer to this one.
 */
function observedReview(host: string, obs: Observation, since: string | undefined): boolean {
  const pr: PullRequestView | null = obs.pullRequest;
  if (!pr) return false;
  if (pr.requestedReviewers.includes(host)) return true;
  return pr.reviews.some((review) => review.author === host && since !== undefined && review.submittedAt > since);
}

/**
 * The QA handoff as it was asked for: the status moved and the QA owner
 * assigned. A tracker that does not say who a ticket is assigned to leaves
 * the status as the only thing there is to see.
 */
export function handedToQa(obs: Observation): boolean {
  if (!obs.inQa) return false;
  const assignee = obs.ticket.assignee;
  return assignee === undefined || assignee?.toLowerCase() === obs.roster.qa.tracker.toLowerCase();
}

/** A question and an escalation move the state, and the state they reach waits for the answer. */
function movesOnItsOwn(write: WriteEffect): boolean {
  return write.type === "ask-question" || write.type === "escalate";
}

function keyFor(write: WriteEffect, record: TicketRecord, obs: Observation): string {
  switch (write.type) {
    case "ask-question":
      return `ask-question@${record.triage?.at ?? obs.now.toISOString()}`;
    case "escalate":
      return `escalate@${obs.now.toISOString()}`;
    case "open-pull-request":
      return `open-pull-request@${obs.ticket.repo}`;
    case "resolve-review-thread":
      return `resolve@${write.threadId}`;
    case "assign-reviewer":
      return `request-review@${write.host}`;
    case "request-rereview":
      return `request-review@${write.host}@${obs.pullRequest?.headSha ?? ""}`;
    case "hand-off-to-qa":
      return "hand-off-to-qa";
  }
}

function handOverOf(turns: HandOverTurn[]): Effect {
  return { type: "hand-over", turns };
}

function describe(writes: readonly WriteEffect[]): string {
  const names: Record<WriteEffect["type"], string> = {
    "ask-question": "ask the question",
    "escalate": "take the decision",
    "open-pull-request": "open the pull request",
    "resolve-review-thread": "resolve the answered threads",
    "assign-reviewer": "request the review",
    "request-rereview": "request the review again",
    "hand-off-to-qa": "hand the ticket to QA",
  };
  return [...new Set(writes.map((write) => names[write.type]))].join(" and ");
}
