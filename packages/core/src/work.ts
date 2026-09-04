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
  /** Bounds every retry loop, and lets a state tell its first look from its tenth. */
  attempts: Record<string, number>;
  history: Transition[];
}

export type Plan =
  /**
   * Do the work, stay in this state, and look again straight away. The next
   * look sees whatever the actions recorded, which is how a pure decision
   * function drives work that takes minutes or hours.
   */
  | { kind: "act"; effects: Action[]; why: string }
  | { kind: "advance"; to: string; effects: Action[]; why: string }
  /**
   * Nothing to do until the outside world moves. May still carry actions, so
   * a workflow can say why it is stuck without leaving the state.
   */
  | { kind: "wait"; retryAfterMs: number; why: string; effects: Action[] }
  /** Terminal, do not queue anything else. */
  | { kind: "settled"; why: string };

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

/**
 * Folds a plan into the next record: the state, the attempt count and the
 * history, and nothing else.
 *
 * Whatever a workflow's actions produced is folded in by the workflow, not
 * here, because the core does not know what a triage or a gate result is.
 * Generic over the record so a workflow's richer type survives the call.
 */
export function applyPlan<R extends WorkRecord>(record: R, plan: Plan, now: Date): R {
  const next: R = {
    ...record,
    attempts: { ...record.attempts },
    history: [...record.history],
    updatedAt: now.toISOString(),
  };

  // Work done inside a state is counted, so every retry loop is bounded.
  // Actions carried by an advance are one-shot transition actions and are not
  // retried, so they are deliberately not counted.
  if (plan.kind === "act" || plan.kind === "wait") {
    next.attempts[record.state] = (next.attempts[record.state] ?? 0) + 1;
  }

  if (plan.kind === "advance") {
    next.state = plan.to;
    next.history.push({ at: now.toISOString(), from: record.state, to: plan.to, why: plan.why });
  }

  return next;
}
