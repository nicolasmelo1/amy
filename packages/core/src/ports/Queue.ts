import { QueueItem } from "../queue-item.js";

export interface EnqueueRequest {
  workId: string;
  reason: string;
  /** Milliseconds to hold the item back. Zero means the next look is immediate. */
  delayMs?: number;
  attempt?: number;
  /** How urgent, smaller first. A queue that does not order by it keeps it and ignores it. */
  priority?: number;
  progress?: Record<string, { count: number; detail: string }>;
}

export interface Queue {
  enqueue(request: EnqueueRequest, now: Date): QueueItem;

  /**
   * Takes the earliest item that is due, and marks it as being worked on so a
   * second worker cannot take it too. Returns null when nothing is due, which
   * is different from the queue being empty.
   */
  claim(now: Date): QueueItem | null;

  complete(item: QueueItem): void;

  /** Puts a claimed item back, for a worker that could not finish it. */
  release(item: QueueItem): void;

  /**
   * Brings every look at one piece of work that is still held back forward to
   * now, and says how many moved.
   *
   * The queue is the schedule, so something arriving earlier than expected —
   * a review comment, a webhook, somebody who does not want to wait — has to
   * move the look that already exists rather than add one beside it. Two
   * items for one piece of work would each chain their own successor, and the
   * queue would fork into two chains that both spend an agent.
   *
   * A look that is already due is left alone: it is not held back, so there
   * is nothing to bring forward.
   */
  promote(workId: string, now: Date): number;

  /**
   * Sets the urgency of every look at one piece of work still waiting, and
   * says how many changed.
   *
   * Discovery reads urgency fresh each time, and a ticket somebody raised to
   * urgent this morning must not wait behind what was urgent yesterday.
   * Optional, because a queue that keeps no order has nothing to refresh.
   */
  reprioritize?(workId: string, priority: number | undefined): number;

  /**
   * Every item that is finished, for work discovery must not bring back.
   *
   * Optional, because a queue that keeps no history can answer only what it
   * still holds. The engine reads it to tell "this work gave up at its
   * ceiling" from "this work is about to be looked at again".
   */
  completed?(): QueueItem[];

  /** Returns items abandoned by a dead worker so they get picked up again. */
  recover(olderThanMs: number, now: Date): QueueItem[];

  /** Deletes finished items past their retention, so the directory stays small. */
  prune(retentionDays: number, now: Date): number;

  ready(now: Date): QueueItem[];
  pending(): QueueItem[];
}
