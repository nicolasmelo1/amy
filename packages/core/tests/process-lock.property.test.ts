import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { type HeldLock, type LockOptions, takeLock } from "../src/process-lock.js";

const FALSIFIER = "a_lock_held_twice";
const planted = process.env.SF_FALSIFIER === FALSIFIER;

/** The mutation the property must reject: taking a lock without asking whether anyone holds it. */
const take = (file: string, options: LockOptions): HeldLock | undefined => {
  if (planted) fs.rmSync(file, { recursive: true, force: true });
  return takeLock(file, options);
};

const DEAD = 2147483647;
const LEASE_MS = 1000;

type Move =
  | { readonly kind: "take"; readonly holder: number; readonly dies: boolean }
  | { readonly kind: "release"; readonly holder: number }
  | { readonly kind: "renew"; readonly holder: number }
  | { readonly kind: "tick"; readonly ms: number };

const move: fc.Arbitrary<Move> = fc.oneof(
  { weight: 5, arbitrary: fc.record({ kind: fc.constant("take" as const), holder: fc.nat({ max: 4 }), dies: fc.boolean() }) },
  { weight: 2, arbitrary: fc.record({ kind: fc.constant("release" as const), holder: fc.nat({ max: 4 }) }) },
  { weight: 2, arbitrary: fc.record({ kind: fc.constant("renew" as const), holder: fc.nat({ max: 4 }) }) },
  { weight: 2, arbitrary: fc.record({ kind: fc.constant("tick" as const), ms: fc.nat({ max: 1500 }) }) },
);

interface Holding {
  readonly lock: HeldLock;
  readonly alive: boolean;
  refreshed: number;
}

/** Plays one move against the lock, keeping what each holder holds. */
function play(one: Move, file: string, world: { clock: number; holdings: Map<number, Holding> }): void {
  if (one.kind === "tick") {
    world.clock += one.ms;
    return;
  }
  if (one.kind === "take") {
    // A holder that dies took the lock for a process that is gone.
    const lock = take(file, { leaseMs: LEASE_MS, now: () => world.clock, ...(one.dies ? { pid: DEAD } : {}) });
    if (lock) world.holdings.set(one.holder, { lock, alive: !one.dies, refreshed: world.clock });
    return;
  }
  const holding = world.holdings.get(one.holder);
  if (!holding) return;
  if (one.kind === "release") {
    holding.lock.release();
    world.holdings.delete(one.holder);
  } else if (holding.alive && holding.lock.renew()) {
    holding.refreshed = world.clock;
  }
}

describe("a lock", () => {
  it("a_lock_held_twice", () => {
    fc.assert(fc.property(fc.array(move, { minLength: 1, maxLength: 40 }), (moves) => {
      const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "amy-lock-property-")), "thing.lock");
      const world = { clock: Date.now(), holdings: new Map<number, Holding>() };
      for (const one of moves) {
        play(one, file, world);
        const holdings = [...world.holdings.values()];
        // Never two at once.
        expect(holdings.filter((one) => one.lock.holds()).length).toBeLessThanOrEqual(1);
        // A live holder that renewed within its lease still holds.
        for (const one of holdings) if (one.alive && world.clock - one.refreshed < LEASE_MS) expect(one.lock.holds()).toBe(true);
      }
    }));
  });
});
