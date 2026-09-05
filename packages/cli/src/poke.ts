import { EnqueueRequest, QueueItem } from "@amykit/core";

/**
 * The little of a queue a poke touches.
 *
 * Structural rather than the `Queue` port, because `running()` is not on it:
 * whether something is mid-flight is a question this asks of a queue that can
 * answer it, not a promise every queue has to keep.
 */
export interface Pokeable {
  running(): QueueItem[];
  pending(): QueueItem[];
  promote(workId: string, now: Date): number;
  enqueue(request: EnqueueRequest, now: Date): QueueItem;
}

export type PokeOutcome =
  /** Being worked on now, so its next look is already chained. */
  | { kind: "running" }
  /** Looks that were held back, moved to now. */
  | { kind: "brought-forward"; moved: number }
  /** On the queue and already due. Nothing to bring forward. */
  | { kind: "already-due" }
  /** Nothing knew about it, so it was put on the queue. */
  | { kind: "queued" };

/**
 * Looks at one piece of work now instead of when it was next due.
 *
 * The order of the three questions is the whole logic, and each answer is a
 * different reason for doing nothing more:
 *
 * 1. **Claimed** — a step is running, and the step that finishes enqueues the
 *    next look itself. Touching the queue here is what forks it: the running
 *    step's successor and this one would both be waiting, and both would
 *    chain their own.
 * 2. **Held back** — the case this exists for. The look moves; no second item
 *    is made.
 * 3. **Neither** — nothing on the queue knows about this work, so a poke is
 *    the trigger. This is what turns any webhook into a push without an
 *    endpoint: whatever heard the event runs `amy poke`.
 *
 * Poking work that has already settled costs one look and no agent: the
 * decision function answers `settled`, and the engine completes it without
 * chaining anything. Cheap enough not to need a record loaded to find out.
 */
export function poke(queue: Pokeable, workId: string, now: Date): PokeOutcome {
  if (queue.running().some((item) => item.workId === workId)) return { kind: "running" };

  const moved = queue.promote(workId, now);
  if (moved > 0) return { kind: "brought-forward", moved };

  if (queue.pending().some((item) => item.workId === workId)) return { kind: "already-due" };

  queue.enqueue({ workId, reason: "poked" }, now);
  return { kind: "queued" };
}

/** What the operator is told, in the same words for the same outcome. */
export function describePoke(workId: string, outcome: PokeOutcome): string {
  switch (outcome.kind) {
    case "running":
      return `${workId} is being worked on now — its next look is already chained`;
    case "brought-forward":
      return `${workId} is due now (${outcome.moved} look(s) brought forward)`;
    case "already-due":
      return `${workId} is on the queue and already due`;
    case "queued":
      return `${workId} queued`;
  }
}
