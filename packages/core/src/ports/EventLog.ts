export type EventKind =
  /** The engine took an item off the queue, or found nothing due. */
  | "run.claimed"
  | "run.idle"
  /** A workflow decided, and what it decided. */
  | "work.planned"
  | "work.advanced"
  | "work.waiting"
  | "work.settled"
  | "work.failed"
  /** A dependency went down under this work, and then came back. */
  | "work.degraded"
  | "work.recovered"
  /** One action, and how it went. */
  | "action.started"
  | "action.finished"
  | "action.failed"
  /** An agent ran: which harness, which model, what it cost. */
  | "agent.run"
  /** An agent was handed over to another one, and why. */
  | "agent.handoff"
  /** The operator pulled the handbrake, and the engine obeyed. */
  | "stop.requested"
  | "stop.enforced"
  /** Work was parked because a budget window is nearly spent. */
  | "budget.parked"
  /** Work was parked because another agent run would add no evidence. */
  | "progress.parked"
  /** An announcement never reached anybody, and what it was going to say. */
  | "notify.failed"
  /** A worktree was removed, and why it was safe to remove. */
  | "worktree.removed"
  /** A worktree removal was asked for and refused, and why. */
  | "worktree.retained";

/**
 * Every kind, with the one line that says what it means.
 *
 * `Record<EventKind, string>` welds the two directions: dropping a member of
 * the union leaves a key here with nowhere to go, and adding one leaves this
 * table missing a property. Neither compiles, so the names cannot drift.
 *
 * The shape of each `detail` is declared in `events.json` and checked by
 * `checkEvent`. This table exists for the names, which is the part a
 * compiler can hold.
 */
export const EVENT_KINDS: Readonly<Record<EventKind, string>> = {
  "run.claimed": "the engine took an item off the queue",
  "run.idle": "nothing was due",
  "work.planned": "a workflow decided what to do next",
  "work.advanced": "the work moved to another state",
  "work.waiting": "the work stayed put, to be looked at again later",
  "work.settled": "the work reached a terminal state",
  "work.failed": "one attempt at this work threw",
  "work.degraded": "this work started failing, and is being retried",
  "work.recovered": "this work is moving again after failing",
  "action.started": "one action began",
  "action.finished": "one action finished",
  "action.failed": "one action threw",
  "agent.run": "an agent ran, and what it cost",
  "agent.handoff": "an agent was handed over to another one",
  "stop.requested": "the operator pulled the handbrake",
  "stop.enforced": "the engine obeyed the handbrake",
  "budget.parked": "work was parked against a budget window",
  "progress.parked": "work was parked because another run would add no evidence",
  "notify.failed": "an announcement never reached anybody",
  "worktree.removed": "a worktree was removed, and why it was safe to",
  "worktree.retained": "a worktree removal was refused, and why",
};

/**
 * Whether a string names a kind this build knows.
 *
 * Used when reading, never when appending. A log written by a newer build may
 * carry kinds this one has never heard of, and the honest thing for an
 * aggregate to do with a line it cannot read is leave it out.
 */
export function isEventKind(value: string): value is EventKind {
  return Object.prototype.hasOwnProperty.call(EVENT_KINDS, value);
}

export interface Event {
  at: string;
  kind: EventKind;
  workId?: string;
  state?: string;
  /**
   * Which build wrote this line.
   *
   * Set by the log rather than by callers, because a field every caller has
   * to remember is a field that goes missing. Without it, "we improved the
   * repo" and "what failed yesterday" stop being comparable, and a report
   * that aggregates several builds into one number is worse than no report.
   */
  build?: string;
  /**
   * Whatever the event needs to be readable later.
   *
   * This log is local and may name the work it is about. Anything leaving the
   * machine is projected and scrubbed at that boundary, never here, so the
   * operator's own view is not crippled to protect a report.
   */
  detail?: Record<string, unknown>;
}

/**
 * The append-only record of everything that happened.
 *
 * One source, several readers: `amy budget` aggregates it, a harness reads
 * it to know what a run cost, and a reporter projects it. Giving each of
 * those its own state is how they end up disagreeing with each other.
 */
export interface EventLog {
  append(event: Event): void;
  /** Events at or after the given instant, oldest first. */
  read(since?: Date): Event[];
  /**
   * Every event at or after `since`, oldest first, then every event any
   * process appends afterwards, until the returned function is called.
   *
   * Optional because a log may be a sink nobody can watch: `watchEvents`
   * reads one of those by polling instead.
   */
  watch?(since: Date, onEvent: (event: Event) => void): () => void;
}

export interface WatchOptions {
  /** How often a log without `watch` is read again. */
  everyMs?: number;
  /**
   * Called once, when the log cannot be watched and is polled instead. The
   * caller words it: the core words nothing a person reads.
   */
  onPolling?: (everyMs: number) => void;
}

/**
 * Watch any log: through its own `watch` when it has one, by polling `read`
 * when it does not.
 *
 * The poll keeps a cursor at the last instant it delivered and remembers the
 * lines it delivered at that instant, so two events stamped the same
 * millisecond are both delivered and neither twice. A line appended later
 * with an instant older than the cursor is not seen; a log that can be
 * watched has no such gap.
 */
export function watchEvents(
  log: EventLog,
  since: Date,
  onEvent: (event: Event) => void,
  options: WatchOptions = {},
): () => void {
  if (log.watch) return log.watch(since, onEvent);

  const everyMs = options.everyMs ?? DEFAULT_POLL_MS;
  options.onPolling?.(everyMs);

  let cursor = since.getTime();
  let atCursor = new Map<string, number>();
  const poll = (): void => {
    const already = new Map(atCursor);
    for (const event of log.read(new Date(cursor))) {
      const line = JSON.stringify(event);
      const at = new Date(event.at).getTime();
      const left = at === cursor ? (already.get(line) ?? 0) : 0;
      if (left > 0) {
        already.set(line, left - 1);
        continue;
      }
      if (at !== cursor) {
        cursor = at;
        atCursor = new Map();
      }
      atCursor.set(line, (atCursor.get(line) ?? 0) + 1);
      onEvent(event);
    }
  };

  poll();
  const timer = setInterval(poll, everyMs);
  return () => clearInterval(timer);
}

const DEFAULT_POLL_MS = 1_000;
