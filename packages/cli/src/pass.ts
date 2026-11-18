import { deadlineOf } from "@amykit/core";
import type { Engine } from "@amykit/core";

/** What one pass over the world found, and the move it made. */
export interface Pass<M = unknown> {
  readonly found: readonly string[];
  readonly moved: M;
  /**
   * Set when discovery ran out of time. The pass is still a pass: the work
   * already on the queue was advanced, and the caller says what it missed.
   */
  readonly missed?: { readonly host: string; readonly deadlineMs: number };
}

/**
 * One pass: discover, then advance one item.
 *
 * `amy run`, `amy tick` and the daemon all look at the world the same way.
 * Work appears in the world rather than being handed over, so a pass that
 * only ticked would advance what is already queued and never notice the
 * ticket that arrived while nothing was due.
 *
 * A tracker that ran out of time is a discovery this pass did without, not a
 * reason to abandon the queue: the pass moves what it already holds, names
 * the host and deadline it missed, and the loop comes back to the world on
 * its next turn. An error that is not a deadline is a defect, and is thrown.
 */
export async function onePass<M = unknown>(engine: Engine): Promise<Pass<M>> {
  let found: readonly string[] = [];
  let missed: { host: string; deadlineMs: number } | undefined;
  try {
    found = await engine.discover();
  } catch (error) {
    const deadline = deadlineOf(error);
    if (deadline === undefined) throw error;
    missed = { host: deadline.host, deadlineMs: deadline.deadlineMs };
  }
  const moved = (await engine.tick()) as M;
  return missed === undefined ? { found, moved } : { found, moved, missed };
}
