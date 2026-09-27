import {
  Action,
  ActionContext,
  AnnouncementKind,
  Budget,
  Event,
  EventKind,
  EventLog,
  Notifier,
  Plan,
  Progress,
  Queue,
  QueueItem,
  StopSwitch,
  Store,
  PortLookup,
  WorkRecord,
  Workflow,
  WorkflowRuntime,
  actionsOf,
  applyPlan,
  dispatchesTo,
  implementationOf,
  movedBy,
  runAction,
  undeclaredIn,
} from "@amykit/core";

export interface WorkerConfig {
  /** How long a claimed item may sit before it is treated as abandoned. */
  staleClaimMs: number;
  /** How long finished queue items are kept before being pruned. */
  retentionDays: number;
  /** How many times one item may fail before the machine gives up on it. */
  maxItemAttempts: number;
  /** How long to hold a failed item before looking at it again. */
  retryDelayMs: number;
}

export interface WorkerDeps {
  queue: Queue;
  records: Store;
  /** The order the states happen in, and what the workflow says it emits. */
  workflow: Workflow;
  /**
   * How that workflow's actions actually run.
   *
   * This is the whole reason this engine is not welded to one domain. What
   * used to be here — an observation built out of a tracker, a handler per
   * ticket action, a fold that knew what a gate result is — is on the other
   * side of this interface now, in the package that knows what those words
   * mean.
   */
  runtime: WorkflowRuntime;
  /**
   * The mounted ports, for an action the runtime declared as a port and a
   * method rather than as a handler. Optional, so an engine whose workflow
   * wrote every handler itself still runs.
   */
  port?: PortLookup;
  /** Core's own port, and the only one left here: a failure has to be sayable. */
  notifier: Notifier;
  now: () => Date;
  config: WorkerConfig;
  /** Optional, so an engine with no log still runs. */
  log?: EventLog;
  /** Optional, so an engine with no handbrake still runs. */
  stop?: StopSwitch;
  /** Optional, so an engine with no ceiling on spending still runs. */
  budget?: Budget;
}

/** The one result the budget produces, named so the check can return it. */
export type Parked = Extract<TickResult, { kind: "parked" }>;

export type TickResult =
  | { kind: "idle" }
  | { kind: "stopped"; reason: string }
  | {
      kind: "worked";
      workId: string;
      from: string;
      to: string;
      plan: Plan["kind"];
      why: string;
      /** Set when the plan asked to be looked at again later. */
      retryAfterMs?: number;
    }
  | { kind: "failed"; workId: string; state: string; error: string }
  /** The move would have spent an agent, and the budget said not yet. */
  | {
      kind: "parked";
      workId: string;
      state: string;
      reason: string;
      retryAfterMs: number;
    };

/**
 * Advances at most one piece of work by at most one move, then chains the
 * next look.
 *
 * Nothing here decides *when* the next step runs. A step that takes a minute
 * and a step that takes an hour both enqueue their successor the moment they
 * finish, so the queue is the schedule.
 *
 * Nothing here decides *what* a step is, either. Every noun in this file is
 * queue, record, attempt, budget or stop; a ticket, a pull request and a
 * reviewer are all on the far side of `runtime`.
 */
export class Worker {
  constructor(private readonly deps: WorkerDeps) {}

  /** Puts every piece of work the runtime can find onto the queue. */
  async discover(): Promise<string[]> {
    const now = this.deps.now();
    const enqueued: string[] = [];
    const terminal = this.deps.workflow.terminalStates;

    for (const workId of await this.deps.runtime.found()) {
      const existing = this.deps.records.load(workId);
      if (existing && terminal.includes(existing.state)) continue;
      if (this.deps.queue.pending().some((item) => item.workId === workId)) continue;

      this.deps.queue.enqueue({ workId, reason: "found by the workflow" }, now);
      enqueued.push(workId);
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

    const record =
      this.deps.records.load(item.workId) ?? this.deps.runtime.newRecord(item.workId, now);

    try {
      return await this.advance(item, record, now);
    } catch (error) {
      return await this.recordFailure(item, record, error);
    }
  }

  private async advance(item: QueueItem, record: WorkRecord, now: Date): Promise<TickResult> {
    const observation = await this.deps.runtime.observe(record);
    const decision = this.deps.workflow.plan(record, observation, this.deps.runtime.policy);

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

    const actions = actionsOf(decision);

    const parked = this.parked(record, actions, now) ?? this.progressParked(item, record, actions);
    if (parked) {
      this.park(item, parked, now);
      return parked;
    }

    const outcomes = await this.execute(observation, record, decision);
    const progress = this.progressAfter(item, record, decision, actions, outcomes);
    // The core folds state, attempts and history; the runtime folds the domain.
    // An action can park itself, so save its fold before returning. A manual
    // release must not replay stale state or bypass its attempt ceiling.
    const next = this.deps.runtime.apply(
      applyPlan(record, decision, now),
      decision,
      outcomes,
      observation,
      now,
      movedBy(record, decision),
    );
    this.deps.records.save(next);
    if (progress.parked) {
      this.park({ ...item, progress: progress.next }, progress.parked, now);
      return progress.parked;
    }

    // The core folds the state, the attempt count and the history; the
    // runtime folds what only it can read. Two calls rather than one because
    // the second cannot be written without knowing the domain, and this
    // engine is the half that does not. The move is handed over as well,
    // because the record the runtime gets has already made it.
    this.deps.queue.enqueue(
      {
        workId: item.workId,
        reason: decision.why,
        delayMs: decision.kind === "wait" ? decision.retryAfterMs : 0,
        progress: progress.next,
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
   * The record is deliberately not saved: the work keeps its state and its
   * per-state attempt count, and only its next look moves. Parked, not lost.
   * The queue item's own attempt count is carried by the caller, which is a
   * different counter and has to be said, not assumed.
   */
  private parked(record: WorkRecord, actions: readonly Action[], now: Date): Parked | null {
    if (!this.deps.budget) return null;

    const spending = actions
      .filter((action) => dispatchesTo(action.type, "agent"))
      .map((action) => action.type);
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

  private progressParked(
    item: QueueItem,
    record: WorkRecord,
    actions: readonly Action[],
    state = record.state,
  ): Parked | null {
    const policy = this.deps.runtime.progress;
    if (!policy || !actions.some((action) => dispatchesTo(action.type, "agent"))) return null;
    const current = item.progress ?? {};
    const prefix = `${state}:`;
    const blocked = Object.entries(current).find(([key, value]) =>
      key.startsWith(prefix) && value.count >= policy.maxUnchanged,
    );
    if (!blocked) return null;

    const [stored, value] = blocked;
    const key = stored.slice(prefix.length);
    const pending = actions.filter((action) => dispatchesTo(action.type, "agent")).map((action) => action.type);
    const reason = `another agent run in ${state} would add no evidence for ${key}: ${value.detail}`;
    this.record("progress.parked", {
      workId: record.id,
      state,
      detail: { key, detail: value.detail, maxUnchanged: policy.maxUnchanged, pending },
    });
    return { kind: "parked", workId: record.id, state, reason, retryAfterMs: this.deps.config.retryDelayMs };
  }

  private progressAfter(
    item: QueueItem,
    record: WorkRecord,
    decision: Plan,
    actions: readonly Action[],
    outcomes: Record<string, unknown>,
  ): { next: Record<string, { count: number; detail: string }> | undefined; parked?: Parked } {
    const policy = this.deps.runtime.progress;
    if (!policy || !actions.some((action) => dispatchesTo(action.type, "agent"))) return { next: item.progress };
    const signals = progressSignals(outcomes);
    if (signals.length === 0) return { next: item.progress };

    const next = { ...(item.progress ?? {}) };
    const state = movedBy(record, decision)?.to ?? record.state;
    for (const signal of signals) {
      if (signal.kind === "advanced") {
        // The signal came from the state this look started in. Clearing only
        // the destination would resurrect an old ceiling if work later
        // returns here; clear the destination too in case it already held one.
        delete next[progressKey(record.state, signal.key)];
        delete next[progressKey(state, signal.key)];
        continue;
      }
      if (signal.kind === "unchanged") {
        const key = progressKey(state, signal.key);
        const previous = next[key]?.count ?? 0;
        next[key] = { count: previous + 1, detail: signal.detail };
        continue;
      }
      next[progressKey(state, "handoff")] = { count: policy.maxUnchanged, detail: signal.detail };
      return { next, parked: this.progressParked({ ...item, progress: next }, record, actions, state)! };
    }
    return { next: Object.keys(next).length > 0 ? next : undefined };
  }

  private park(item: QueueItem, parked: Parked, now: Date): void {
    this.deps.queue.enqueue({
      workId: item.workId,
      reason: parked.reason,
      delayMs: parked.retryAfterMs,
      attempt: item.attempt,
      progress: item.progress,
    }, now);
    this.deps.queue.complete(item);
    this.maybePrune(now);
  }

  private async recordFailure(
    item: QueueItem,
    record: WorkRecord,
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
    // throw past `tick()` and the work left the queue with no record of why.
    const notice = this.failureNotice(item, record, attempt, message);
    if (notice) await this.announce(notice.text, item.workId, record.state, notice.kind);

    if (attempt < this.deps.config.maxItemAttempts) {
      this.deps.queue.enqueue(
        {
          workId: item.workId,
          reason: `retrying after an error: ${message}`,
          delayMs: this.deps.config.retryDelayMs,
          attempt,
          // A failure retries the same look, not a fresh one. Retain the
          // no-evidence streak so a transient dependency failure cannot
          // spend an extra agent run past the configured ceiling.
          progress: item.progress,
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
    record: WorkRecord,
    attempt: number,
    message: string,
  ): { text: string; kind: AnnouncementKind } | null {
    if (attempt >= this.deps.config.maxItemAttempts) {
      return {
        text: `${item.workId} failed ${attempt} times in ${record.state}, I have given up, and it is off the queue: ${message}`,
        kind: "gave-up",
      };
    }

    if (item.attempt !== 0) return null;

    this.record("work.degraded", {
      workId: item.workId,
      state: record.state,
      detail: { attempt, error: message },
    });

    return {
      text: `${item.workId} is failing in ${record.state} and I am retrying: ${message}`,
      kind: "failing",
    };
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
  private async announceRecovery(item: QueueItem, state: string): Promise<void> {
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
      "recovered",
    );
  }

  private async execute(
    observation: unknown,
    record: WorkRecord,
    plan: Plan,
  ): Promise<Record<string, unknown>> {
    const outcomes: Record<string, unknown> = {};
    const ctx: ActionContext = { record, observation, outcomes };
    const runtime = this.deps.runtime;
    const port = this.deps.port ?? ((): undefined => undefined);

    // Asked of the whole plan before its first action runs, so a plan that
    // carries something the workflow never declared is refused with nothing
    // half-done behind it rather than after the actions ahead of it.
    const undeclared = undeclaredIn(runtime, plan);
    if (undeclared.length > 0) {
      throw new Error(
        `the plan in ${record.state} carries ${undeclared.map((name) => `"${name}"`).join(", ")}, ` +
          `which the workflow never declared in its actions`,
      );
    }

    for (const action of actionsOf(plan)) {
      // Between actions as well as between ticks, because a plan can carry
      // several and a stop should not have to wait for the last one.
      if (this.deps.stop?.isRequested()) {
        this.record("stop.enforced", {
          workId: record.id,
          state: record.state,
          detail: { pending: action.type, reason: this.deps.stop.reason() },
        });
        break;
      }

      this.record("action.started", { workId: record.id, detail: { action: action.type } });
      try {
        await runAction(implementationOf(runtime, action.type), action, ctx, port);
        this.record("action.finished", { workId: record.id, detail: { action: action.type } });
      } catch (error) {
        this.record("action.failed", {
          workId: record.id,
          detail: {
            action: action.type,
            error: error instanceof Error ? error.message : String(error),
          },
        });
        throw error;
      }
    }

    return outcomes;
  }

  /**
   * Says something to the operator, and never lets that cost a piece of work.
   *
   * A port call may only be swallowed when its failure does not make the
   * saved record a lie, and this is the one that qualifies: nothing
   * downstream reads a notification. Every other port is reached through the
   * runtime and is deliberately not wrapped — see
   * `docs/design/the-engine-fails-out-loud.md`.
   *
   * It lives here rather than only in the fan-out because `notifier` is a
   * port and an install may mount something else behind it. The promise is
   * the engine's, not the mounted plugin's.
   */
  private async announce(
    text: string,
    workId: string,
    state: string,
    kind?: AnnouncementKind,
  ): Promise<void> {
    try {
      await this.deps.notifier.announce({ text, workId, state, ...(kind ? { kind } : {}) });
    } catch (error) {
      this.record("notify.failed", {
        workId,
        state,
        detail: { error: error instanceof Error ? error.message : String(error), text },
      });
    }
  }

  /**
   * Appends to the log if there is one, and shrugs if there is not.
   *
   * A full disk or a bad permission under `.amy/log` must not cost a piece of
   * work a move, and must not be silent either, or the machine looks healthy
   * while keeping no record of anything.
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

  /** Finished items are swept on the way past rather than accumulating forever. */
  private maybePrune(now: Date): void {
    this.deps.queue.prune(this.deps.config.retentionDays, now);
  }
}

function progressKey(state: string, key: string): string {
  return `${state}:${key}`;
}

function isProgress(value: unknown): value is Progress {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Record<string, unknown>;
  if (candidate.kind === "advanced") return typeof candidate.key === "string";
  if (candidate.kind === "unchanged") {
    return typeof candidate.key === "string" && typeof candidate.detail === "string";
  }
  return candidate.kind === "handoff" && typeof candidate.detail === "string";
}

/** Supports generic runtimes while reading the progress field of the ticket contract. */
function progressSignals(outcomes: Record<string, unknown>): Progress[] {
  return Object.values(outcomes).flatMap((outcome) => {
    if (isProgress(outcome)) return [outcome];
    if (!outcome || typeof outcome !== "object") return [];
    const progress = (outcome as Record<string, unknown>).progress;
    return isProgress(progress) ? [progress] : [];
  });
}

