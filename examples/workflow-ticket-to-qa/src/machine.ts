import { Observation, Policy } from "./observation.js";
import { attemptsIn, Climb, climbFor, looksIn, Plan, PullRequestView, ReviewThread, strictest, unitOf } from "@amykit/core";
import { act, advance, carrying, Effect, settled, TicketPlan, wait } from "./effects.js";
import {
  ThreadVerdict,
  TicketRecord,
  disagreements,
  judgedThreadIds,
} from "./record.js";
import { DecidedState, LegacyFixState, TicketState } from "./state.js";
import {
  automatedReviewerSawHead,
  hasReviewedHead,
  isAutomatedReviewer,
  unresolvedThreads,
} from "./review.js";
import { isConfirmedFor, leastLoadedReviewer } from "./roster.js";
import { handOver, handedToQa, pendingReviewRequest } from "./handover.js";
import { discussionBefore, discussing, readAs, settledDiscussion } from "./discussion.js";

/**
 * Decides the single next move for one ticket.
 *
 * Pure on purpose. Every branch below is a predicate over the record and the
 * observation, so the whole lifecycle can be driven in a test without a
 * tracker, a code host, a repository or an agent.
 */
export function plan(record: TicketRecord, obs: Observation, policy: Policy): Plan {
  if (record.state === "checks") {
    throw new Error(`${record.id} is in \`checks\`, which its lanes move: drive the mounted workflow, which composes them`);
  }
  // A record an older version saved where the review loop used to change code
  // is read the way it was written here, and refused by the mounted workflow:
  // see `refuseARemovedState`.
  if (isLegacyFix(record.state)) {
    return after(legacyFixes[record.state](record, obs, policy), record, obs, policy);
  }
  const early = before(record, obs, policy);
  const planner = decide[record.state] as Planner | undefined;
  // Total on any state string: a state this workflow does not know is a record
  // somebody wrote by hand or an older version left behind, and stopping where
  // it is says so without guessing a move for it.
  const decided = early ?? planner?.(record, obs, policy) ??
    settled(`${record.id} is in \`${record.state}\`, which ticket-to-qa does not draw; the work stops where it is`);
  return after(decided, record, obs, policy);
}

function isLegacyFix(state: TicketState): state is LegacyFixState {
  return state === "COPILOT_FIX" || state === "HUMAN_FIX";
}

/**
 * Refuses a record saved in a state this workflow no longer draws.
 *
 * `COPILOT_FIX` and `HUMAN_FIX` changed code from the review loop, outside the
 * checks. Both are gone with no migration: a record in one has a change
 * nobody checked, and picking a state for it would decide silently what the
 * person who owns the work has to read. The mounted workflow refuses it, by
 * name, before any decision is taken.
 */
export function refuseARemovedState(record: TicketRecord): void {
  if (!isLegacyFix(record.state)) return;
  throw new Error(
    `${record.id} was saved in \`${record.state}\`, a state ticket-to-qa no longer has: the review loop changes code only in \`IMPLEMENTING\`. ` +
      `Drive the change through \`IMPLEMENTING\`, or close the record and let the ticket be discovered again.`,
  );
}

export function before(record: TicketRecord, obs: Observation, _policy: Policy): Plan | undefined {
  if (obs.retired && record.state !== "DONE") return retire(obs);
  return ranTheChecksInTurn(record);
}

/**
 * A record an older version saved in `CHECKED` or `SELF_REVIEW`, the two
 * states the checks were before they ran as lanes. Its implementation is
 * already done, so it goes straight to `checks` and is checked again in both
 * lanes — not back to the agent, which would pay for the same work twice, and
 * not on to a pull request on a check the record no longer explains.
 */
function ranTheChecksInTurn(record: TicketRecord): Plan | undefined {
  const state = record.state as string;
  if (state !== "CHECKED" && state !== "SELF_REVIEW") return undefined;
  return advance("checks", `${state} is where the checks ran before they ran as lanes; checking the work again in both`);
}

export function after(decision: Plan, record: TicketRecord, obs: Observation, policy: Policy): Plan {
  return policy.writes === "operator" ? handOver(decision, record, obs, policy) : decision;
}

type Planner = (record: TicketRecord, obs: Observation, policy: Policy) => Plan;

/**
 * Stops a work item whose repository left the ticket, where it stands.
 *
 * Settled rather than DONE: a terminal record is one discovery never offers
 * again, and the label may come back. Settling takes the item off the queue
 * and leaves its record mid-lifecycle, so while discovery does not offer it
 * nothing moves it, and the day it does the work resumes from where it was.
 * Whatever it already pushed or opened is left as it is.
 */
function retire(obs: Observation): Plan {
  const why = obs.retiredBecause ?? `${obs.ticket.repo} is no longer one of ${obs.ticket.id}'s repositories`;
  return settled(`${why}; the work there stops where it is until it is again`);
}

/**
 * One planner per state. A record rather than a switch, so the compiler is
 * what proves no state was forgotten: a state added to `TicketState` and
 * not here does not build, and one drawn in `workflow.mmd` and not in
 * `TicketState` is a move the walkthrough refuses.
 */
export const decide: Record<DecidedState, Planner> = {
  DISCOVERED: (record, obs) => planDiscovered(record, obs),
  CLARIFYING: planClarifying,
  READY: () => advance("IMPLEMENTING", "nothing is blocking the implementation"),
  IMPLEMENTING: (record, obs, policy) => planImplementing(record, obs, policy),
  verdict: (record, obs, policy) => planVerdict(record, obs, policy),
  PR_OPEN: (_record, obs) => planPullRequestOpen(obs),
  COPILOT_WAIT: planAutomatedReviewWait,
  REVIEWER_ASSIGNED: planReviewerAssignment,
  HUMAN_REVIEW: planHumanReview,
  ESCALATED: planEscalated,
  RE_REVIEW: (record) => planReReview(record),
  APPROVED: () => advance("QA_HANDOFF", "a human approved the current head"),
  QA_HANDOFF: planQaHandoff,
  DONE: () => settled("the ticket is in QA and owned by somebody else"),
};

/**
 * The two states the review loop used to change code in, kept for reading a
 * record an older version saved. The mounted workflow refuses such a record
 * before any decision, so this is only ever reached by `plan` called on the
 * record itself — a test, or `amy look` reading an old record to say what it
 * says.
 */
const legacyFixes: Record<LegacyFixState, Planner> = {
  COPILOT_FIX: planAutomatedReviewFix,
  HUMAN_FIX: planHumanFix,
};

function planDiscovered(record: TicketRecord, obs: Observation): Plan {
  // A pull request already open is work somebody already did: it is read at
  // its review rather than triaged again, so a ticket whose branch was pushed
  // before this machine saw it is taken up where it stands.
  const existing = planExistingPullRequest(obs);
  if (existing) return existing;

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

/**
 * A pull request that is already there, read at its review: `HUMAN_REVIEW`
 * when somebody has looked at it, `REVIEWER_ASSIGNED` when nobody has.
 *
 * The work behind an open pull request is done, whether or not this machine
 * did it — a branch pushed by hand, or a ticket the tracker shortened. Asking
 * the questions a fresh ticket would be asked would be asking somebody to
 * decide what the change already decided.
 */
function planExistingPullRequest(obs: Observation): Plan | null {
  const pr = obs.pullRequest;
  if (!pr) return null;
  const reviewed = pr.reviews.some((review) => !isBot(review.author));
  return reviewed
    ? advance("HUMAN_REVIEW", `pull request #${pr.number} is already open and was reviewed`)
    : advance("REVIEWER_ASSIGNED", `pull request #${pr.number} is already open and nobody has reviewed it`);
}

function isBot(author: string): boolean {
  return isAutomatedReviewer(author);
}

/**
 * What a reply on the ticket said, split by who wrote it.
 *
 * Amy's own comments are labelled as questions it already asked — they are
 * how the machine's account of the conversation and the record's agree, and
 * without the label a second look reads its own words as the answer it was
 * waiting for. A comment nobody can attribute is left out rather than guessed
 * at: the tracker is where `fromAmy` is settled, and a comment with no author
 * is a conversation with a hole in it, which is a finding rather than an
 * input.
 *
 * An answer from somebody is only news when it is not the machine's own
 * question quoted back — a tracker that copies the body into a reply, or a
 * system that quotes the thread, must not pass for an answer.
 */
function conversationLines(record: TicketRecord, conversation: Observation["conversation"]): string[] {
  const asked = new Set(record.triage?.askedQuestions ?? []);

  const lines: string[] = [];
  for (const comment of conversation) {
    if (comment.fromAmy) {
      if (asked.has(comment.body)) continue;
      asked.add(comment.body);
      lines.push(`You asked: ${comment.body}`);
    } else if (comment.author && (!asked.has(comment.body) || comment.answer)) {
      const answer = comment.answer
        ? `${comment.answer.ask}: ${comment.answer.chosen.join(", ")}`
        : comment.body;
      lines.push(`${comment.author} answered: ${answer}`);
    }
  }

  return lines;
}

/**
 * Keeps a closed answer only when it still belongs to this triage, and only
 * keeps the first answer for each ask. The workflow, not an adapter's memory,
 * owns that selection: replaying the same look yields the same answer, while
 * a stale button press cannot settle a newer triage.
 */
function selectedAnswers(record: TicketRecord, conversation: Observation["conversation"]): Observation["conversation"] {
  const questions = new Map<string, readonly string[]>();
  for (const question of record.triage?.questions ?? []) {
    if (typeof question !== "string") questions.set(question.prompt, question.answers);
  }

  const answered = new Set<string>();
  return conversation.filter((comment) => {
    if (!comment.answer) return true;
    const choices = questions.get(comment.answer.ask);
    const chosen = comment.answer.chosen;
    const valid = choices !== undefined && chosen.length > 0 && chosen.every((answer) => choices.includes(answer));
    if (!valid || answered.has(comment.answer.ask)) return false;
    answered.add(comment.answer.ask);
    return true;
  });
}

/**
 * Waiting on an answer to the questions the triage asked.
 *
 * A turn somebody takes in a discussion is answered in the thread and moves
 * nothing; the work goes back to the triage only on a decision, carrying
 * the discussion that came before it.
 */
function planClarifying(record: TicketRecord, obs: Observation, policy: Policy): Plan {
  // A pull request already open is work somebody already did, and its review
  // is what is left: the question this state was waiting on has been answered
  // in code.
  const existing = planExistingPullRequest(obs);
  if (existing) return existing;

  const since = record.triage?.at ?? "";
  const conversation = selectedAnswers(record, obs.conversation);
  const decisions = conversation.filter((comment) => comment.fromAmy || readAs(comment, policy) === "decision");
  const answered = conversationLines(record, decisions);

  // Only a decision unblocks the wait. The discussion before it — answered,
  // or said in the same breath and not answered yet — goes to the triage with
  // it, so a decision that says "use that" still has "that" in front of it.
  if (answered.some((line) => line.includes("answered:"))) {
    return advance("READY", "the question in the work thread was answered", {
      type: "triage",
      conversation: [...discussionBefore(record, { conversation }, policy, since), ...answered],
    });
  }

  const discussion = discussing(record, conversation, policy, since, (record.triage?.askedQuestions ?? []).join("\n"));
  if (discussion) return act(`answering ${discussion.turns.length} turn(s) of a discussion before anything is decided`, discussion);

  // Re-asking is the defect this state used to be: a look without an answer
  // holds rather than posts the same words again. `CLARIFYING` cannot clear
  // because the ticket was touched — only because it was answered.
  return wait(policy.pollBackoffMs, "waiting for an answer in the work thread");
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

/** Whether a check ran after the last implementation, and so is about it. */
function isCurrent(check: { at: string } | undefined, record: TicketRecord): boolean {
  if (!check) return false;
  if (!record.lastImplementation) return true;
  return check.at > record.lastImplementation.at;
}

/**
 * What the next implementation is told: everything both checks found about
 * the last one, in one round, so a change the gate refuses goes back with
 * what the review said about it too.
 */
function retryContextFor(record: TicketRecord): string | undefined {
  const found = checksFound(record);
  if (found.length > 0) return found.join("\n\n");
  if (record.lastImplementation && !record.lastImplementation.ok) {
    return record.lastImplementation.output;
  }
  return undefined;
}

/** What the gate refused and what the review said about the last implementation, each under its name. */
function checksFound(record: TicketRecord): string[] {
  const gate = record.lastGate;
  const review = record.lastSelfReview;
  const refused = isCurrent(gate, record) && !gate!.ok;
  const reviewed = isCurrent(review, record) && (refused || review!.verdict === "CHANGES_ASKED");
  return [
    ...(refused ? [`The gate said:\n${gate!.output}`] : []),
    ...(reviewed ? [`The review of the change said:\n${review!.output}`] : []),
  ];
}

/**
 * The ceiling this move replaced, read off the ladder rather than written
 * here: a record saved before rounds were counted per origin was weighed
 * against that many failed attempts, which is the patient level's number of
 * rounds. Nothing else in this workflow reads a number the config does not
 * name.
 */
function patientRounds(policy: Policy): number {
  // A policy that still carries the old ceiling — a record's own fold, or a
  // caller naming one — is read against it; an install's policy no longer has
  // one, and is read at the patient level.
  return policy.maxImplementAttempts ?? policy.escalation.scale.patient ?? policy.escalation.scale.normal ?? 1;
}

function planImplementing(record: TicketRecord, obs: Observation, policy: Policy): Plan {
  return (
    waitingOnTheStack(record, obs, policy) ??
    aChangeThatChangedNothing(record, policy) ??
    theChangeTheAgentFinished(record) ??
    aRunThatKeepsFailing(record, policy) ??
    theAttempt(record)
  );
}

/**
 * A change still waiting on its stack's parent: the branch has nowhere to
 * start until the parent's work is on the remote.
 */
function waitingOnTheStack(record: TicketRecord, obs: Observation, policy: Policy): Plan | null {
  if (!obs.stack || !("waiting" in obs.stack) || record.lastImplementation) return null;
  return wait(
    policy.pollBackoffMs,
    `${record.id} is stacked on ${obs.stack.parent}, which has no pull request in ${obs.ticket.repo} yet`,
  );
}

/**
 * A run that changed nothing is an answer, not a failed try: the head stands,
 * the agent's reason is what the next person reads, and the ladder does not
 * climb to a stronger model to reach the same conclusion. It holds rather than
 * spending the same run again on every look.
 */
function aChangeThatChangedNothing(record: TicketRecord, policy: Policy): Plan | null {
  const progress = record.lastImplementation?.progress;
  if (record.lastImplementation?.ok !== true || progress?.kind !== "unchanged") return null;
  if (!implementationIsCurrent(record)) return null;
  // A run that answered a round without changing a file is decided on, not
  // held: the head stands and the reason is on the record, so the checks read
  // it rather than the same question being asked on every poll. One that
  // answered nothing at all simply holds.
  if (record.pendingRounds?.length) {
    // The round is answered with the agent's words: the head stands and the
    // review reads what it said, rather than the same red rollup coming back
    // to the same answer on every poll.
    return advance("HUMAN_REVIEW", `the implementation changed nothing: ${progress.detail}`);
  }
  return wait(policy.pollBackoffMs, `the implementation changed nothing: ${progress.detail}`);
}

/**
 * A run that keeps failing is a round the same origin keeps sending back, and
 * the ladder is what stops it: once that origin has spent every rung below a
 * person, the work is theirs rather than another try.
 */
function aRunThatKeepsFailing(record: TicketRecord, policy: Policy): Plan | null {
  if (record.lastImplementation?.ok !== false) return null;
  const climb = standingAfter(record, policy, record.lastOrigin ?? "gate", 1);
  return climb.exhausted ? handToTheOwner(record, climb, policy) : null;
}

/** A run that held, on the commit the record is standing on: the lanes read it. */
function theChangeTheAgentFinished(record: TicketRecord): Plan | null {
  if (!implementationIsCurrent(record) || !record.lastImplementation?.ok) return null;
  return advance("checks", "the agent finished; the gate and the review decide if it holds");
}

/** The attempt itself, on the rung the record has climbed to, carrying what it answers. */
function theAttempt(record: TicketRecord): Plan {
  const attempt = attemptsIn(record, "IMPLEMENTING");
  return act(`implementation attempt ${attempt + 1}`, {
    type: "implement",
    retryContext: retryContextFor(record),
    ...(record.continuationContext
      ? { continuationContext: record.continuationContext }
      : {}),
    ...(record.clarification?.length ? { conversation: record.clarification } : {}),
    ...(record.ownerWord ? { conversation: [ownerWordLine(record.ownerWord)] } : {}),
    ...settledDiscussion(record),
  });
}

/** One owner sentence as the conversation the implementation is handed. */
function ownerWordLine(word: { author: string; body: string; at: string }): string {
  return `${word.author} answered: ${word.body}`;
}

/** Hands work whose origin spent the ladder to the person whose ticket it is. */
function handToTheOwner(
  record: TicketRecord,
  climb: Climb,
  policy: Policy,
  rounds: readonly { origin: string; findings: number }[] = [{ origin: climb.origin, findings: 1 }],
): Plan {
  if (record.escalation && !record.escalation.resolvedAt) {
    return wait(policy.pollBackoffMs, `waiting on the owner: ${climb.origin}'s rounds ran out`);
  }
  // The round that spent the ladder is still a round, and the record keeps it:
  // an escalation that said three rounds when four came back would read as a
  // different history from the one the log carries.
  return carrying(advance("ESCALATED", `${climb.origin}'s rounds ran out on the last rung before a person`, {
    type: "escalate",
    reason:
      `${climb.origin} has sent this change back ${climb.rounds} time(s), which is every round the \`${climb.level}\` level allows at every rung I have. ` +
      `Last time:\n${retryContextFor(record) ?? "nothing was said"}`,
    threadIds: [],
  }), { rounds });
}

/**
 * Where the gate and the self-review meet, each having checked the same
 * commit. Both clean is a pull request, published once for the round; either
 * finding something sends the implementation back with both findings at once,
 * and each origin that sent it back counts a round toward its own climb.
 */
function planVerdict(record: TicketRecord, obs: Observation, policy: Policy): Plan {
  const gate = record.lanes?.GATE?.end;
  const review = record.lanes?.SELF_REVIEW?.end;
  if (gate === "GREEN" && review === "APPROVED") {
    return advance("PR_OPEN", "the gate is green and the review found nothing to stop it", ...publish(record, obs));
  }

  const sentBack = [
    ...(gate === "RED" ? [{ origin: "gate", findings: findingsOf(record.lastGate) }] : []),
    ...(review === "CHANGES_ASKED" ? [{ origin: "self-review", findings: findingsOf(record.lastSelfReview) }] : []),
  ];
  const climbs = sentBack.map(({ origin, findings }) => standingAfter(record, policy, origin, findings));
  const worst = strictest(climbs);
  if (worst?.exhausted) return handToTheOwner(record, worst, policy, sentBack);

  const found = [gate === "RED" ? "the gate is red" : undefined, review === "CHANGES_ASKED" ? "the review asked for changes" : undefined]
    .filter((said) => said !== undefined)
    .join(" and ");

  // No effect here on purpose. IMPLEMENTING sees that the checks ran after
  // the last attempt, so it acts again and picks both up as its retry
  // context. That keeps every retry counted in exactly one place — the fold,
  // which counts each origin this round came back from.
  return carrying(advance("IMPLEMENTING", `${found || "a check did not end clean"}, back to the agent with what both said`), {
    rounds: sentBack,
  });
}

/** How many findings an outcome brought back; a round that says nothing is one. */
function findingsOf(outcome: { findings?: number } | undefined): number {
  return outcome?.findings !== undefined && outcome.findings > 0 ? outcome.findings : 1;
}

/**
 * What a green round publishes, once.
 *
 * The remote sees the change only after the gate and the self-review have read
 * it: the push, then every thread the work took up closed, the threads it
 * answered replied on, and the reviewer it had asked to look again. Nothing is
 * planned for a round the checks refused, because nothing reached them.
 */
function publish(record: TicketRecord, obs: Observation): Effect[] {
  // Only what the forge still holds open: a thread the operator closed, or one
  // an earlier round resolved, is not asked for again.
  const pr = obs.pullRequest;
  const open = new Set((pr?.threads ?? []).filter((thread) => !thread.isResolved).map((thread) => thread.id));
  // No pull request at all is the first round, where there is nothing to close.
  const stillOpen = (threadId: string): boolean => (pr ? open.has(threadId) : true);
  // A thread the change disagrees with, or one the brief puts out of scope, is
  // not closed by a push: the first is the owner's to settle, the second is
  // answered on the thread itself.
  // An answer already said on a thread is not said again: the round that
  // published it was the one that said it, and a reply on every poll reads as
  // a machine arguing with itself.
  const said = new Set(record.answered ?? []);
  const resolved = record.judged
    .filter(
      (judged) =>
        judged.verdict !== "disagreed" &&
        judged.verdict !== "contradicts-brief" &&
        stillOpen(judged.threadId),
    )
    .map((judged) => ({ type: "resolve-review-thread" as const, threadId: judged.threadId }));
  const answered = record.judged
    .filter((judged) => (judged.verdict === "answered" || judged.verdict === "out-of-scope") && stillOpen(judged.threadId))
    .filter((judged) => !said.has(judged.threadId))
    .map((judged) => ({ type: "reply-thread" as const, threadId: judged.threadId, text: judged.note }));
  const asked = record.reviewer
    ? [{ type: "request-rereview" as const, host: record.reviewer }]
    : [];
  return [{ type: "push" }, ...resolved, ...answered, ...asked];
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

  const newWork = weighNewWork(record, pr, obs, policy);
  if (newWork) return newWork;

  return advance("REVIEWER_ASSIGNED", "the automated reviewer has nothing outstanding");
}

/**
 * The new work a pull request's review has left, or nothing.
 *
 * A failing check on the head, an open comment and the owner's word are all
 * work, and work is done in one place: `IMPLEMENTING`, carrying what was
 * taken up. A change too large for an agent is handed to the owner instead of
 * being built, exactly as it always was.
 *
 * Before any of that the work is weighed against what it is for: a comment the
 * change disagrees with, or one that undoes the brief, is the owner's to
 * settle — asked once, and never built behind their back — and one the brief
 * puts out of scope is answered on its thread rather than built.
 */
function weighNewWork(
  record: TicketRecord,
  pr: PullRequestView,
  obs: Observation,
  policy: Policy,
): Plan | null {
  const waited = waitingOnTheOwner(record, policy);
  if (waited) return waited;

  const review = reviewOf(record, pr);
  return (
    theOwnersWord(record, obs, pr, policy) ??
    theOwnerIsOwed(record, review, policy) ??
    answersOutOfScope(record, review) ??
    redChecks(record, pr, review, policy) ??
    theCommentsToTakeUp(record, pr, review, policy)
  );
}

/** What one look at a pull request's conversation has left to answer. */
interface Review {
  /** Every comment the forge still holds open. */
  readonly open: readonly ReviewThread[];
  /** Those the record has already judged, one entry per thread. */
  readonly judged: readonly ThreadVerdict[];
  /**
   * The ones this round takes up. The automated reviewer's comments come
   * first, as they always have: the round that answers them is the one a
   * person is asked to read. A person's own comments are work too — taken up
   * here when the bot has nothing outstanding, which is what keeps a human
   * thread at the bot's wait from being read by nobody.
   */
  readonly threads: readonly ReviewThread[];
}

function reviewOf(record: TicketRecord, pr: PullRequestView): Review {
  const outstanding = unjudgedThreads(pr, record);
  const automated = outstanding.filter((thread) => isAutomatedReviewer(thread.author));
  const open = pr.threads.filter((thread) => !thread.isResolved);
  return {
    open,
    judged: record.judged.filter((one) => open.some((thread) => thread.id === one.threadId)),
    threads: automated.length > 0 ? automated : outstanding,
  };
}

/**
 * While the owner has the decision, nothing is built behind their back: the
 * escalation is the one answer the work is waiting on.
 */
function waitingOnTheOwner(record: TicketRecord, policy: Policy): Plan | null {
  if (!record.escalation || record.escalation.resolvedAt) return null;
  return wait(policy.pollBackoffMs, `waiting on the owner: ${record.escalation.reason}`);
}

/**
 * The owner's word, taken up wherever the pull request is read.
 *
 * It is new work whatever the reviewer is doing: they are the person whose
 * ticket it is, and what they ask for is done in the one place code changes.
 * The open comments taken up beside it are their own origin's work, and the
 * one whose rounds are spent is what the ask rests on.
 */
function theOwnersWord(
  record: TicketRecord,
  obs: Observation,
  pr: PullRequestView,
  policy: Policy,
): Plan | null {
  const word = ownerWordSince(record, obs);
  if (!word) return null;
  const threads = unjudgedThreads(pr, record);
  const rounds = [
    { origin: "owner", findings: 1 },
    ...(threads.length > 0 ? [{ origin: "thread", findings: threads.length }] : []),
  ];
  const climbs = rounds.map((one) => standingAfter(record, policy, one.origin, one.findings));
  const spent = strictest(climbs);
  if (spent?.exhausted) return handToTheOwner(record, spent, policy, rounds);
  return takenUp(`the owner asked for something: ${word.body}`, rounds, threads, word);
}

/**
 * The question only the owner can answer: a comment the change disagrees with,
 * or one that undoes the brief, is asked about once and never built behind
 * their back. Once they have answered it is work like any other, and this
 * leaves it to the round that builds it.
 */
function theOwnerIsOwed(record: TicketRecord, review: Review, policy: Policy): Plan | null {
  const owner = disputed(review.judged);
  if (!owner) return null;
  if (settledBy(record, owner)) return null;
  if (record.escalation && !record.escalation.resolvedAt) {
    return wait(policy.pollBackoffMs, `waiting on the owner: ${owner.threadId} needs their call`);
  }
  return escalateTheContradiction(owner);
}

/**
 * Whether the owner has already settled this thread.
 *
 * An escalation names the comments it was asked about, so a second comment
 * that contradicts the brief is a new question rather than one already
 * answered: the owner's answer to the first says nothing about it.
 */
function settledBy(record: TicketRecord, one: ThreadVerdict): boolean {
  const ask = record.escalation;
  if (!ask?.resolvedAt) return false;
  if (ask.threadIds !== undefined) return ask.threadIds.includes(one.threadId);
  // An escalation asked before the record kept its threads says which one it
  // was about at the head of its reason — `T1: the comment is wrong` — so a
  // second contradicting comment is still a question nobody has answered.
  return (ask.reason.split(":")[0] ?? "").includes(one.threadId);
}

/**
 * Answered once, on the thread: an answer already said is not said again every
 * poll, and the thread stays open only until the round publishes.
 */
function answersOutOfScope(record: TicketRecord, review: Review): Plan | null {
  const said = new Set(record.answered ?? []);
  const outOfScope = review.judged.filter(
    (one) => one.verdict === "out-of-scope" && !said.has(one.threadId),
  );
  if (outOfScope.length === 0) return null;
  return act(
    `answering ${outOfScope.length} thread(s) the brief puts out of scope`,
    ...outOfScope.map((one) => ({ type: "reply-thread" as const, threadId: one.threadId, text: one.note })),
  );
}

/**
 * A check that is red on the head is a round, taken up like the rest.
 *
 * Where a review about that head has already come back, the round is the
 * review's: the reviewer sent the work back and the red check is what it
 * found, so counting it again as the gate's would spend two origins' rounds
 * for one ask. A head nobody reviewed is the forge's own refusal, and that is
 * the gate's.
 */
function redChecks(
  record: TicketRecord,
  pr: PullRequestView,
  review: Review,
  policy: Policy,
): Plan | null {
  if (!checksFailedOnHead(pr)) return null;
  // A head the agent answered with "nothing to change" has had its checks
  // read: the reason is on the record, and reading the same red rollup again
  // would send the work back to the answer it already gave.
  if (record.lastImplementation?.progress?.kind === "unchanged" && implementationIsCurrent(record)) return null;
  const origin = pr.reviews.length > 0 ? "thread" : "gate";
  return takeUpOrEscalate(
    record,
    [{ origin, findings: 1 }],
    review.threads,
    `the checks on ${pr.headSha.slice(0, 7)} are red, which is work`,
    policy,
  );
}

/** The comments left to answer, plus the ones the owner's answer put back in play. */
function theCommentsToTakeUp(
  record: TicketRecord,
  pr: PullRequestView,
  review: Review,
  policy: Policy,
): Plan | null {
  const work = [...review.threads, ...threadsTheOwnerSettled(record, review)];
  if (work.length === 0) return null;

  const tooLarge = tooLargeForAnAgent(pr, policy);
  if (tooLarge) return handBack(record, pr, policy, tooLarge, work.map((thread) => thread.id));

  return takeUpOrEscalate(
    record,
    [{ origin: "thread", findings: work.length }],
    work,
    `${work.length} open comment(s) to take up`,
    policy,
  );
}

/** The thread a settled escalation put back in play: the review stands, so it is built. */
function threadsTheOwnerSettled(record: TicketRecord, review: Review): readonly ReviewThread[] {
  const owner = disputed(review.judged);
  if (!owner || !record.escalation?.resolvedAt) return [];
  return review.open.filter((thread) => thread.id === owner.threadId);
}

/**
 * The judgement the owner is owed, if the record carries one about a thread
 * the forge still has open.
 *
 * A disagreement with a reviewer and a thread that undoes the brief are one
 * thing to the machine: work it will not build and will not close, because the
 * person whose ticket it is has not said which of the two is right.
 */
function disputed(judged: readonly ThreadVerdict[]): ThreadVerdict | undefined {
  return judged.find((one) => one.verdict === "contradicts-brief" || one.verdict === "disagreed");
}

/** The one question a contradiction asks, and asks once. */
function escalateTheContradiction(one: ThreadVerdict): Plan {
  return advance("ESCALATED", `${one.threadId} contradicts the brief, and that is the owner's to settle`, {
    type: "escalate",
    reason: `${one.threadId}: ${one.note}`,
    threadIds: [one.threadId],
  });
}

/**
 * Takes new work up, or hands it to the owner when the origin that keeps
 * sending it back has spent the ladder.
 *
 * A check that stays red on a head nobody can fix is the same origin coming
 * back round after round, and the ladder is what stops that: once its rounds
 * are spent on the rung below a person, the work is the owner's.
 */
function takeUpOrEscalate(
  record: TicketRecord,
  rounds: readonly { origin: string; findings: number }[],
  threads: readonly ReviewThread[],
  why: string,
  policy: Policy,
): Plan {
  const climbs = rounds.map((one) => standingAfter(record, policy, one.origin, one.findings));
  const worst = strictest(climbs);
  if (worst?.exhausted) return handToTheOwner(record, worst, policy, rounds);
  return takenUp(why, rounds, threads);
}

/**
 * Where this round leaves an origin: the round that spends a level's last
 * allowance is the one that climbs, so the work is asked one rung higher
 * rather than run again on a rung it has already used up.
 */
function standingAfter(
  record: TicketRecord,
  policy: Policy,
  origin: string,
  findings: number,
): Climb {
  const climb = climbFor(policy.escalation, record, origin, findings);
  const spent = (record.spentByOrigin?.[origin] ?? climb.rounds) + 1;
  const rung = spent >= climb.needed ? climb.rung + 1 : climb.rung;
  return { ...climb, rung, exhausted: rung >= policy.escalation.rungs - 1 };
}

/** New work on its way to the one place code changes, with what it took up. */
function takenUp(
  why: string,
  rounds: readonly { origin: string; findings: number }[],
  threads: readonly ReviewThread[],
  ownerWord?: { author: string; body: string; at: string },
): TicketPlan {
  return carrying(advance("IMPLEMENTING", why), {
    rounds,
    ...(threads.length ? { taking: threads.map((thread) => thread.id) } : {}),
    ...(ownerWord ? { ownerWord } : {}),
  });
}

/**
 * Whether the forge's checks say the head is red.
 *
 * A red rollup from three pushes ago says nothing about the head, which is why
 * the check carries the commit it ran against: only a verdict about the commit
 * that is there now is new work.
 */
function checksFailedOnHead(pr: PullRequestView): boolean {
  return pr.checks?.state === "failing" && pr.checks.commitSha === pr.headSha;
}

/** The open threads nobody has judged, from either reviewer. */
function unjudgedThreads(pr: PullRequestView, record: TicketRecord): readonly ReviewThread[] {
  const judged = judgedThreadIds(record);
  return pr.threads.filter((thread) => !thread.isResolved && !judged.includes(thread.id));
}

/**
 * The owner's newest word since the one the work acted on, if any.
 *
 * The ticket's own conversation is where somebody speaks to the machine about
 * the ticket, and the work's thread is where the pull request's review lives;
 * a comment the machine wrote is never the owner speaking.
 */
function ownerWordSince(record: TicketRecord, obs: Observation): { author: string; body: string; at: string } | undefined {
  // A word the triage already read is not new work: it answered a question the
  // machine asked, and building it again would charge a round for an answer
  // that was used before the first change was made.
  // Only a triage that read answers has already acted on a word: a triage
  // that asked nothing is not a moment the owner's word stopped being news.
  const since = record.clarification?.length ? laterOf(record.ownerWord?.at, record.triage?.at) : record.ownerWord?.at;
  return obs.conversation
    .filter((said) => !said.fromAmy && said.author !== undefined && said.body.trim().length > 0)
    .filter((said) => since === undefined || said.at > since)
    .at(-1);
}

/** The later of two instants, ignoring the one that is not there. */
function laterOf(one: string | undefined, other: string | undefined): string | undefined {
  if (one === undefined) return other;
  if (other === undefined) return one;
  return one >= other ? one : other;
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

  /**
   * Close what this machine answered and the forge still holds open, before
   * looking at anything left.
   *
   * The pool is every unresolved automated thread the forge reports, not the
   * unjudged remainder: a thread the record judged `fixed` drops out of
   * `outstanding`, and a state that only looked there would leave the way its
   * exit condition reads while the conversation was still open on the forge —
   * a judged thread is one the record has an opinion about, not one the forge
   * agrees is settled. The move is one act per thread judged `fixed`: the
   * code changed, so the conversation is over. One act per look, because the
   * next look sees the threads resolved and finds nothing more to close.
   */
  const answered = unresolvedThreads(pr, "automated").filter((t) =>
    record.judged.some((j) => j.threadId === t.id && j.verdict === "fixed"),
  );
  if (answered.length > 0) {
    return act(
      `closing ${answered.length} thread(s) the fix answered`,
      ...answered.map((t) => ({ type: "resolve-review-thread" as const, threadId: t.id })),
    );
  }

  if (open.length === 0) {
    return advance("COPILOT_WAIT", "every automated thread has been judged");
  }

  const tooLarge = tooLargeForAnAgent(pr, policy);
  if (tooLarge) return handBack(record, pr, policy, tooLarge, open.map((t) => t.id));

  return act(`addressing ${open.length} automated thread(s)`, {
    type: "address-threads",
    threadIds: open.map((t) => t.id),
    from: "automated",
    ...settledDiscussion(record),
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
    const looks = looksIn(record, "REVIEWER_ASSIGNED");
    if (looks < patientRounds(policy)) {
      return wait(policy.pollBackoffMs, `the checks on ${pr.headSha.slice(0, 7)} have not finished`);
    }
    return handBackBroken(
      record,
      pr,
      policy,
      `the checks on ${pr.headSha.slice(0, 7)} never finished`,
    );
  }

  // New work on the pull request is taken up before anybody is asked to read
  // it: a red check or an open comment is the implementation's, not a
  // reviewer's.
  const newWork = weighNewWork(record, pr, obs, policy);
  if (newWork) return newWork;

  const broken = whatTheForgeSays(pr);
  if (broken) return handBackBroken(record, pr, policy, broken);

  const requested = pendingReviewRequest(record, obs, policy);
  if (requested) return requested;

  const firstLook = looksIn(record, "REVIEWER_ASSIGNED") === 0;

  if (!isConfirmedFor(obs.roster, obs.now)) {
    return holdAndSayOnce(
      firstLook,
      policy.rosterBackoffMs,
      `the roster was last confirmed on ${obs.roster.confirmedOn}, not today`,
      `Confirm today's reviewers and QA before I assign ${unitOf(record)}.`,
    );
  }

  // A reviewer this work already has is asked again rather than replaced:
  // handing a change somebody has read to a second person loses the thread
  // they were reading it by, and the record loses who sent it back.
  if (record.reviewer) {
    return advance("HUMAN_REVIEW", `${record.reviewer} reads the round the review asked for`);
  }

  const reviewer = leastLoadedReviewer(obs.roster, obs.reviewLoad);
  if (!reviewer) {
    return holdAndSayOnce(
      firstLook,
      policy.rosterBackoffMs,
      "every reviewer on the roster is marked unavailable",
      `No reviewer is available for ${unitOf(record)}.`,
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
      `${unitOf(record)} has a pull request open and nobody assigned: ` +
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

  // The owner's word is new work whatever the reviewer is doing: they are the
  // person whose ticket it is, and what they ask for is done in the one place
  // code changes.
  const word = theOwnersWord(record, obs, pr, policy);
  if (word) return word;

  // A disagreement the record already carries is the owner's call now: waiting
  // for the reviewer to look again would leave the machine holding a question
  // only they can answer.
  const disputedAlready = disputed(
    record.judged.filter((one) => pr.threads.some((thread) => thread.id === one.threadId && !thread.isResolved)),
  );
  if (disputedAlready && !settledBy(record, disputedAlready) && (!record.escalation || record.escalation.resolvedAt !== undefined)) {
    return escalateTheContradiction(disputedAlready);
  }

  const waiting = waitingForTheReviewer(record, pr, reviewer, policy);
  if (waiting) return waiting;
  return decidedAtThisReview(record, pr, obs, policy);
}

/** The two reasons this state waits on one person, and nothing else. */
function waitingForTheReviewer(
  record: TicketRecord,
  pr: PullRequestView,
  reviewer: string,
  policy: Policy,
): Plan | null {
  const head = pr.headSha.slice(0, 7);
  if (!hasReviewedHead(pr, reviewer)) return wait(policy.pollBackoffMs, `waiting for ${reviewer} to review ${head}`);
  const askedAgain = askedAgainAt(record);
  if (askedAgain !== undefined && !reviewedSince(pr, reviewer, askedAgain)) {
    return wait(policy.pollBackoffMs, `waiting for ${reviewer} to look again at ${head}`);
  }
  return null;
}

/** What the reviewer's answer, and the pull request beside it, mean for the work. */
function decidedAtThisReview(record: TicketRecord, pr: PullRequestView, obs: Observation, policy: Policy): Plan {
  if (pr.reviewDecision === "APPROVED") return advance("APPROVED", `${record.reviewer} approved the current head`);
  const newWork = weighNewWork(record, pr, obs, policy);
  if (newWork) return newWork;
  if (pr.reviewDecision === "CHANGES_REQUESTED") {
    return advance("RE_REVIEW", "every thread was judged, the review has to be redone");
  }
  return wait(policy.pollBackoffMs, `${record.reviewer} commented without deciding`);
}

/**
 * When this round of review was asked for again, if it was.
 *
 * Nothing pushed since the reviewer asked for changes leaves their review on
 * the head, and reading it as the answer to the request just made sends the
 * work straight back to ask again, without ever waiting. Under `writes:
 * operator` the request is the operator's, made when the turn was said, and
 * a review since then is the answer even if it came before the record moved.
 */
function askedAgainAt(record: TicketRecord): string | undefined {
  const last = record.history.at(-1);
  if (last?.from !== "RE_REVIEW" || last.to !== "HUMAN_REVIEW") return undefined;
  // Keyed as `handOver` keyed it while the record was in RE_REVIEW: one round per entry into it.
  const round = record.history.filter((moved) => moved.to === "RE_REVIEW").length;
  return record.handedOverAt?.[`request-review@${record.reviewer}@round${round}`] ?? last.at;
}

/** One review by the reviewer, on the current head, submitted after `since` — all three on the same review. */
function reviewedSince(pr: PullRequestView, reviewer: string, since: string): boolean {
  const who = reviewer.toLowerCase();
  const after = Date.parse(since);
  return pr.reviews.some((review) =>
    review.author.toLowerCase() === who && review.commitSha === pr.headSha && Date.parse(review.submittedAt) > after);
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
      ...settledDiscussion(record),
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

/**
 * Back to where the escalation interrupted the work, once the owner answers.
 *
 * A record escalated before the resume point was remembered has none, and
 * goes to the review that reads the answer: HUMAN_FIX changed code outside
 * the checks, which is a state this walk no longer draws.
 */
function planEscalated(record: TicketRecord, obs: Observation, policy: Policy): Plan {
  if (obs.escalationAnswered) {
    const back = record.resumeAt ?? "HUMAN_REVIEW";
    return advance(back, `the owner decided, back to ${back} where the escalation stopped it`);
  }
  const escalation = record.escalation;
  const discussion = escalation && discussing(record, obs.conversation, policy, escalation.askedAt, escalation.reason);
  if (discussion) {
    const threadIds = disagreements(record).map((verdict) => verdict.threadId);
    return act(`answering ${discussion.turns.length} turn(s) of the owner's discussion; nothing is decided yet`, {
      ...discussion,
      ...(record.clarification?.length ? { clarification: record.clarification } : {}),
      ...(threadIds.length ? { threadIds } : {}),
    });
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
  // Somebody already handed it over — another repository's work item, or
  // the operator — and handing it over twice is not a second handoff.
  if (handedToQa(obs)) return advance("DONE", `${obs.ticket.id} is already in QA and owned by ${obs.roster.qa.tracker}`);

  const joined = joinRepositories(obs, policy);
  if (joined) return joined;

  const firstLook = looksIn(record, "QA_HANDOFF") === 0;

  if (!isConfirmedFor(obs.roster, obs.now)) {
    return wait(
      policy.rosterBackoffMs,
      `the roster was last confirmed on ${obs.roster.confirmedOn}, not today`,
      ...(firstLook
        ? ([
            {
              type: "announce" as const,
              text: `Confirm today's QA owner before I hand over ${unitOf(record)}.`,
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
              text: `The QA owner for ${unitOf(record)} is away, who takes it?`,
            },
          ] as const)
        : []),
    );
  }

  return advance("DONE", `handing ${unitOf(record)} to ${obs.roster.qa.tracker}`, {
    type: "hand-off-to-qa",
    tracker: obs.roster.qa.tracker,
  });
}

/**
 * One ticket in several repositories is one work item per repository, and QA
 * receives it once, when every one of them has merged.
 *
 * The first repository's item is the one that hands it over, so two items
 * reaching this state together cannot hand it over twice. The others wait
 * until they see it handed over rather than finishing first: which one is
 * first follows the labels, and an item that had already finished could not
 * take the handoff over when the labels were reordered under it. A
 * repository added later is read here like the rest, so the handoff waits
 * for it too.
 */
function joinRepositories(obs: Observation, policy: Policy): Plan | null {
  const repositories = obs.repositories ?? [];
  if (repositories.length < 2) return null;

  const open = repositories.filter((repository) => !repository.merged).map((repository) => repository.repo);
  if (open.length > 0) {
    return wait(policy.pollBackoffMs, `${obs.ticket.id} waits for ${open.join(", ")} to merge before QA`);
  }

  // The others finish on the status alone: the owner the first one assigned
  // is the first one's to check, and the roster may have moved since.
  const leader = repositories[0]!.repo;
  if (leader !== obs.ticket.repo) {
    return obs.inQa
      ? advance("DONE", `${leader}'s work item handed ${obs.ticket.id} to QA`)
      : wait(policy.pollBackoffMs, `every repository merged; waiting for ${leader}'s work item to hand ${obs.ticket.id} to QA`);
  }
  return null;
}
