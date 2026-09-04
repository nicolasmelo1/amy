import {
  ActionContext,
  ActionHandler,
  AgentRun,
  Event,
  EventKind,
  EventLog,
  Notifier,
  Plan,
  WorkflowRuntime,
} from "@amy/core";
import { Agent } from "./ports/Agent.js";
import { CodeHost } from "./ports/CodeHost.js";
import { Gate } from "./ports/Gate.js";
import { Tracker } from "./ports/Tracker.js";
import { Effect } from "./effects.js";
import { Observation, Policy } from "./observation.js";
import { EffectOutcomes, applyTicketPlan } from "./outcomes.js";
import { Roster } from "./roster.js";
import { TicketRecord, newRecord } from "./record.js";
import { Ticket, pullRequestTitle } from "./ticket.js";

export interface TicketRuntimeConfig {
  /** Every repository review load is counted across. */
  repos: readonly string[];
  /** The status a ticket moves to when it is handed to QA. */
  qaStatusName: string;
}

export interface TicketRuntimeDeps {
  tracker: Tracker;
  host: CodeHost;
  agent: Agent;
  gate: Gate;
  notifier: Notifier;
  roster: () => Roster;
  now: () => Date;
  config: TicketRuntimeConfig;
  policy: Policy;
  /** Optional, so a runtime with no log still runs. */
  log?: EventLog;
}

type Context = ActionContext<TicketRecord, Observation>;

/** Exhaustive over this workflow's actions, checked at compile time. */
type TicketHandlers = {
  [K in Effect["type"]]: (effect: Extract<Effect, { type: K }>, ctx: Context) => Promise<void>;
};

/**
 * How this workflow's actions run: what the world looks like before a
 * decision, what each action does, and how the result folds back in.
 *
 * It lived inside the engine, and that is what made the engine drive exactly
 * one workflow. Everything here names a ticket, a pull request or a reviewer,
 * so it belongs on this side of the boundary; what stayed behind is a queue,
 * a budget, a retry count and a stop switch, which name nothing.
 */
export function ticketRuntime(
  deps: TicketRuntimeDeps,
): WorkflowRuntime<TicketRecord, Observation> {
  /**
   * Appends to the log if there is one, and shrugs if it throws.
   *
   * A full disk under `.amy/log` must not cost a ticket a move, which is the
   * engine's promise as much as this one's. It says nothing when it fails, on
   * purpose: the engine writes several lines per tick through its own
   * forgiving path and complains once. Complaining here too would be two
   * voices for one outage.
   */
  const record = (kind: EventKind, rest: Omit<Event, "at" | "kind"> = {}): void => {
    try {
      deps.log?.append({ at: deps.now().toISOString(), kind, ...rest });
    } catch {
      // See above: the engine is what tells the operator.
    }
  };

  /**
   * Says something to the operator, and never lets that cost a ticket.
   *
   * Swallowed for the same reason the engine swallows it: nothing downstream
   * reads a notification, so its failure cannot make a saved record a lie.
   * The tracker, the code host, the agent and the gate are deliberately not
   * wrapped — see `plans/the-engine-fails-out-loud.md`.
   */
  const announce = async (text: string, ctx: Context): Promise<void> => {
    try {
      await deps.notifier.announce({ text, workId: ctx.record.id, state: ctx.record.state });
    } catch (error) {
      record("notify.failed", {
        workId: ctx.record.id,
        state: ctx.record.state,
        detail: { error: error instanceof Error ? error.message : String(error), text },
      });
    }
  };

  /**
   * Writes down what an agent run took.
   *
   * Every field the relay and the budget will need is here, and `costSource`
   * says whether the money figure was measured or worked out, so nothing
   * downstream has to guess which.
   */
  const recordAgentRun = (ctx: Context, run: AgentRun): void => {
    record("agent.run", {
      workId: ctx.record.id,
      state: ctx.record.state,
      detail: {
        harness: run.harness,
        model: run.model,
        outcome: run.outcome,
        durationMs: run.durationMs,
        costSource: run.costSource,
        ...(run.costUsd === undefined ? {} : { costUsd: run.costUsd }),
        ...(run.tokens === undefined ? {} : { tokens: { ...run.tokens } }),
      },
    });
  };

  const requireTicket = async (workId: string): Promise<Ticket> => {
    const found = await deps.tracker.get(workId);
    if (!found) {
      throw new Error(`${workId} is not in the tracker any more`);
    }
    return found;
  };

  const requestReview = async (ctx: Context, host: string): Promise<void> => {
    const number = ctx.observation.pullRequest?.number ?? ctx.record.pullRequestNumber;
    if (number === undefined) {
      throw new Error(`${ctx.record.id} has no pull request to request a review on`);
    }
    await deps.host.requestReview(ctx.observation.ticket.repo, number, host);
  };

  /** The outcomes bag, typed at the one boundary that knows what is in it. */
  const outcomesOf = (ctx: Context): EffectOutcomes => ctx.outcomes as EffectOutcomes;

  const handlers: TicketHandlers = {
    "triage": async (_effect, ctx) => {
      const { value, run } = await deps.agent.triage(ctx.observation.ticket);
      recordAgentRun(ctx, run);
      refuseAnIncompleteRun("triage", run);
      outcomesOf(ctx).triage = value;
    },

    "ask-question": async (effect, ctx) => {
      await deps.tracker.comment(
        ctx.observation.ticket.id,
        effect.questions.map((question) => `- ${question}`).join("\n"),
      );
      await announce(`${ctx.record.id} needs an answer before I can start.`, ctx);
    },

    "implement": async (effect, ctx) => {
      const { value, run } = await deps.agent.implement(
        ctx.observation.ticket,
        effect.retryContext,
      );
      recordAgentRun(ctx, run);
      outcomesOf(ctx).implementation = value;
    },

    "run-gate": async (_effect, ctx) => {
      outcomesOf(ctx).gate = await deps.gate.run(ctx.observation.ticket);
    },

    "open-pull-request": async (_effect, ctx) => {
      outcomesOf(ctx).pullRequestNumber = await deps.host.openPullRequest({
        repo: ctx.observation.ticket.repo,
        branch: ctx.observation.ticket.branchName,
        title: pullRequestTitle(ctx.observation.ticket),
        // Empty by convention. The ticket is the description.
        body: "",
      });
    },

    "address-threads": async (effect, ctx) => {
      const threads = (ctx.observation.pullRequest?.threads ?? []).filter((thread) =>
        effect.threadIds.includes(thread.id),
      );
      const { value, run } = await deps.agent.addressThreads(
        ctx.observation.ticket,
        threads,
        effect.from,
      );
      recordAgentRun(ctx, run);
      refuseAnIncompleteRun("address-threads", run);
      outcomesOf(ctx).verdicts = value;
    },

    "assign-reviewer": async (effect, ctx) => {
      await requestReview(ctx, effect.host);
      outcomesOf(ctx).reviewer = effect.host;
    },

    "request-rereview": async (effect, ctx) => {
      await requestReview(ctx, effect.host);
    },

    "escalate": async (effect, ctx) => {
      const followUpTicketId = await deps.tracker.createFollowUp({
        parentTicketId: ctx.observation.ticket.id,
        title: `FUP ${ctx.observation.ticket.id}: review comments need a decision`,
        body: effect.reason,
      });

      outcomesOf(ctx).escalation = {
        reason: effect.reason,
        askedAt: deps.now().toISOString(),
        followUpTicketId,
      };

      await announce(`${ctx.record.id} is parked, ${followUpTicketId} has the details.`, ctx);
    },

    "hand-off-to-qa": async (effect, ctx) => {
      await deps.tracker.setStatus(ctx.observation.ticket.id, deps.config.qaStatusName);
      await deps.tracker.assign(ctx.observation.ticket.id, effect.tracker);
    },

    "announce": async (effect, ctx) => {
      await announce(effect.text, ctx);
    },
  };

  return {
    policy: deps.policy,

    async found() {
      return (await deps.tracker.inProgress()).map((ticket) => ticket.id);
    },

    newRecord,

    async observe(current) {
      const ticket = await requireTicket(current.id);
      const pullRequest = await deps.host.findPullRequest(ticket.repo, ticket.branchName);

      // Only fetched where it is used, so a poll that is only waiting for a
      // review does not hammer the code host counting everybody's workload.
      const reviewLoad =
        current.state === "REVIEWER_ASSIGNED"
          ? await deps.host.reviewLoad(deps.config.repos)
          : {};

      const awaitingAnswer = current.triage && !current.triage.clear;
      const awaitingOwner = current.escalation && !current.escalation.resolvedAt;

      return {
        ticket,
        pullRequest,
        reviewLoad,
        roster: deps.roster(),
        questionAnswered: awaitingAnswer
          ? await deps.tracker.hasReplyAfter(ticket.id, current.triage!.at)
          : false,
        escalationAnswered: awaitingOwner
          ? await deps.tracker.hasReplyAfter(ticket.id, current.escalation!.askedAt)
          : false,
        now: deps.now(),
      };
    },

    handlers() {
      // The cast is the boundary. Inside this file the map is exhaustive over
      // `Effect` and each handler takes exactly its own payload, which is
      // what makes a new action fail to compile until something runs it. The
      // engine cannot know that union, and only ever hands back an action it
      // was given by the very plan that typed it.
      return Object.fromEntries(
        Object.entries(handlers).map(([name, handler]) => [
          name,
          handler as ActionHandler<TicketRecord, Observation>,
        ]),
      );
    },

    apply(current, plan: Plan, outcomes, observation, now) {
      const folded = outcomes as EffectOutcomes;

      // The owner's answer to an escalation arrives as an observation rather
      // than as the result of an action — the move it unblocks carries no
      // action at all — so it is folded here rather than by a handler.
      const settled =
        current.escalation && !current.escalation.resolvedAt && observation.escalationAnswered
          ? { ...folded, escalationResolvedAt: now.toISOString() }
          : folded;

      return applyTicketPlan(current, plan, settled, now);
    },
  };
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
