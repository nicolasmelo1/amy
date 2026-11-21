import fs from "node:fs";
import path from "node:path";
import {
  ActionContext,
  AgentRun,
  Plan,
  Ask,
  baseBranchFor,
  briefOf,
  Climb,
  climbFor,
  Conversation,
  FoundWork,
  Moved,
  renderBrief,
  sayToOperator,
  ProgressPolicy,
  PullRequestView,
  startRung,
  strictest,
  WorkflowActionScope,
  WorkflowPieceContext,
  parseBudget,
  unitOf,
} from "@amykit/core";
import type { Git } from "@amykit/core";
import { implementStep, judgeStep } from "@amykit/agent-kit";
import {
  ReviewerHints,
  branchOf,
  discussPrompt,
  implementPrompt,
  readTriage,
  readVerdicts,
  threadPrompt,
  triagePrompt,
  unreadTriage,
  questionText,
} from "./agent-steps.js";
import { Effect, WRITE_EFFECTS, WriteEffect } from "./effects.js";
import { Observation, Policy, Said, StackBase } from "./observation.js";
import { decided, decisionLines } from "./discussion.js";
import { EffectOutcomes, applyOutcomes, applyTransition, applyWork } from "./outcomes.js";
import type { configSchema, needs } from "./plugin.js";
import { loadRoster } from "./roster.js";
import { TicketRecord } from "./record.js";
import { Ticket, pullRequestTitle, stackBasesIn } from "./ticket.js";
import { refuseARemovedState } from "./machine.js";
import { isAutomatedReviewer } from "./review.js";

/**
 * How this workflow's work is found and looked at, what each action does, and
 * how the result folds back in — each a function of what the declaration
 * hands it: the mounted ports, the settings, the policy and the checkouts.
 *
 * It lived inside the engine, and that is what made the engine drive exactly
 * one workflow. Everything here names a ticket, a pull request or a reviewer,
 * so it belongs on this side of the boundary; what stayed behind is a queue,
 * a budget, a retry count and a stop switch, which name nothing.
 */
type Scope = WorkflowPieceContext<typeof configSchema, Policy, typeof needs>;
type ActionScope = WorkflowActionScope<typeof configSchema, Policy, typeof needs>;
type Work = ActionContext<TicketRecord, Observation>;

/**
 * The part of `Git` this workflow drives, for a test that hands a fake rather
 * than a git. `commit` and `push` are apart on purpose, because the whole
 * point of the move is that a change is committed before anybody reads it and
 * pushed only after they have; a git from before that split still offers
 * `commitAndPush` alone, and is driven that way.
 */
export type TicketGit = Pick<Git, "pathFor" | "acquire" | "prepareBranch" | "commit" | "push" | "commitAndPush" | "headSha">;

/** Exhaustive over this workflow's actions, checked at compile time. */
type TicketActions = {
  [K in Effect["type"]]: (scope: ActionScope, work: Work, effect: Extract<Effect, { type: K }>) => Promise<void>;
};

/** Evidence-progress policy, when this install opted in under `budget`. */
export function progress(scope: Scope): ProgressPolicy | undefined {
  const parsed = parseBudget(scope.config.budget);
  if (!parsed.ok) throw new Error(parsed.problems.join("; "));
  return parsed.limits.progress;
}

/**
 * One work item per repository. The ticket's own repository keeps the
 * ticket's own id, so a ticket labelled into more repositories while its
 * work is under way keeps that work item and gains one per new repository,
 * instead of starting the same work again under a new name. A ticket in
 * several is refused here, before any of it starts, when the host could
 * never say they had all merged.
 */
export async function discover(scope: Scope): Promise<FoundWork[]> {
  const only = (scope.config.onlyTickets ?? []) as readonly string[];
  return (await scope.ports.tracker.inProgress()).flatMap((ticket) => {
    // An install may limit itself to the tickets it was asked about; an empty
    // list is every ticket, which is what an install that named none means.
    if (only.length > 0 && !only.includes(ticket.id)) return [];
    const priority = ticket.priority === undefined ? {} : { priority: ticket.priority };
    if ((ticket.repos?.length ?? 0) > 1) requireMergeLookup(scope, ticket);
    return (ticket.repos ?? [ticket.repo]).map((repo) => ({
      workId: repo === ticket.repo ? ticket.id : workIdFor(ticket.id, repo),
      ...priority,
    }));
  });
}

export async function observe(scope: Scope, current: TicketRecord): Promise<Observation> {
  // A record an older version saved where the review loop changed code is
  // refused here, at the load, naming the record and the state: nothing below
  // can read a change nobody checked, and picking a state for it would decide
  // silently what the person whose ticket it is has to read.
  refuseARemovedState(current);
  // The ticket is the unit's: called as a phase, the record's own id is the
  // call's, and a called id with no repository of its own is worked where the
  // ticket's labels put it. The brief is read under the unit's work id: a
  // ticket worked in more than one repository is a unit per repository, and
  // its project judges its own.
  const { ticket, briefId } = await requireTicketWithBrief(scope, current.id);
  // A ticket whose tracker derived no branch is refused here, on its
  // first look, before any branch is prepared for it.
  const pullRequest = await pullRequestFor(scope, ticket, current.state);
  const stack = await stackFor(scope, ticket);

  // Only fetched where it is used, so a poll that is only waiting for a
  // review does not hammer the code host counting everybody's workload.
  const reviewLoad =
    current.state === "REVIEWER_ASSIGNED"
      ? await scope.ports["code-host"].reviewLoad(scope.config.repos)
      : {};

  return {
    ticket,
    // The brief this look resolved, recorded with what triage says so a
    // question asked later lands where the prompt was built from — not where
    // a brief that appeared mid-triage now says.
    ...(briefId ? { briefId } : {}),
    pullRequest,
    ...(stack ? { stack } : {}),
    reviewLoad,
    // Read when a look needs it, not at mount, so confirming the roster
    // takes effect without a restart. With the recovery root named: the
    // machine's state directory, since a phase's profile-own directory is
    // not its parent, so the fallback must not guess from dirname.
    roster: loadRoster(scope.ctx.paths.profile ?? scope.ctx.paths.state, scope.ctx.paths.state),
    ...(await answersFor(scope, current, ticket)),
    ...(await whereItStands(scope, ticket, current.state)),
    now: scope.ctx.now(),
  };
}

/**
 * Where a stacked ticket's branch starts: the parent's pull request branch
 * while it is open, the branch it merged into once it landed, and a hold that
 * names the parent while its repository has no pull request for it.
 *
 * The install's `stackBases` is read first, and the ticket's own
 * `Stack base:` line after it. Two lines are two answers, which is refused by
 * name rather than guessed between.
 */
async function stackFor(scope: Scope, ticket: Ticket): Promise<StackBase | undefined> {
  const lines = stackBasesIn(ticket.body);
  if (lines.length > 1) {
    throw new Error(
      `${ticket.id} says two \`Stack base\` lines (${lines.join(", ")}); a ticket stacks on one parent — keep one, or name it under stackBases`,
    );
  }
  const configured = (scope.config.stackBases ?? {}) as Readonly<Record<string, string>>;
  const parent = configured[ticket.id] ?? lines[0];
  if (!parent) return undefined;

  const host = scope.ports["code-host"];
  const parentTicket = await scope.ports.tracker.get(parent);
  const byId = (await host.findPullRequestMentioning?.(ticket.repo, parent)) ?? null;
  const found = byId ?? (parentTicket?.branchName ? await host.findPullRequest(ticket.repo, parentTicket.branchName) : null);
  if (!found) return { parent, waiting: true };

  const base = found.merged ? found.base : found.headBranch ?? parentTicket?.branchName;
  return base ? { parent, base } : { parent, waiting: true };
}

/**
 * Only this workflow's own half of the fold.
 *
 * The engine has already put the record through `applyPlan` — the state,
 * the attempt count and the history — and folding it again here counted
 * every retry twice and wrote a transition from each state to itself.
 * `applyTicketPlan` is still what a caller driving the machine *without*
 * an engine wants, which is why both exist.
 */
export function remember(
  scope: Scope,
  current: TicketRecord,
  outcomes: Record<string, unknown>,
  observation: Observation,
  moved: Moved | null,
  decision: unknown,
  now: Date,
): TicketRecord {
  const folded = outcomes as EffectOutcomes;

  // The owner's answer to an escalation arrives as an observation rather
  // than as the result of an action — the move it unblocks carries no
  // action at all — so it is folded here rather than by a handler.
  const settled =
    current.escalation && !current.escalation.resolvedAt && observation.escalationAnswered
      ? {
          ...folded,
          escalationResolvedAt: now.toISOString(),
          escalationDecision: decisionLines(current, observation.conversation, scope.policy, current.escalation.askedAt),
        }
      : folded;

  const applied = applyOutcomes(current, settled);
  const transitioned = applyTransition(applied, moved);
  // The engine has already advanced the record it hands the fold, so the state
  // the move left is the move's, not the record's.
  const from = moved?.from ?? current.state;
  return toTheChecks(applyWork(transitioned, from, decision as Plan, now, scope.policy), observation, moved);
}

/**
 * The actions this install may run. With the writes handed to the operator,
 * not a single action that writes is declared, so the mount can hold the
 * empty claim to its word: nothing here could reach a write even by mistake.
 */
export function actionsFor(policy: Policy): Partial<TicketActions> {
  return Object.fromEntries(Object.entries(ACTIONS).filter(([name]) => policy.writes === "operator"
    ? !(WRITE_EFFECTS as readonly string[]).includes(name)
    : name !== "hand-over"));
}

/** The outcomes bag, typed at the one boundary that knows what is in it. */
const outcomesOf = (work: Work): EffectOutcomes => work.outcomes as EffectOutcomes;

/** Whether the brief this look read is the unit's own, the one its project judged. */
const ownBrief = (work: Work): boolean => work.observation.briefId === unitOf(work.record);

const ACTIONS: TicketActions = {
  "triage": async (scope, work, effect) => {
    const ticket = work.observation.ticket;
    const at = scope.ctx.now().toISOString();
    const { value, run } = await judgeStep(scope.ports.agent, {
      prompt: triagePrompt(ticket, effect.conversation, ownBrief(work)),
      cwd: await scope.checkouts.git.acquire(ticket.repo, work.record.id),
      context: { workId: work.record.id, step: "triage" },
      read: (answer) => readTriage(answer, at),
      fallback: unreadTriage(at),
    });
    refuseAnIncompleteRun("triage", run);
    outcomesOf(work).triage = {
      ...value,
      ...(work.observation.briefId ? { briefId: work.observation.briefId } : {}),
    };
    if (effect.conversation?.length) outcomesOf(work).clarification = effect.conversation;
  },

  "ask-question": async (scope, work, effect) => {
    const { conversation, tracker, brief } = scope.ports;
    if (conversation) {
      const thread = await conversation.open(unitOf(work.record), work.observation.ticket.title);
      if (conversation.asks) {
        for (const question of effect.questions) {
          if (typeof question === "string") {
            await conversation.post(thread, { text: question });
          } else {
            const ask = askFor(question);
            await conversation.post(thread, { text: ask.prompt, ask });
          }
        }
      } else {
        await conversation.post(thread, { text: numberedQuestions(effect.questions) });
      }
    } else {
      await tracker.comment(
        work.observation.ticket.id,
        numberedQuestions(effect.questions),
      );
    }
    await scope.announce(`${unitOf(work.record)} needs an answer before I can start.`);

    // Appended to the brief the triage prompt was built from, recorded with
    // what triage said: a brief that appeared while the agent was reading is
    // not the one the question answers, and the store is not read again here.
    // A record triaged before that was recorded has no id to go on, so its
    // question lands where this look read the brief, as it did before.
    // Nothing appends an answer; that is the owning workflow's revision.
    const read = outcomesOf(work).triage ?? work.record.triage;
    const briefId = read?.briefId ?? work.observation.briefId;
    if (brief && briefId) {
      for (const question of effect.questions) {
        await brief.appendQuestion({
          id: briefId,
          question: { workId: unitOf(work.record), question: questionText(question), at: scope.ctx.now().toISOString() },
          at: scope.ctx.now().toISOString(),
        });
      }
    }
  },

  "implement": async (scope, work, effect) => {
    const { git } = scope.checkouts;
    const ticket = work.observation.ticket;
    const branch = branchOf(ticket);
    const from = work.observation.stack && "base" in work.observation.stack ? work.observation.stack.base : undefined;
    // A stacked ticket is cut from its parent's branch; anything else from the
    // repository's base. The extra argument is left off entirely when there is
    // no stack, so a git that never heard of one sees the call it always saw.
    if (from) await git.prepareBranch(ticket.repo, branch, work.record.id, from);
    else await git.prepareBranch(ticket.repo, branch, work.record.id);
    const cwd = await git.acquire(ticket.repo, work.record.id);
    // The round's own comments, and nobody else's: the threads this move took
    // up are what the step is asked to answer.
    const taken = (work.observation.pullRequest?.threads ?? []).filter((thread) =>
      (work.record.taking ?? []).includes(thread.id),
    );
    const { value, run } = await implementStep(scope.ports.agent, {
      prompt: implementPrompt(
        ticket,
        effect.retryContext,
        effect.continuationContext,
        effect.conversation,
        effect.discussion,
        ownBrief(work),
        taken,
        taken.every((thread) => isAutomatedReviewer(thread.author)) ? "automated" : "human",
      ),
      cwd,
      context: {
        workId: work.record.id,
        step: "implement",
        // The rung this round starts on: the climb the origin that sent the
        // work back has already earned, never the person at the top.
        ...implementingRung(work, scope.policy),
      },
      // The change is committed and goes no further: what reaches the remote
      // is what the gate and the review have read, and publishing is what
      // sends it.
      commit: () => commitTheChange(git, cwd, ticket.repo, `${ticket.id}: ${ticket.title}`, work.record.id),
      now: scope.ctx.now,
    });
    if (run.outcome === "rate-limited") {
      outcomesOf(work).waited = { notATry: true, retryAfterMs: run.retryAfterMs ?? scope.policy.pollBackoffMs };
      outcomesOf(work).continuationContext = [
        ...(effect.continuationContext ? [effect.continuationContext] : []),
        `The previous run stopped at a usage limit.`,
        ...(value.output ? [`Its partial reply was:\n${value.output}`] : []),
      ].join("\n\n");
      return;
    }
    outcomesOf(work).continuationContext = null;
    outcomesOf(work).implementation = value;
    // The commit both checks are lent: what this attempt left on the branch.
    outcomesOf(work).implemented = { repo: ticket.repo, revision: await git.headSha(ticket.repo, work.record.id) };
  },

  /**
   * Puts the round on the remote, once, after the gate and the self-review
   * have read the commit. A round the checks refused never reaches here.
   */
  "push": async (scope, work) => {
    const { git } = scope.checkouts;
    const ticket = work.observation.ticket;
    const branch = work.observation.pullRequest?.headBranch ?? branchOf(ticket);
    await git.push(ticket.repo, branch, work.record.id);
  },

  /**
   * Answers a review comment on its thread, for work the brief answers rather
   * than builds. The answer goes where the person wrote it: the work's own
   * thread when a conversation is mounted, and the ticket when it is not.
   */
  "reply-thread": async (scope, work, effect) => {
    const text = effect.text?.trim();
    if (!text) return;
    const ticket = work.observation.ticket;
    const answer = `${effect.threadId}: ${text}`;
    const { conversation } = scope.ports;
    if (conversation) {
      const thread = await conversation.open(unitOf(work.record), ticket.title);
      await conversation.post(thread, { text: answer });
      return;
    }
    await scope.ports.tracker.comment(ticket.id, answer);
    outcomesOf(work).answered = [effect.threadId];
  },

  "open-pull-request": async (scope, work) => {
    // The base is the repository's own: the mapping reached this workflow
    // beside the fallback it overrides, and the host is told only what
    // was named — an absent base keeps the forge's own default.
    outcomesOf(work).pullRequestNumber = await scope.ports["code-host"].openPullRequest({
      repo: work.observation.ticket.repo,
      branch: branchOf(work.observation.ticket),
      title: pullRequestTitle(work.observation.ticket),
      base: baseBranchFor(scope.checkouts.layout, work.observation.ticket.repo),
      // Empty by convention. The ticket is the description.
      body: "",
    });
  },

  // The thread id the action carries is all the call needs.
  "resolve-review-thread": async (scope, _work, effect) => {
    await scope.ports["code-host"].resolveReviewThread(effect.threadId);
  },

  "address-threads": async (scope, work, effect) => {
    const { git } = scope.checkouts;
    const threads = (work.observation.pullRequest?.threads ?? []).filter((thread) =>
      effect.threadIds.includes(thread.id),
    );
    const ticket = work.observation.ticket;
    // The pull request's own branch: one found by its title — a ticket
    // renamed since, or opened by the operator from a branch of their
    // choosing — is not on the branch the ticket names now, and a fix
    // pushed there would never reach the threads it answered.
    const branch = work.observation.pullRequest?.headBranch ?? branchOf(ticket);
    await git.prepareBranch(ticket.repo, branch, work.record.id);
    const { value, run } = await judgeStep(scope.ports.agent, {
      prompt: threadPrompt(ticket, threads, effect.from, scope.config.reviewerHints as ReviewerHints, effect.discussion, ownBrief(work)),
      cwd: await git.acquire(ticket.repo, work.record.id),
      context: { workId: work.record.id, step: "address-threads" },
      read: (answer) => readVerdicts(answer, threads),
      // An empty list is never read as "no comment needed answering": the
      // run did not complete, and the engine fails the action below.
      fallback: [],
    });
    refuseAnIncompleteRun("address-threads", run);
    await git.commitAndPush(ticket.repo, branch, `${ticket.id}: address review comments`, work.record.id);
    outcomesOf(work).verdicts = value;
  },

  // Read-only and moving nothing: the agent answers on the work's branch, the
  // answer goes back to the thread, and what was said is remembered so the
  // decision can carry it. Nothing is committed and no state changes.
  "discuss": async (scope, work, effect) => {
    const { git } = scope.checkouts;
    const { conversation } = scope.ports;
    const ticket = work.observation.ticket;
    if (!conversation) {
      throw new Error(`${unitOf(work.record)} has a discussion to answer and no conversation is mounted to answer it in`);
    }
    // Without a worktree the checkout is shared, and another ticket may have
    // moved it while this one waited: the work's own branch is put back
    // first, the way every step that reads the work's code does.
    await git.prepareBranch(ticket.repo, work.observation.pullRequest?.headBranch ?? branchOf(ticket), work.record.id);
    const reply = await scope.ports.agent.ask(
      discussPrompt(ticket, effect.about, effect.thread, effect.turns, {
        clarification: effect.clarification,
        threads: (work.observation.pullRequest?.threads ?? []).filter((thread) => effect.threadIds?.includes(thread.id)),
      }, ownBrief(work)),
      await git.acquire(ticket.repo, work.record.id),
      { workId: work.record.id, step: "discuss", brief: ticket.brief, readOnly: true },
    );
    refuseAnIncompleteRun("discuss", reply.run);
    const thread = await conversation.open(unitOf(work.record), ticket.title);
    await conversation.post(thread, { text: reply.text });
    outcomesOf(work).discussed = {
      since: effect.since,
      upTo: effect.turns.at(-1)!.at,
      lines: [...effect.turns.map((turn) => `${turn.author} asked: ${turn.text}`), `You answered: ${reply.text}`],
    };
  },

  "assign-reviewer": async (scope, work, effect) => {
    await requestReview(scope, work, effect.host);
    outcomesOf(work).reviewer = effect.host;
  },

  "request-rereview": async (scope, work, effect) => {
    await requestReview(scope, work, effect.host);
  },

  "escalate": async (scope, work, effect) => {
    const followUpTicketId = await scope.ports.tracker.createFollowUp({
      parentTicketId: work.observation.ticket.id,
      title: `FUP ${work.observation.ticket.id}: review comments need a decision`,
      body: effect.reason,
    });

    outcomesOf(work).escalation = {
      reason: effect.reason,
      askedAt: scope.ctx.now().toISOString(),
      followUpTicketId,
    };

    await scope.announce(`${unitOf(work.record)} is parked, ${followUpTicketId} has the details.`);
  },

  "hand-off-to-qa": async (scope, work, effect) => {
    await scope.ports.tracker.setStatus(work.observation.ticket.id, scope.config.qaStatusName);
    await scope.ports.tracker.assign(work.observation.ticket.id, effect.tracker);
  },

  // Only worth saying, so a channel that fails never costs the work a move.
  "announce": async (scope, _work, effect) => {
    await scope.announce(effect.text);
  },

  // Not swallowed the way an announcement is: a turn nobody heard is a
  // write nobody makes, so a failure here fails the action and the look is
  // tried again. Only a turn that was said is recorded as said.
  "hand-over": async (scope, work, effect) => {
    await sayToOperator(
      { conversation: scope.ports.conversation, notifier: scope.ports.notifier },
      {
        text: effect.turns.map((turn) => describeWrite(scope, turn.write, work)).join("\n\n"),
        workId: unitOf(work.record),
        title: work.observation.ticket.title,
        state: work.record.state,
      },
    );
    const outcomes = outcomesOf(work);
    outcomes.handedOver = effect.turns.map((turn) => turn.key);
    outcomes.handedOverAt = scope.ctx.now().toISOString();
    for (const { write } of effect.turns) {
      if (write.type === "assign-reviewer") outcomes.reviewer = write.host;
      if (write.type === "escalate") outcomes.escalation = { reason: write.reason, askedAt: scope.ctx.now().toISOString() };
    }
  },
};

/**
 * The ticket a work id stands for, in the repository the id names.
 *
 * A ticket in several repositories is one work item per repository, and the
 * id says which: `PROJ-1@owner/name`. Every tracker call still uses the
 * ticket's own id; only the repository the work happens in changes.
 *
 * A called work id — `PROJ-1239/WORK#1` — names no repository of its own. It
 * is worked where the ticket's labels put it, the first one when they name
 * several and leave out the team's: the ticket was labelled for the
 * repository somebody meant, and falling back to the team's would work the
 * frontend ticket in the backend.
 */
async function requireTicket(scope: Scope, workId: string): Promise<Ticket> {
  const unit = unitOf({ id: workId });
  const { ticketId, repo } = splitWorkId(unit);
  const found = await scope.ports.tracker.get(ticketId);
  if (!found) {
    throw new Error(`${ticketId} is not in the tracker any more`);
  }
  // The tracker's membership is kept before the repository is overridden:
  // a ticket whose last label went is back in its team's repository alone,
  // and an item for another repository must still see that it left.
  if (repo) return { ...found, repo, repos: found.repos ?? [found.repo] };

  const labelled = found.repos ?? [];
  const called = unit !== workId;
  const where = called && labelled.length > 0 && !labelled.includes(found.repo) ? labelled[0]! : found.repo;
  return where === found.repo ? found : { ...found, repo: where };
}

/**
 * The ticket with its brief resolved, when it has one.
 *
 * Read here rather than at discovery so a revision between ticks reaches
 * the second tick as the current text: the record never holds a copy, and
 * a step that needs the brief again re-observes, the way every other field
 * here is re-read rather than replayed. A ticket that references no brief,
 * or references one the store does not hold, is returned as it arrived —
 * an absent brief is a state, not an error.
 */
async function requireTicketWithBrief(scope: Scope, workId: string): Promise<{ ticket: Ticket; briefId?: string }> {
  const ticket = await requireTicket(scope, workId);
  // The brief is the unit's: a call's record is named for the call, and its
  // brief is the one the unit's project judged.
  const record = await briefOf(scope.ports.brief, { workId: unitOf({ id: workId }), briefId: ticket.briefId });
  if (!record) return { ticket };

  return { ticket: { ...ticket, brief: renderBrief(record).text }, briefId: record.id };
}

async function requestReview(scope: Scope, work: Work, host: string): Promise<void> {
  const number = work.observation.pullRequest?.number ?? work.record.pullRequestNumber;
  if (number === undefined) {
    throw new Error(`${work.record.id} has no pull request to request a review on`);
  }
  await scope.ports["code-host"].requestReview(work.observation.ticket.repo, number, host);
}

/**
 * The ticket's pull request: by its branch, and — once one exists — by the
 * id in its title, so a ticket renamed since is still found. At `PR_OPEN`
 * only when the operator opens it, because they may open it from another
 * branch; the machine opens it from this one and has nothing to search for.
 */
async function pullRequestFor(scope: Scope, ticket: Ticket, state: TicketRecord["state"]): Promise<PullRequestView | null> {
  const host = scope.ports["code-host"];
  const byBranch = await host.findPullRequest(ticket.repo, branchOf(ticket));
  if (byBranch || BEFORE_A_PULL_REQUEST.includes(state)) return byBranch;
  if (state === "PR_OPEN" && scope.policy.writes !== "operator") return byBranch;
  return (await host.findPullRequestMentioning?.(ticket.repo, ticket.id)) ?? null;
}

/**
 * What was said back to a question or an escalation, read where it was
 * asked: the work's thread, or the ticket.
 *
 * With the writes handed to the operator and no thread, the operator
 * answers on the ticket with their own account — the same account this
 * machine reads the tracker as, which the tracker reports as the machine's
 * own. In that mode the machine wrote nothing on the ticket, so every
 * comment there is the operator's, and is read as one.
 */
async function answersFor(
  scope: Scope,
  current: TicketRecord,
  ticket: Ticket,
): Promise<Pick<Observation, "conversation" | "escalationAnswered">> {
  const { tracker } = scope.ports;
  const awaitingAnswer = current.state === "CLARIFYING" && Boolean(current.triage);
  const awaitingOwner = Boolean(current.escalation && !current.escalation.resolvedAt);
  // A review is where the owner's own word is new work too: the ticket's
  // comments are read for it, from the last word acted on rather than from the
  // beginning of time.
  const listening = REVIEWING_STATES.includes(current.state);
  if (!awaitingAnswer && !awaitingOwner) {
    if (!listening) return { conversation: [], escalationAnswered: false };
    return { conversation: await tracker.comments(ticket.id, current.ownerWord?.at), escalationAnswered: false };
  }

  const since = awaitingAnswer ? current.triage!.at : current.escalation!.askedAt;
  const said = await saidSince(scope, unitOf(current), ticket, since);
  // A button carries the question it answered. A press from an earlier wait
  // is evidence for that earlier question, never an escalation decision.
  const relevant = said?.filter((reply) => !reply.answer || (awaitingAnswer && current.triage!.askedQuestions.includes(reply.answer.ask)));
  const escalationAnswered = awaitingOwner && (relevant ? decided(relevant, scope.policy) : await tracker.hasReplyAfter(ticket.id, since));
  // The ticket's comments are read once there is an answer in them, not on
  // every poll of a wait: the owner's words are what the resumed step acts on.
  return {
    conversation: relevant ?? (awaitingAnswer || escalationAnswered ? await tracker.comments(ticket.id, since) : []),
    escalationAnswered,
  };
}

/** The states after the change exists, where the owner's word is new work. */
const REVIEWING_STATES: readonly TicketRecord["state"][] = [
  "COPILOT_WAIT",
  "REVIEWER_ASSIGNED",
  "HUMAN_REVIEW",
  "RE_REVIEW",
];

/**
 * Commits what the agent left behind, under this machine's own subject.
 *
 * An agent that wrote `.amy-commit-body` has said why the change is what it
 * is — a justification a check may read — and the file becomes the body of
 * the commit. The file is deleted before the commit, so it is never part of
 * the change it explains. Nothing is pushed: the remote waits for the checks.
 */
async function commitTheChange(
  git: TicketGit,
  cwd: string,
  repo: string,
  subject: string,
  workId: string,
): Promise<boolean> {
  return git.commit(repo, takeCommitBody(cwd, subject), workId);
}

/** Where an implementing agent leaves the body of the commit it wants. */
const COMMIT_BODY_FILE = ".amy-commit-body";

/**
 * The commit message, with the agent's body when it left one, and the body
 * file gone.
 *
 * The file is the agent's way of justifying the change where a check reads
 * it: amy owns the subject, and the body is the agent's words verbatim. It is
 * removed whatever happens, so it is never committed and never leaks into the
 * next round's tree.
 */
function takeCommitBody(cwd: string, subject: string): string {
  const file = path.join(cwd, COMMIT_BODY_FILE);
  if (!fs.existsSync(file)) return subject;
  const body = fs.readFileSync(file, "utf-8").trim();
  fs.rmSync(file, { force: true });
  return body.length > 0 ? `${subject}\n\n${body}` : subject;
}

/**
 * The rung this implementation starts on: where the origin that last sent the
 * work back stands, never the person at the top of the ladder.
 */
function implementingRung(work: Work, policy: Policy): { rung?: number } {
  const origin = work.record.lastOrigin;
  if (!origin) return {};
  const findings = origin === "gate" ? work.record.lastGate?.findings ?? 1 : origin === "self-review" ? work.record.lastSelfReview?.findings ?? 1 : 1;
  const climb: Climb | undefined = strictest([climbFor(policy.escalation, work.record, origin, findings)]);
  return climb ? { rung: startRung(climb, policy.escalation) } : {};
}

/**
 * Everything said back since a turn, where only the operator can have
 * said it: the work's thread, or — with the writes handed over — the
 * ticket. Null where the machine comments on the ticket too, and the
 * tracker's own reading of who wrote what is the one to trust.
 */
async function saidSince(scope: Scope, unit: string, ticket: Ticket, since: string): Promise<Said[] | null> {
  if (scope.ports.conversation) return repliesFor(scope.ports.conversation, unit, since);
  if (scope.policy.writes !== "operator") return null;
  return (await scope.ports.tracker.comments(ticket.id, since)).map((comment) => ({ ...comment, fromAmy: false }));
}

/**
 * Whether the ticket already sits in QA, and — at the handoff, for a ticket
 * in several repositories — whether each one merged.
 */
async function whereItStands(scope: Scope, ticket: Ticket, state: TicketRecord["state"]) {
  return {
    retired: !(ticket.repos ?? [ticket.repo]).includes(ticket.repo),
    inQa: ticket.status === scope.config.qaStatusName,
    ...(state === "QA_HANDOFF" && (ticket.repos?.length ?? 0) > 1 ? { repositories: await mergedIn(scope, ticket) } : {}),
  };
}

/**
 * Each of the ticket's repositories, and whether its pull request merged.
 *
 * Read by the ticket's id, because the other repositories' pull requests
 * belong to other work items. A host that cannot find one that way is
 * refused by name: reading "cannot tell" as "not merged" would hold the
 * ticket at the handoff for ever.
 */
async function mergedIn(scope: Scope, ticket: Ticket) {
  const find = requireMergeLookup(scope, ticket);
  return Promise.all(
    (ticket.repos ?? []).map(async (repo) => ({ repo, merged: Boolean((await find(repo, ticket.id))?.merged) })),
  );
}

function requireMergeLookup(scope: Scope, ticket: Ticket) {
  const host = scope.ports["code-host"];
  if (!host.findPullRequestMentioning) {
    throw new Error(
      `${ticket.id} is in ${(ticket.repos ?? []).join(" and ")}, and the mounted code host cannot find a pull request by a ticket's id, so it cannot say when every one has merged`,
    );
  }
  return host.findPullRequestMentioning.bind(host);
}

/** What the operator is asked to do, in words they can act on from a phone. */
function describeWrite(scope: Scope, write: WriteEffect, work: Work): string {
  const ticket = work.observation.ticket;
  const words = {
    ticket,
    pr: work.observation.pullRequest,
    where: scope.ports.conversation ? "in this thread" : `on ${ticket.url}`,
    base: baseBranchFor(scope.checkouts.layout, ticket.repo),
    qaStatusName: scope.config.qaStatusName,
  };
  return (WRITE_WORDS[write.type] as (write: WriteEffect, words: Words) => string)(write, words);
}

/**
 * The repository both checks run in, held before they start. An
 * implementation this version made recorded it with its commit; one an older
 * version made did not, and the checks would have no repository to run in.
 */
function toTheChecks(record: TicketRecord, observation: Observation, moved: Moved | null): TicketRecord {
  if (moved?.to !== "checks" || record.implemented) return record;
  return { ...record, implemented: { repo: observation.ticket.repo } };
}

interface Words {
  ticket: Ticket;
  pr: PullRequestView | null;
  where: string;
  base: string;
  qaStatusName: string;
}

/** One sentence per write, so a new write does not build until it can be said. */
const WRITE_WORDS: { [K in WriteEffect["type"]]: (write: Extract<WriteEffect, { type: K }>, words: Words) => string } = {
  "ask-question": (write, { ticket, where }) =>
    [`${ticket.id} needs an answer before I can start. Answer ${where}:`, numberedQuestions(write.questions)].join("\n"),
  "escalate": (write, { ticket, where }) => `${ticket.id} needs your call, answer ${where}: ${write.reason}`,
  "open-pull-request": (_write, { ticket, base }) =>
    `Open a pull request for ${ticket.id} in ${ticket.repo}, from ${branchOf(ticket)} into ${base}, titled "${pullRequestTitle(ticket)}". I carry on once I see it.`,
  "reply-thread": (write, { where }) =>
    `Answer review thread ${write.threadId} ${where}: ${write.text}`,
  "resolve-review-thread": (write, { ticket, pr }) => {
    const thread = pr?.threads.find((candidate) => candidate.id === write.threadId);
    const on = thread?.path ? `on ${thread.path} ` : "";
    const about = thread ? ` (${thread.body.split("\n")[0]})` : "";
    return `Resolve the review thread ${on}in ${pr?.url ?? ticket.repo}: the change answered it.${about}`;
  },
  "assign-reviewer": (write, { ticket, pr }) => `Request a review of ${pr?.url ?? ticket.id} from ${write.host}.`,
  "request-rereview": (write, { ticket, pr }) => `Ask ${write.host} to review ${pr?.url ?? ticket.id} again: every comment is addressed.`,
  "hand-off-to-qa": (write, { ticket, qaStatusName }) => `Move ${ticket.id} to ${qaStatusName} and assign it to ${write.tracker}: ${ticket.url}`,
};

/** The states before a pull request is expected, where none is found by title either. */
const BEFORE_A_PULL_REQUEST: readonly TicketRecord["state"][] = [
  "DISCOVERED",
  "CLARIFYING",
  "READY",
  "IMPLEMENTING",
  "checks",
  "verdict",
];

/**
 * `PROJ-1@owner%2Fname` is PROJ-1 in owner/name; a bare id names no
 * repository. The repository is encoded because a work id is a file name in
 * the store, the queue and the inbox, and a slash in one is a directory.
 */
export function workIdFor(ticketId: string, repo: string): string {
  return `${ticketId}@${encodeURIComponent(repo)}`;
}

export function splitWorkId(workId: string): { ticketId: string; repo?: string } {
  const at = workId.indexOf("@");
  if (at === -1) return { ticketId: workId };
  return { ticketId: workId.slice(0, at), repo: decodeURIComponent(workId.slice(at + 1)) };
}

/** What was said in the unit's thread since a turn: a look only reads, so a unit with no thread yet has said nothing. */
async function repliesFor(conversation: Conversation, unit: string, since: string): Promise<Said[]> {
  const thread = await conversation.known(unit);
  if (!thread) return [];
  return conversation.replies(thread, since).then((replies) =>
    replies.map((reply) => ({
      author: reply.author,
      body: [reply.text, ...reply.files.map((file) => `Attachment: ${file}`)].filter(Boolean).join("\n"),
      at: reply.at,
      fromAmy: false,
      ...(reply.kind ? { kind: reply.kind } : {}),
      ...(reply.answer ? { answer: reply.answer, kind: "decision" as const } : {}),
    })),
  );
}

/** Text fallback for adapters that cannot render asks, and tracker comments. */
function numberedQuestions(questions: readonly import("./agent-steps.js").TriageQuestion[]): string {
  return questions.map((question, index) => {
    const text = questionText(question);
    return typeof question === "string"
      ? `- ${text}`
      : `${index + 1}. ${text}\n${question.answers.map((answer, answerIndex) => `   ${answerIndex + 1}. ${answer}`).join("\n")}`;
  }).join("\n");
}

function askFor(question: Exclude<import("./agent-steps.js").TriageQuestion, string>): Ask {
  if (question.answers[0] === "approve" && question.answers[1] === "reject" && question.answers.length === 2) {
    return { id: question.prompt, prompt: question.prompt, form: "approval", answers: ["approve", "reject"] };
  }
  return { id: question.prompt, prompt: question.prompt, form: "choice", answers: question.answers };
}

/**
 * Fails an action whose agent run did not complete.
 *
 * By the time this is reached, a relay has already tried every harness and
 * model it was given, so there is nowhere left to go and the action has to
 * fail rather than store an answer nobody gave.
 *
 * `implement` is deliberately not one of these: an attempt that did not hold
 * is a first-class outcome there, and the machine retries it with the reason
 * attached. `triage` and `address-threads` have no such outcome, and taking
 * their empty value as an answer would park a ticket waiting on a question
 * that was never asked, or drop a review comment nobody replied to.
 */
function refuseAnIncompleteRun(action: string, run: AgentRun): void {
  if (run.outcome === "completed") return;

  throw new Error(
    `${action} did not complete: ${run.outcome} on ${run.harness}` +
      `${run.model ? ` (${run.model})` : ""}${run.output ? `\n\n${run.output}` : ""}`,
  );
}
