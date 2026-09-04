import { QueueItem } from "../queue-item.js";

export interface EnqueueRequest {
  workId: string;
  reason: string;
  /** Milliseconds to hold the item back. Zero means the next look is immediate. */
  delayMs?: number;
  attempt?: number;
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

  /** Returns items abandoned by a dead worker so they get picked up again. */
  recover(olderThanMs: number, now: Date): QueueItem[];

  /** Deletes finished items past their retention, so the directory stays small. */
  prune(retentionDays: number, now: Date): number;

  ready(now: Date): QueueItem[];
  pending(): QueueItem[];
}
