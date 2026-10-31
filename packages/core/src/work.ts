/**
 * An action the core knows how to dispatch.
 *
 * Deliberately open: the core owns the *catalogue* of action names, and a
 * workflow composes them. The typed payload for each one lives in the
 * workflow package that emits it, so the core never learns a domain.
 */
export type Action = { type: string } & Record<string, unknown>;

export interface Transition {
  at: string;
  from: string;
  to: string;
  why: string;
}

/**
 * What the core remembers about one piece of work.
 *
 * A workflow extends this with whatever else it needs. The core only ever
 * reads and writes the fields declared here.
 */
export interface WorkRecord {
  id: string;
  /** The workflow enumerates its states. The core treats this as a label. */
  state: string;
  updatedAt: string;
  /** Counts only work that was actually tried, so a ceiling speaks about failures. */
  attempts: Record<string, number>;
  /**
   * Counts every look in a state. Optional while records written before this
   * field existed are still on disk; their attempts are their best-known
   * looks until the next saved move writes an explicit count.
   */
  looks?: Record<string, number>;
  history: Transition[];
  /**
   * Every call this record has made, by id (`TBO-1/REVIEW#1`), each a whole
   * record of the callee's own. Kept after the call returns, so a second
   * entry into the same state never reuses the first's history.
   */
  calls?: Record<string, WorkRecord>;
  /** The call this record is waiting on, while it is in a call state. */
  calling?: string;
  /** What a callee was called with, for a record a caller started. */
  input?: Record<string, unknown>;
}

export type Plan<State extends string = string, Effect extends Action = Action> =
  /**
   * Do the work, stay in this state, and look again straight away. The next
   * look sees whatever the actions recorded, which is how a pure decision
   * function drives work that takes minutes or hours.
   */
  | { kind: "act"; effects: Effect[]; why: string; attempt?: boolean }
  | { kind: "advance"; to: State; effects: Effect[]; why: string }
  /**
   * Nothing to do until the outside world moves. May still carry actions, so
   * a workflow can say why it is stuck without leaving the state.
   */
  | { kind: "wait"; retryAfterMs: number; why: string; effects: Effect[] }
  /** Terminal, do not queue anything else. */
  | { kind: "settled"; why: string };

/**
 * The move one look made, handed to the workflow's fold beside the record.
 *
 * The record the fold receives has already been advanced, so its `state` is
 * where the work went, not where the look started — the obvious reading of it
 * is the wrong one. This says both, and is `null` for a look that stayed put.
 */
export interface Moved {
  readonly from: string;
  readonly to: string;
}

/** What `plan` moved `record` by, read before the record is advanced. */
export function movedBy(record: WorkRecord, plan: Plan): Moved | null {
  return plan.kind === "advance" ? { from: record.state, to: plan.to } : null;
}

export function actionsOf(plan: Plan): readonly Action[] {
  switch (plan.kind) {
    case "act":
    case "advance":
    case "wait":
      return plan.effects;
    case "settled":
      return [];
  }
}

/** The tries a state has actually spent. */
export function attemptsIn(record: WorkRecord, state: string): number {
  return record.attempts[state] ?? 0;
}

/** Every look a state took, including waits and work that prepared a later try. */
export function looksIn(record: WorkRecord, state: string): number {
  return record.looks?.[state] ?? attemptsIn(record, state);
}

/** An action's outcome can say that the attempt charged before it ran never happened. */
export interface NotATry {
  notATry: true;
  retryAfterMs?: number;
}

/** Reads the generic outcome without learning any workflow's domain result. */
export function notATryIn(outcomes: object): NotATry | undefined {
  return Object.values(outcomes).find((outcome): outcome is NotATry =>
    !!outcome && typeof outcome === "object" && (outcome as Record<string, unknown>).notATry === true,
  );
}

/**
 * Folds a plan into the next record: the state, the attempt count and the
 * history, and nothing else.
 *
 * Whatever a workflow's actions produced is folded in by the workflow, not
 * here, because the core does not know what a triage or a gate result is.
 * Generic over the record so a workflow's richer type survives the call.
 */
export function applyPlan<R extends WorkRecord>(record: R, plan: Plan, now: Date, outcomes: object = {}): R {
  const looks = { ...(record.looks ?? record.attempts) };
  const next: R = {
    ...record,
    attempts: { ...record.attempts },
    looks,
    history: [...record.history],
    updatedAt: now.toISOString(),
  };

  // A look includes waiting and logistics. Only a real `act` spends a try;
  // transition actions are one-shot and are not retried.
  if (plan.kind === "act" || plan.kind === "wait") {
    looks[record.state] = looksIn(record, record.state) + 1;
  }
  if (plan.kind === "act" && plan.attempt !== false && !notATryIn(outcomes)) {
    next.attempts[record.state] = attemptsIn(record, record.state) + 1;
  }

  if (plan.kind === "advance") {
    next.state = plan.to;
    next.history.push({ at: now.toISOString(), from: record.state, to: plan.to, why: plan.why });
  }

  return next;
}
