import type { Engine } from "@amykit/core";

/** What one pass over the world found, and the move it made. */
export interface Pass<M = unknown> {
  readonly found: readonly string[];
  readonly moved: M;
}

/**
 * One pass: discover, then advance one item.
 *
 * `amy run`, `amy tick` and the daemon all look at the world the same way.
 * Work appears in the world rather than being handed over, so a pass that
 * only ticked would advance what is already queued and never notice the
 * ticket that arrived while nothing was due.
 */
export async function onePass<M = unknown>(engine: Engine): Promise<Pass<M>> {
  const found = await engine.discover();
  const moved = (await engine.tick()) as M;
  return { found, moved };
}
