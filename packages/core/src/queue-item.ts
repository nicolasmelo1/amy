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
}

export function isReady(item: QueueItem, now: Date): boolean {
  return new Date(item.notBefore).getTime() <= now.getTime();
}
