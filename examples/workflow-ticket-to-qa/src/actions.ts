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
import { extractJson, implementStep, judgeStep } from "@amykit/agent-kit";
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
import { repliesOnIn, type ReplyPlace } from "./replies.js";
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
  // The ticket's own line is where the work says it stands; the config is
  // the answer for a ticket whose description says nothing.
  const parent = lines[0] ?? configured[ticket.id];
  if (!parent) return undefined;

  const parentTicket = await scope.ports.tracker.get(parent);
  // A parent whose work lives in another repository has no branch here to
  // start from, and waiting on it would hold this ticket for ever.
  if (parentTicket?.repo !== undefined && parentTicket.repo !== ticket.repo) return undefined;
  return startFrom(scope, ticket, parent, parentTicket);
}

/** The branch a stacked ticket starts on, or a hold that names the parent. */
async function startFrom(
  scope: Scope,
  ticket: Ticket,
  parent: string,
  parentTicket: Ticket | null,
): Promise<StackBase> {
  const host = scope.ports["code-host"];
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
/**
 * The branch this move's work sits on, ready to be committed to.
 *
 * A stacked ticket is cut from its parent's branch; anything else from the
 * repository's base. The extra argument is left off entirely when there is no
 * stack, so a git that never heard of one sees the call it always saw.
 */
async function prepareTheWorkBranch(
  git: Pick<Git, "prepareBranch">,
  ticket: Ticket,
  branch: string,
  workId: string,
  stack: StackBase | undefined,
): Promise<void> {
  const from = stack && "base" in stack ? stack.base : undefined;
  if (from) await git.prepareBranch(ticket.repo, branch, workId, from);
  else await git.prepareBranch(ticket.repo, branch, workId);
}

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
    const branch = await theBranchTheWorkIsOn(scope, ticket);
    await prepareTheWorkBranch(git, ticket, branch, work.record.id, work.observation.stack);
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
    // What the step said about the comments it was handed, if it was handed
    // any: the record keeps the reader's word, and an unanswered comment is the
    // one thing that goes to the owner rather than being quietly fixed.
    if (taken.length > 0 && run.outcome === "completed" && value.output) {
      outcomesOf(work).verdicts = readVerdicts(extractJson<unknown>(value.output), taken);
    }

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
   * than builds. The answer is said in every place `repliesOn` names, and
   * nowhere else: a chat thread, the review thread on the forge, the ticket.
   * A place the setting names that this install does not mount is refused by
   * name, because an answer nobody can read is worse than a boot that failed.
   */
  "reply-thread": async (scope, work, effect) => {
    const text = effect.text?.trim();
    if (!text) return;
    const ticket = work.observation.ticket;
    const answer = `${effect.threadId}: ${text}`;
    for (const place of repliesOnIn(scope.config.repliesOn)) {
      if (place === "code-host") {
        await scope.ports["code-host"].replyToReviewThread(effect.threadId, text);
        continue;
      }
      if (place === "conversation") {
        const chat = scope.ports.conversation;
        if (!chat) {
          throw new Error(`\`repliesOn\` names \`conversation\`, and nothing mounts it; mount a chat plugin, or take it out of \`repliesOn\``);
        }
        const thread = await chat.open(unitOf(work.record), ticket.title);
        await chat.post(thread, { text: answer });
        continue;
      }
      await scope.ports.tracker.comment(ticket.id, answer);
    }
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
      if (write.type === "escalate") {
        outcomes.escalation = {
          reason: write.reason,
          askedAt: scope.ctx.now().toISOString(),
          ...(write.threadIds.length ? { threadIds: [...write.threadIds] } : {}),
        };
      }
    }
  },
};

/**
 * The branch this round commits to.
 *
 * The tracker's branch until there is a pull request; the pull request's own
 * afterwards, which is not always the same one — an operator opening it by
 * hand names the branch themselves, and a fix pushed to the tracker's branch
 * would never reach the pull request the review is reading. A round after the
 * review has a pull request the observation does not read (a look while
 * implementing asks the forge nothing), so the branch is asked of the forge
 * here, once, by the ticket the pull request is titled with.
 */
async function theBranchTheWorkIsOn(scope: Scope, ticket: Ticket): Promise<string> {
  const pull = await scope.ports["code-host"].findPullRequestMentioning?.(ticket.repo, ticket.id);
  return pull?.headBranch ?? branchOf(ticket);
}

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
/** The states where the machine itself will open the pull request, so nothing is searched for. */
const MACHINE_OPENS_IT: readonly TicketRecord["state"][] = ["READY", "IMPLEMENTING", "checks", "verdict"];

async function pullRequestFor(scope: Scope, ticket: Ticket, state: TicketRecord["state"]): Promise<PullRequestView | null> {
  const host = scope.ports["code-host"];
  const byBranch = await host.findPullRequest(ticket.repo, branchOf(ticket));
  if (byBranch) return byBranch;
  // A ticket nobody has started is looked for by the id it mentions: a pull
  // request already open for it is taken up at its review rather than opened
  // again. Once the machine is the one that will open it, searching would
  // adopt somebody else's work.
  //
  // With the writes handed to the operator the machine never opens it at all,
  // and the one they opened — from whatever branch they chose — is the only
  // one there is: searching is the whole lookup, in every state.
  if (scope.policy.writes === "operator") {
    return (await host.findPullRequestMentioning?.(ticket.repo, ticket.id)) ?? null;
  }
  if (MACHINE_OPENS_IT.includes(state) || state === "PR_OPEN") return null;
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
  const places = repliesOnIn(scope.config.repliesOn);
  const awaitingAnswer = current.state === "CLARIFYING" && Boolean(current.triage);
  const awaitingOwner = Boolean(current.escalation && !current.escalation.resolvedAt);
  // A review is where the owner's own word is new work too, read from the last
  // word acted on rather than from the beginning of time, and only from the
  // places `repliesOn` names: a machine that answers on the forge and reads the
  // tracker is told which of the two it does, not guessed at.
  if (!awaitingAnswer && !awaitingOwner) {
    return { conversation: await wordAtAReview(scope, current, ticket, places), escalationAnswered: false };
  }
  return waitingOnADecision(scope, current, ticket, places, { answer: awaitingAnswer, owner: awaitingOwner });
}

/** The later of two instants, ignoring the one that is not there. */
function later(one: string | undefined, other: string | undefined): string | undefined {
  if (one === undefined) return other;
  if (other === undefined) return one;
  return new Date(one).getTime() >= new Date(other).getTime() ? one : other;
}

/** What the owner said at a review, from the places replies come from. */
async function wordAtAReview(scope: Scope, current: TicketRecord, ticket: Ticket, places: readonly ReplyPlace[]): Promise<Said[]> {
  if (!REVIEWING_STATES.includes(current.state)) return [];
  // A word the work was built from is not new work: the triage's own read of
  // the answer is the moment it stopped being news, so nothing said before it
  // counts again here — a chat keeps every message, and reading yesterday's
  // answer as today's review would send the round back for ever.
  const since = later(current.ownerWord?.at, current.triage?.at) ?? BEFORE_ANY_WORD;
  const said: Said[] = [];
  if (places.includes("conversation") && scope.ports.conversation) {
    said.push(...(await repliesFor(scope.ports.conversation, unitOf(current), since)));
  }
  if (places.includes("tracker")) said.push(...(await scope.ports.tracker.comments(ticket.id, since)));
  // A button carries the question it answered, so a press is never the word at
  // a review: a chat replays its own asks with their buttons, and reading one
  // as new work sends the round back to the step that asked for ever. And the
  // same sentence written in two places is one word: an install that answers in
  // a chat and on the ticket must not count one remark twice and climb a rung
  // for a round it never had.
  const words = new Map<string, Said>();
  for (const reply of said) {
    if (reply.answer) continue;
    words.set(reply.body.trim(), reply);
  }
  return [...words.values()];
}

/** A wait on a question or an escalation, read only where replies come from. */
async function waitingOnADecision(
  scope: Scope,
  current: TicketRecord,
  ticket: Ticket,
  places: readonly ReplyPlace[],
  awaiting: { answer: boolean; owner: boolean },
): Promise<Pick<Observation, "conversation" | "escalationAnswered">> {
  const { tracker } = scope.ports;
  const since = awaiting.answer ? current.triage!.at : current.escalation!.askedAt;
  const said = await saidSince(scope, unitOf(current), ticket, since);
  // A button carries the question it answered. A press from an earlier wait
  // is evidence for that earlier question, never an escalation decision.
  const relevant = said?.filter((reply) => !reply.answer || (awaiting.answer && current.triage!.askedQuestions.includes(reply.answer.ask)));
  const escalationAnswered = awaiting.owner && (relevant
    ? decided(relevant, scope.policy)
    : places.includes("tracker") && (await tracker.hasReplyAfter(ticket.id, since)));
  // The ticket's comments are read once there is an answer in them, not on
  // every poll of a wait: the owner's words are what the resumed step acts on.
  const resumed = relevant ?? (awaiting.answer || escalationAnswered
    ? (places.includes("tracker") ? await tracker.comments(ticket.id, since) : [])
    : []);
  return { conversation: resumed, escalationAnswered };
}

/**
 * The instant before anything was said.
 *
 * A record that has not acted on a word yet has no `at` to read from, and a
 * chat port asks for one: reading from before the first message is what "from
 * the beginning" means to a port that only speaks in instants.
 */
const BEFORE_ANY_WORD = "1970-01-01T00:00:00.000Z";

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
  const places = repliesOnIn(scope.config.repliesOn);
  if (places.includes("conversation") && scope.ports.conversation) {
    return repliesFor(scope.ports.conversation, unit, since);
  }
  if (!places.includes("tracker") || scope.policy.writes !== "operator") return null;
  return (await scope.ports.tracker.comments(ticket.id, since)).map((comment) => ({ ...comment, fromAmy: false }));
}

/**
 * Whether the ticket already sits in QA, and — at the handoff, for a ticket
 * in several repositories — whether each one merged.
 */
async function whereItStands(scope: Scope, ticket: Ticket, state: TicketRecord["state"]) {
  // An install that named the tickets it works does not work the others: a
  // record already under way is settled where it stands rather than driven on.
  const only = (scope.config.onlyTickets ?? []) as readonly string[];
  const outsideTheList = only.length > 0 && !only.includes(ticket.id);
  return {
    retired: outsideTheList || !(ticket.repos ?? [ticket.repo]).includes(ticket.repo),
    ...(outsideTheList ? { retiredBecause: `${ticket.id} is not one of the tickets this install works` } : {}),
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
    const on = thread?.path ? ` on ${thread.path}` : "";
    const about = thread ? ` (${thread.body.split("\n")[0]})` : "";
    // The id is what the operator closes it by, and the one thing that names
    // the thread even when the forge's view of the pull request is not to hand.
    return `Resolve the review thread ${write.threadId}${on} in ${pr?.url ?? ticket.repo}: the change answered it.${about}`;
  },
  "assign-reviewer": (write, { ticket, pr }) => `Request a review of ${pr?.url ?? ticket.id} from ${write.host}.`,
  "request-rereview": (write, { ticket, pr }) => `Ask ${write.host} to review ${pr?.url ?? ticket.id} again: every comment is addressed.`,
  "hand-off-to-qa": (write, { ticket, qaStatusName }) => `Move ${ticket.id} to ${qaStatusName} and assign it to ${write.tracker}: ${ticket.url}`,
};

/**
 * The states where no pull request is looked for by title.
 *
 * The tracker's own branch is still read: a machine that opened the pull
 * request itself finds it there. `verdict` is not one of these — its first
 * round runs before there is a pull request, but every later one runs after a
 * round the review sent back, and that round publishes to a pull request that
 * already exists.
 */

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
