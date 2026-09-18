/** What a status listing needs from a record, and nothing else. */
export interface RecordLine {
  readonly state: string;
}

/** The records to print, and how many were left out for having ended. */
export interface RecordsView<R> {
  readonly shown: readonly R[];
  readonly finished: number;
}

/**
 * Which records `amy status` prints.
 *
 * A record in a terminal state is work that is over. `Worker.discover` already
 * refuses to re-enqueue it, so keeping it costs no agent — but it never leaves
 * the listing on its own, and the one page somebody keeps open becomes the
 * page they stop reading. Work that has ended is counted here rather than
 * printed, and `--all` prints it anyway.
 *
 * Counted and not deleted, because the terminal record is the safeguard that
 * stops rediscovery. Removing it while the tracker still returns the id starts
 * the whole lifecycle over; that is retention's job, not this function's.
 *
 * `terminal` is undefined when the workflow would not mount. Nothing is hidden
 * then: a mount that failed is exactly when somebody wants every row, and
 * guessing which states are terminal would invent the answer the workflow was
 * going to give.
 */
export function recordsToShow<R extends RecordLine>(
  records: readonly R[],
  terminal: readonly string[] | undefined,
  all: boolean,
): RecordsView<R> {
  if (all || !terminal) return { shown: records, finished: 0 };

  const shown = records.filter((record) => !terminal.includes(record.state));
  return { shown, finished: records.length - shown.length };
}

/**
 * The one word the listing puts against a state.
 *
 * Terminal is asked before waiting, because a workflow may well call the same
 * state both — `DONE` is where nothing happens until the world moves, and the
 * world is never going to move. "Waiting" would read as something outstanding.
 *
 * `?` when the workflow would not mount, which is the honest answer: without
 * it there are no states to compare against.
 */
export function standing(
  state: string,
  waiting: readonly string[] | undefined,
  terminal: readonly string[] | undefined,
): string {
  if (!waiting && !terminal) return "?";
  if (terminal?.includes(state)) return "finished";
  return waiting?.includes(state) ? "waiting" : "active";
}
