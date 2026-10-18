export interface QueueItem {
  /** Sortable, so the queue has a stable order without an index. */
  id: string;
  workId: string;
  enqueuedAt: string;
  /** The queue will not hand this out before this instant. */
  notBefore: string;
  attempt: number;
  /** Why this item exists, for reading the log later. */
  reason: string;
  /**
   * How urgent the work is, smaller first, where whoever found it said.
   *
   * Carried on the item rather than looked up at claim time, so a queue that
   * orders by it reads one directory and asks nobody. Absent is after every
   * item that has one.
   */
  priority?: number;
  /** Consecutive no-evidence attempts, durable across worker processes. */
  progress?: Record<string, { count: number; detail: string }>;
}

export function isReady(item: QueueItem, now: Date): boolean {
  return new Date(item.notBefore).getTime() <= now.getTime();
}
