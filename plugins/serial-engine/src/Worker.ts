import {
  AgentRun,
  Budget,
  Event,
  EventKind,
  EventLog,
  Notifier,
  Plan,
  Queue,
  QueueItem,
  StopSwitch,
  Store,
  actionsOf,
  dispatchesTo,
  CORE_ACTIONS,
} from "@amy/core";
import {
  Agent,
  CodeHost,
  Effect,
  EffectOutcomes,
  Gate,
  Observation,
  Policy,
  Roster,
  Ticket,
  TicketRecord,
  TicketState,
  Tracker,
  applyTicketPlan,
  newRecord,
  plan,
  pullRequestTitle,
} from "@amy/workflow-ticket-to-qa";

export interface WorkerConfig {
  /** Every repository the team reviews in, for counting review load. */
  repos: readonly string[];
  /** The status a ticket moves to when it is handed to QA. */
  qaStatusName: string;
  policy: Policy;
  /** How long a claimed item may sit before it is treated as abandoned. */
  staleClaimMs: number;
  /** How long finished queue items are kept before being pruned. */
  retentionDays: number;
  /** How many times one ticket may fail before the machine gives up on it. */
  maxItemAttempts: number;
}

export interface WorkerDeps {
  queue: Queue;
  records: Store<TicketRecord>;
  tracker: Tracker;
  host: CodeHost;
  agent: Agent;
  gate: Gate;
  notifier: Notifier;
  roster: () => Roster;
  now: () => Date;
  config: WorkerConfig;
  /** Optional, so an engine with no log still runs. */
  log?: EventLog;
  /** Optional, so an engine with no handbrake still runs. */
  stop?: StopSwitch;
  /** Optional, so an engine with no ceiling on spending still runs. */
  budget?: Budget;
  /**
   * The workflow to drive. Defaults to the one this engine was written for,
   * but taking it here is what lets another workflow be mounted instead of
   * forked, and what lets a test drive a plan this one never emits.
   */
  decide?: typeof plan;
}

interface ActionContext {
  ticket: Ticket;
  observation: Observation;
  record: TicketRecord;
  outcomes: EffectOutcomes;
}

/** Exhaustive over the workflow's actions, checked at compile time. */
type ActionHandlers = {
  [K in Effect["type"]]: (
    effect: Extract<Effect, { type: K }>,
    ctx: ActionContext,
  ) => Promise<void>;
};

/** The one result the budget produces, named so the check can return it. */
export type Parked = Extract<TickResult, { kind: "parked" }>;

export type TickResult =
  | { kind: "idle" }
  | { kind: "stopped"; reason: string }
  | {
      kind: "worked";
      workId: string;
      from: TicketState;
      to: TicketState;
      plan: Plan["kind"];
      why: string;
      /** Set when the plan asked to be looked at again later. */
      retryAfterMs?: number;
    }
  | { kind: "failed"; workId: string; state: TicketState; error: string }
  /** The move would have spent an agent, and the budget said not yet. */
  | {
      kind: "parked";
      workId: string;
      state: TicketState;
      reason: string;
      retryAfterMs: number;
    };

/**
 * Advances at most one ticket by at most one move, then chains the next look.
 *
 * Nothing here decides *when* the next step runs. A step that takes a minute
 * and a step that takes an hour both enqueue their successor the moment they
 * finish, so the queue is the schedule.
 */
export class Worker {
  constructor(private readonly deps: WorkerDeps) {}

  /** Puts every ticket in the working status onto the queue. */
  async discover(): Promise<string[]> {
    const now = this.deps.now();
    const enqueued: string[] = [];

    for (const ticket of await this.deps.tracker.inProgress()) {
      const existing = this.deps.records.load(ticket.id);
      if (existing && existing.state === "DONE") continue;
      if (this.deps.queue.pending().some((i) => i.workId === ticket.id)) continue;

      this.deps.queue.enqueue({ workId: ticket.id, reason: "found in the working status" }, now);
      enqueued.push(ticket.id);
    }

    return enqueued;
  }

  async tick(): Promise<TickResult> {
    const now = this.deps.now();

    // Asked before anything is claimed, so a stop cannot be overtaken by one
    // more piece of work sneaking onto the queue.
    const halted = this.halted();
    if (halted) return halted;

    this.deps.queue.recover(this.deps.config.staleClaimMs, now);

    const item = this.deps.queue.claim(now);
    if (!item) {
      this.record("run.idle");
      return { kind: "idle" };
    }

    this.record("run.claimed", { workId: item.workId, detail: { reason: item.reason } });

    const record = this.deps.records.load(item.workId) ?? newRecord(item.workId, now);

    try {
      return await this.advance(item, record, now);
    } catch (error) {
      return await this.recordFailure(item, record, error);
    }
  }

  private async advance(
    item: QueueItem,
    record: TicketRecord,
    now: Date,
  ): Promise<TickResult> {
    const observation = await this.observe(record);
    const decide = this.deps.decide ?? plan;
    const decision = decide(record, observation, this.deps.config.policy);

    this.record("work.planned", {
      workId: item.workId,
      state: record.state,
      detail: { plan: decision.kind, why: decision.why },
    });

    if (decision.kind === "settled") {
      this.record("work.settled", { workId: item.workId, state: record.state });
      // A terminal state reached after a fall *is* the work carrying on from
      // where it was, so it is worth the same one warning.
      await this.announceRecovery(item, record.state);
      this.deps.queue.complete(item);
      this.maybePrune(now);
      return {
        kind: "worked",
        workId: item.workId,
        from: record.state,
        to: record.state,
        plan: "settled",
        why: decision.why,
      };
    }

    const effects = actionsOf(decision) as Effect[];

    const parked = this.parked(record, effects, now);
    if (parked) {
      this.deps.queue.enqueue(
        {
          workId: item.workId,
          reason: parked.reason,
          delayMs: parked.retryAfterMs,
          // Carried, not dropped. Without it the queue writes 0, and a park
          // would hand back a retry budget the failures had already spent.
          attempt: item.attempt,
        },
        now,
      );
      this.deps.queue.complete(item);
      this.maybePrune(now);
      return parked;
    }

    const outcomes = await this.execute(observation, record, effects);
    const next = applyTicketPlan(record, decision, outcomes, now);
    this.deps.records.save(next);

    this.deps.queue.enqueue(
      {
        workId: item.workId,
        reason: decision.why,
        delayMs: decision.kind === "wait" ? decision.retryAfterMs : 0,
      },
      now,
    );

    this.deps.queue.complete(item);
    this.maybePrune(now);

    this.record(decision.kind === "wait" ? "work.waiting" : "work.advanced", {
      workId: item.workId,
      state: next.state,
      detail: { from: record.state, why: decision.why },
    });

    await this.announceRecovery(item, next.state);

    return {
      kind: "worked",
      workId: item.workId,
      from: record.state,
      to: next.state,
      plan: decision.kind,
      why: decision.why,
      retryAfterMs: decision.kind === "wait" ? decision.retryAfterMs : undefined,
    };
  }

  /**
   * A budget refusal, when this move would spend an agent and the ceiling is
   * already reached.
   *
   * The record is deliberately not saved: the ticket keeps its state and its
   * per-state attempt count, and only its next look moves. Parked, not lost.
   * The queue item's own attempt count is carried by the caller, which is a
   * different counter and has to be said, not assumed.
   */
  private parked(record: TicketRecord, effects: readonly Effect[], now: Date): Parked | null {
    if (!this.deps.budget) return null;

    const spending = effects.filter((e) => dispatchesTo(e.type, "agent")).map((e) => e.type);
    if (spending.length === 0) return null;

    const decision = this.deps.budget.mayStart(now);
    if (decision.ok) return null;

    this.record("budget.parked", {
      workId: record.id,
      state: record.state,
      detail: {
        window: decision.window,
        measure: decision.measure,
        used: decision.used,
        limit: decision.limit,
        stopAt: decision.stopAt,
        retryAfterMs: decision.retryAfterMs,
        pending: spending,
      },
    });

    return {
      kind: "parked",
      workId: record.id,
      state: record.state,
      reason: decision.reason,
      retryAfterMs: decision.retryAfterMs,
    };
  }

  private async recordFailure(
    item: QueueItem,
    record: TicketRecord,
    error: unknown,
  ): Promise<TickResult> {
    const message = error instanceof Error ? error.message : String(error);
    const attempt = item.attempt + 1;
    const now = this.deps.now();

    this.record("work.failed", {
      workId: item.workId,
      state: record.state,
      detail: { attempt, error: message },
    });

    this.deps.queue.complete(item);

    // Routed through `announce`, not straight at the port. The item is
    // already completed by this point, so a single broken channel used to
    // throw past `tick()` and the ticket left the queue with no record of why.
    const notice = this.failureNotice(item, record, attempt, message);
    if (notice) await this.announce(notice, item.workId, record.state);

    if (attempt < this.deps.config.maxItemAttempts) {
      this.deps.queue.enqueue(
        {
          workId: item.workId,
          reason: `retrying after an error: ${message}`,
          delayMs: this.deps.config.policy.pollBackoffMs,
          attempt,
        },
        now,
      );
    }

    return { kind: "failed", workId: item.workId, state: record.state, error: message };
  }

  /**
   * What to say about a failure: one warning on the way down, silence in the
   * middle, one at the ceiling. `null` is the silence.
   *
   * The signal is `QueueItem.attempt`, which is durable, already crosses
   * processes, already counts consecutive failures of this work, and is
   * already zeroed by the event that means recovery. `amy tick` is a fresh
   * process every time, so a counter on the worker could not do this.
   *
   * The ceiling wins over the fall, so `maxItemAttempts: 1` produces one
   * warning rather than two. The guard is `item.attempt === 0` and not
   * `attempt === 1` because it reads as "this item had never failed before",
   * which is the condition that is actually true.
   */
  private failureNotice(
    item: QueueItem,
    record: TicketRecord,
    attempt: number,
    message: string,
  ): string | null {
    if (attempt >= this.deps.config.maxItemAttempts) {
      return `${item.workId} failed ${attempt} times in ${record.state}, I have given up, and it is off the queue: ${message}`;
    }

    if (item.attempt !== 0) return null;

    this.record("work.degraded", {
      workId: item.workId,
      state: record.state,
      detail: { attempt, error: message },
    });

    return `${item.workId} is failing in ${record.state} and I am retrying: ${message}`;
  }

  /**
   * One warning when the work moves again, and nothing at all if it never
   * stopped.
   *
   * There is deliberately no recovery after the ceiling. Past it the item
   * leaves the queue and the next one comes from `amy discover` at attempt
   * zero, so nothing carries the history. The ceiling warning already said
   * "I have stopped, come and look", and announcing a recovery there would
   * give the machine credit for a person's repair.
   */
  private async announceRecovery(item: QueueItem, state: TicketState): Promise<void> {
    if (item.attempt === 0) return;

    this.record("work.recovered", {
      workId: item.workId,
      state,
      detail: { afterAttempts: item.attempt },
    });

    await this.announce(
      `${item.workId} is moving again in ${state} after ${item.attempt} failed attempt(s).`,
      item.workId,
      state,
    );
  }

  private async observe(record: TicketRecord): Promise<Observation> {
    const ticket = await this.requireTicket(record.id);

    const pullRequest = await this.deps.host.findPullRequest(ticket.repo, ticket.branchName);

    // Only fetched where it is used, so a poll that is only waiting for a
    // review does not hammer the code host counting everybody's workload.
    const reviewLoad =
      record.state === "REVIEWER_ASSIGNED"
        ? await this.deps.host.reviewLoad(this.deps.config.repos)
        : {};

    const awaitingAnswer = record.triage && !record.triage.clear;
    const awaitingOwner = record.escalation && !record.escalation.resolvedAt;

    return {
      ticket,
      pullRequest,
      reviewLoad,
      roster: this.deps.roster(),
      questionAnswered: awaitingAnswer
        ? await this.deps.tracker.hasReplyAfter(ticket.id, record.triage!.at)
        : false,
      escalationAnswered: awaitingOwner
        ? await this.deps.tracker.hasReplyAfter(ticket.id, record.escalation!.askedAt)
        : false,
      now: this.deps.now(),
    };
  }

  private async requireTicket(workId: string): Promise<Ticket> {
    const ticket = await this.deps.tracker.get(workId);
    if (!ticket) {
      throw new Error(`${workId} is not in the tracker any more`);
    }
    return ticket;
  }

  /**
   * What one action needs to do its work, and where it records what happened.
   */
  private context(observation: Observation, record: TicketRecord, outcomes: EffectOutcomes) {
    return { ticket: observation.ticket, observation, record, outcomes };
  }

  /**
   * One handler per action, rather than one branch per action.
   *
   * Keyed on the action name and exhaustive over it, so a new action the
   * workflow can emit will not compile until something here runs it. That is
   * the same guarantee the switch this replaced gave, without putting every
   * action's argument shaping in one function.
   */
  private handlers(): ActionHandlers {
    const deps = this.deps;

    return {
      "triage": async (_effect, ctx) => {
        const { value, run } = await deps.agent.triage(ctx.ticket);
        this.recordAgentRun(ctx, run);
        refuseAnIncompleteRun("triage", run);
        ctx.outcomes.triage = value;
      },

      "ask-question": async (effect, ctx) => {
        await deps.tracker.comment(
          ctx.ticket.id,
          effect.questions.map((q) => `- ${q}`).join("\n"),
        );
        await this.announce(
          `${ctx.ticket.id} needs an answer before I can start.`,
          ctx.ticket.id,
          ctx.record.state,
        );
      },

      "implement": async (effect, ctx) => {
        const { value, run } = await deps.agent.implement(ctx.ticket, effect.retryContext);
        this.recordAgentRun(ctx, run);
        ctx.outcomes.implementation = value;
      },

      "run-gate": async (_effect, ctx) => {
        ctx.outcomes.gate = await deps.gate.run(ctx.ticket);
      },

      "open-pull-request": async (_effect, ctx) => {
        ctx.outcomes.pullRequestNumber = await deps.host.openPullRequest({
          repo: ctx.ticket.repo,
          branch: ctx.ticket.branchName,
          title: pullRequestTitle(ctx.ticket),
          // Empty by convention. The ticket is the description.
          body: "",
        });
      },

      "address-threads": async (effect, ctx) => {
        const threads = (ctx.observation.pullRequest?.threads ?? []).filter((t) =>
          effect.threadIds.includes(t.id),
        );
        const { value, run } = await deps.agent.addressThreads(ctx.ticket, threads, effect.from);
        this.recordAgentRun(ctx, run);
        refuseAnIncompleteRun("address-threads", run);
        ctx.outcomes.verdicts = value;
      },

      "assign-reviewer": async (effect, ctx) => {
        await this.requestReview(ctx.observation, ctx.record, effect.host);
        ctx.outcomes.reviewer = effect.host;
      },

      "request-rereview": async (effect, ctx) => {
        await this.requestReview(ctx.observation, ctx.record, effect.host);
      },

      "escalate": async (effect, ctx) => {
        const followUpTicketId = await deps.tracker.createFollowUp({
          parentTicketId: ctx.ticket.id,
          title: `FUP ${ctx.ticket.id}: review comments need a decision`,
          body: effect.reason,
        });

        ctx.outcomes.escalation = {
          reason: effect.reason,
          askedAt: deps.now().toISOString(),
          followUpTicketId,
        };

        await this.announce(
          `${ctx.ticket.id} is parked, ${followUpTicketId} has the details.`,
          ctx.ticket.id,
          ctx.record.state,
        );
      },

      "hand-off-to-qa": async (effect, ctx) => {
        await deps.tracker.setStatus(ctx.ticket.id, deps.config.qaStatusName);
        await deps.tracker.assign(ctx.ticket.id, effect.tracker);
      },

      "announce": async (effect, ctx) => {
        await this.announce(effect.text, ctx.ticket.id, ctx.record.state);
      },
    };
  }

  /**
   * Actions the workflow says it emits that this engine could not run.
   *
   * Either nothing handles the name, or the core says the action needs a port
   * this engine has not been given. Asked before a ticket is touched rather
   * than discovered halfway through one.
   */
  missingActions(usesActions: readonly string[]): string[] {
    const handlers = this.handlers() as Record<string, unknown>;
    const mounted: Record<string, boolean> = {
      agent: Boolean(this.deps.agent),
      tracker: Boolean(this.deps.tracker),
      "code-host": Boolean(this.deps.host),
      gate: Boolean(this.deps.gate),
      notifier: Boolean(this.deps.notifier),
    };

    return usesActions.filter((name) => {
      if (!handlers[name]) return true;
      const spec = CORE_ACTIONS[name];
      return spec !== undefined && !mounted[spec.port];
    });
  }

  private async execute(
    observation: Observation,
    record: TicketRecord,
    effects: readonly Effect[],
  ): Promise<EffectOutcomes> {
    const outcomes: EffectOutcomes = {};
    const ctx = this.context(observation, record, outcomes);
    const handlers = this.handlers();

    for (const effect of effects) {
      const handler = handlers[effect.type] as (e: Effect, c: typeof ctx) => Promise<void>;
      if (!handler) {
        throw new Error(`no handler is mounted for the action "${effect.type}"`);
      }

      // Between actions as well as between ticks, because a plan can carry
      // several and a stop should not have to wait for the last one.
      if (this.deps.stop?.isRequested()) {
        this.record("stop.enforced", {
          workId: record.id,
          state: record.state,
          detail: { pending: effect.type, reason: this.deps.stop.reason() },
        });
        break;
      }

      this.record("action.started", { workId: record.id, detail: { action: effect.type } });
      try {
        await handler(effect, ctx);
        this.record("action.finished", { workId: record.id, detail: { action: effect.type } });
      } catch (error) {
        this.record("action.failed", {
          workId: record.id,
          detail: {
            action: effect.type,
            error: error instanceof Error ? error.message : String(error),
          },
        });
        throw error;
      }
    }

    if (record.escalation && !record.escalation.resolvedAt && observation.escalationAnswered) {
      outcomes.escalationResolvedAt = this.deps.now().toISOString();
    }

    return outcomes;
  }

  private async requestReview(
    observation: Observation,
    record: TicketRecord,
    host: string,
  ): Promise<void> {
    const number = observation.pullRequest?.number ?? record.pullRequestNumber;
    if (number === undefined) {
      throw new Error(`${record.id} has no pull request to request a review on`);
    }
    await this.deps.host.requestReview(observation.ticket.repo, number, host);
  }

  /**
   * Says something to the operator, and never lets that cost a ticket.
   *
   * A port call may only be swallowed when its failure does not make the
   * saved record a lie, and this is the one that qualifies: nothing
   * downstream reads a notification. The tracker, the code host, the agent
   * and the gate are all deliberately not wrapped — see
   * `plans/the-engine-fails-out-loud.md`.
   *
   * It lives here rather than only in the fan-out because `notifier` is a
   * port and an install may mount something else behind it. The promise is
   * the engine's, not the mounted plugin's.
   */
  private async announce(text: string, workId: string, state: TicketState): Promise<void> {
    try {
      await this.deps.notifier.announce({ text, workId, state });
    } catch (error) {
      this.record("notify.failed", {
        workId,
        state,
        detail: { error: error instanceof Error ? error.message : String(error), text },
      });
    }
  }

  /**
   * Writes down what an agent run took.
   *
   * Every field the relay and the budget will need is here, and `costSource`
   * says whether the money figure was measured or worked out, so nothing
   * downstream has to guess which.
   */
  private recordAgentRun(ctx: { record: TicketRecord }, run: AgentRun): void {
    this.record("agent.run", {
      // The record's id, like every other line, rather than the ticket's.
      // They agree in production and a log that keys on two different things
      // cannot be joined.
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
  }

  /**
   * Appends to the log if there is one, and shrugs if there is not.
   *
   * A full disk or a bad permission under `.amy/log` must not cost a ticket a
   * move, and must not be silent either, or the machine looks healthy while
   * keeping no record of anything.
   *
   * Once per worker: a broken log throws on every one of the eight or so
   * calls in a tick, and a flood in stderr is its own outage. It does not
   * announce — `announce` writes under `.amy/` too, so on a machine whose log
   * just broke it is the wrong thing to trust.
   */
  private record(kind: EventKind, rest: Omit<Event, "at" | "kind"> = {}): void {
    try {
      this.deps.log?.append({ at: this.deps.now().toISOString(), kind, ...rest });
    } catch (error) {
      if (this.saidTheLogIsBroken) return;
      this.saidTheLogIsBroken = true;
      const why = error instanceof Error ? error.message : String(error);
      console.error(`amy cannot write its event log, and is carrying on without it: ${why}`);
    }
  }

  /** So a log that throws on every call says so once, not eight times. */
  private saidTheLogIsBroken = false;

  /**
   * A stop request, if one is in force.
   *
   * Returning the result rather than throwing, because a stop is an outcome
   * the operator asked for, not a failure to be retried.
   */
  private halted(): TickResult | null {
    if (!this.deps.stop?.isRequested()) return null;

    const reason = this.deps.stop.reason() ?? "no reason given";
    this.record("stop.enforced", { detail: { reason } });
    return { kind: "stopped", reason };
  }

  /**
   * Finished queue items are only useful for reading the log afterwards, so
   * they are swept on the way past rather than accumulating forever.
   */
  private maybePrune(now: Date): void {
    this.deps.queue.prune(this.deps.config.retentionDays, now);
  }
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
