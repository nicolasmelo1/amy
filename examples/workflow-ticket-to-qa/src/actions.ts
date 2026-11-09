import {
  ActionContext,
  AgentRun,
  baseBranchFor,
  Conversation,
  FoundWork,
  Moved,
  renderBrief,
  sayToOperator,
  ProgressPolicy,
  PullRequestView,
  WorkflowActionScope,
  WorkflowPieceContext,
  parseBudget,
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
} from "./agent-steps.js";
import { Effect, WRITE_EFFECTS, WriteEffect } from "./effects.js";
import { Observation, Policy, Said } from "./observation.js";
import { decided, decisionLines } from "./discussion.js";
import { EffectOutcomes, applyOutcomes, applyTransition } from "./outcomes.js";
import type { configSchema, needs } from "./plugin.js";
import { loadRoster } from "./roster.js";
import { TicketRecord } from "./record.js";
import { Ticket, pullRequestTitle } from "./ticket.js";

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

/** The part of `Git` this workflow drives, for a test that hands a fake rather than a git. */
export type TicketGit = Pick<Git, "pathFor" | "acquire" | "prepareBranch" | "commitAndPush" | "headSha">;

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
  return (await scope.ports.tracker.inProgress()).flatMap((ticket) => {
    const priority = ticket.priority === undefined ? {} : { priority: ticket.priority };
    if ((ticket.repos?.length ?? 0) > 1) requireMergeLookup(scope, ticket);
    return (ticket.repos ?? [ticket.repo]).map((repo) => ({
      workId: repo === ticket.repo ? ticket.id : workIdFor(ticket.id, repo),
      ...priority,
    }));
  });
}

export async function observe(scope: Scope, current: TicketRecord): Promise<Observation> {
  const ticket = await requireTicketWithBrief(scope, current.id);
  // A ticket whose tracker derived no branch is refused here, on its
  // first look, before any branch is prepared for it.
  const pullRequest = await pullRequestFor(scope, ticket, current.state);

  // Only fetched where it is used, so a poll that is only waiting for a
  // review does not hammer the code host counting everybody's workload.
  const reviewLoad =
    current.state === "REVIEWER_ASSIGNED"
      ? await scope.ports["code-host"].reviewLoad(scope.config.repos)
      : {};

  return {
    ticket,
    pullRequest,
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
  _decision: unknown,
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

  return toTheChecks(applyTransition(applyOutcomes(current, settled), moved), observation, moved);
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

const ACTIONS: TicketActions = {
  "triage": async (scope, work, effect) => {
    const ticket = work.observation.ticket;
    const at = scope.ctx.now().toISOString();
    const { value, run } = await judgeStep(scope.ports.agent, {
      prompt: triagePrompt(ticket, effect.conversation),
      cwd: await scope.checkouts.git.acquire(ticket.repo, work.record.id),
      context: { workId: work.record.id, step: "triage" },
      read: (answer) => readTriage(answer, at),
      fallback: unreadTriage(at),
    });
    refuseAnIncompleteRun("triage", run);
    outcomesOf(work).triage = value;
    if (effect.conversation?.length) outcomesOf(work).clarification = effect.conversation;
  },

  "ask-question": async (scope, work, effect) => {
    const { conversation, tracker, brief } = scope.ports;
    if (conversation) {
      const thread = await conversation.open(work.record.id, work.observation.ticket.title);
      await conversation.post(thread, { text: effect.questions.map((question) => `- ${question}`).join("\n") });
    } else {
      await tracker.comment(
        work.observation.ticket.id,
        effect.questions.map((question) => `- ${question}`).join("\n"),
      );
    }
    await scope.announce(`${work.record.id} needs an answer before I can start.`);

    // The same question, appended to the brief it is about, with this
    // ticket's id and the time — the one channel a later sibling reads.
    // Nothing appends an answer: deciding the question is the owning
    // workflow's revision, never this workflow's write.
    const briefId = work.observation.ticket.briefId;
    if (briefId && brief) {
      for (const question of effect.questions) {
        await brief.appendQuestion({
          id: briefId,
          question: { workId: work.record.id, question, at: scope.ctx.now().toISOString() },
          at: scope.ctx.now().toISOString(),
        });
      }
    }
  },

  "implement": async (scope, work, effect) => {
    const { git } = scope.checkouts;
    const ticket = work.observation.ticket;
    const branch = branchOf(ticket);
    await git.prepareBranch(ticket.repo, branch, work.record.id);
    const { value, run } = await implementStep(scope.ports.agent, {
      prompt: implementPrompt(
        ticket,
        effect.retryContext,
        effect.continuationContext,
        effect.conversation,
        effect.discussion,
      ),
      cwd: await git.acquire(ticket.repo, work.record.id),
      context: { workId: work.record.id, step: "implement" },
      commit: () => git.commitAndPush(ticket.repo, branch, `${ticket.id}: ${ticket.title}`, work.record.id),
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
      prompt: threadPrompt(ticket, threads, effect.from, scope.config.reviewerHints as ReviewerHints, effect.discussion),
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
      throw new Error(`${work.record.id} has a discussion to answer and no conversation is mounted to answer it in`);
    }
    // Without a worktree the checkout is shared, and another ticket may have
    // moved it while this one waited: the work's own branch is put back
    // first, the way every step that reads the work's code does.
    await git.prepareBranch(ticket.repo, work.observation.pullRequest?.headBranch ?? branchOf(ticket), work.record.id);
    const reply = await scope.ports.agent.ask(
      discussPrompt(ticket, effect.about, effect.thread, effect.turns, {
        clarification: effect.clarification,
        threads: (work.observation.pullRequest?.threads ?? []).filter((thread) => effect.threadIds?.includes(thread.id)),
      }),
      await git.acquire(ticket.repo, work.record.id),
      { workId: work.record.id, step: "discuss", brief: ticket.brief, readOnly: true },
    );
    refuseAnIncompleteRun("discuss", reply.run);
    const thread = await conversation.open(work.record.id, ticket.title);
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

    await scope.announce(`${work.record.id} is parked, ${followUpTicketId} has the details.`);
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
        workId: work.record.id,
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
 * A ticket in several repositories is one work item per repository, and
 * the id says which: `PROJ-1@owner/name`. Every tracker call still uses the
 * ticket's own id; only the repository the work happens in changes.
 */
async function requireTicket(scope: Scope, workId: string): Promise<Ticket> {
  const { ticketId, repo } = splitWorkId(workId);
  const found = await scope.ports.tracker.get(ticketId);
  if (!found) {
    throw new Error(`${ticketId} is not in the tracker any more`);
  }
  // The tracker's membership is kept before the repository is overridden:
  // a ticket whose last label went is back in its team's repository alone,
  // and an item for another repository must still see that it left.
  return repo ? { ...found, repo, repos: found.repos ?? [found.repo] } : found;
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
async function requireTicketWithBrief(scope: Scope, workId: string): Promise<Ticket> {
  const ticket = await requireTicket(scope, workId);
  const briefs = scope.ports.brief;
  if (!ticket.briefId || !briefs) return ticket;

  const record = await briefs.get(ticket.briefId);
  if (!record) return ticket;

  return { ...ticket, brief: renderBrief(record).text };
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
  if (!awaitingAnswer && !awaitingOwner) return { conversation: [], escalationAnswered: false };

  const since = awaitingAnswer ? current.triage!.at : current.escalation!.askedAt;
  const said = await saidSince(scope, current.id, ticket, since);
  const escalationAnswered = awaitingOwner && (said ? decided(said, scope.policy) : await tracker.hasReplyAfter(ticket.id, since));
  // The ticket's comments are read once there is an answer in them, not on
  // every poll of a wait: the owner's words are what the resumed step acts on.
  return {
    conversation: said ?? (awaitingAnswer || escalationAnswered ? await tracker.comments(ticket.id, since) : []),
    escalationAnswered,
  };
}

/**
 * Everything said back since a turn, where only the operator can have
 * said it: the work's thread, or — with the writes handed over — the
 * ticket. Null where the machine comments on the ticket too, and the
 * tracker's own reading of who wrote what is the one to trust.
 */
async function saidSince(scope: Scope, workId: string, ticket: Ticket, since: string): Promise<Said[] | null> {
  if (scope.ports.conversation) return repliesFor(scope.ports.conversation, workId, ticket.title, since);
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
    [`${ticket.id} needs an answer before I can start. Answer ${where}:`, ...write.questions.map((q) => `- ${q}`)].join("\n"),
  "escalate": (write, { ticket, where }) => `${ticket.id} needs your call, answer ${where}: ${write.reason}`,
  "open-pull-request": (_write, { ticket, base }) =>
    `Open a pull request for ${ticket.id} in ${ticket.repo}, from ${branchOf(ticket)} into ${base}, titled "${pullRequestTitle(ticket)}". I carry on once I see it.`,
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

function repliesFor(conversation: Conversation, workId: string, title: string, since: string): Promise<Said[]> {
  return conversation.open(workId, title).then((thread) => conversation.replies(thread, since)).then((replies) =>
    replies.map((reply) => ({
      author: reply.author,
      body: [reply.text, ...reply.files.map((file) => `Attachment: ${file}`)].filter(Boolean).join("\n"),
      at: reply.at,
      fromAmy: false,
      ...(reply.kind ? { kind: reply.kind } : {}),
    })),
  );
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
