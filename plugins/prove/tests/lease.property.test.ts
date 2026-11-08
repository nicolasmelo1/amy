import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { Leases } from "../src/lease.js";

const FALSIFIER = "a_seat_held_twice";
const planted = process.env.SF_FALSIFIER === FALSIFIER;

/** The mutation the property must reject: free seats counted as if nobody held one. */
class Overbooked extends Leases {
  protected override freeSeats(capacity: number): number {
    return capacity;
  }
}

type Move =
  | { readonly kind: "claim"; readonly run: number; readonly priority: number }
  | { readonly kind: "release"; readonly run: number }
  | { readonly kind: "tick"; readonly ms: number };

const move: fc.Arbitrary<Move> = fc.oneof(
  { weight: 5, arbitrary: fc.record({ kind: fc.constant("claim" as const), run: fc.nat({ max: 5 }), priority: fc.nat({ max: 3 }) }) },
  { weight: 2, arbitrary: fc.record({ kind: fc.constant("release" as const), run: fc.nat({ max: 5 }) }) },
  { weight: 1, arbitrary: fc.record({ kind: fc.constant("tick" as const), ms: fc.nat({ max: 1500 }) }) },
);

describe("a resource's seats", () => {
  it("a_seat_held_twice", () => {
    fc.assert(fc.property(fc.integer({ min: 1, max: 3 }), fc.array(move, { minLength: 1, maxLength: 40 }), (capacity, moves) => {
      let clock = 0;
      const root = fs.mkdtempSync(path.join(os.tmpdir(), "amy-lease-"));
      const leases = new (planted ? Overbooked : Leases)(root, () => new Date(clock));
      const resource = "account";
      // A waiter's priority is the one it last claimed with, as the ledger keeps it.
      const priority = new Map<string, number>();
      for (const one of moves) {
        if (one.kind === "tick") clock += one.ms;
        else if (one.kind === "release") leases.release(resource, `run-${one.run}`);
        else {
          const holder = `run-${one.run}`;
          const free = capacity - leases.holders(resource).length;
          const held = leases.holds(resource, holder);
          priority.set(holder, one.priority);
          const claimed = leases.claim({ resource, capacity, holder, priority: one.priority, ttlMs: 1000 });
          if (claimed.held && !held) {
            // A free seat goes by priority: a waiter takes one only while fewer
            // waiters of a higher priority than its own are owed the free seats.
            const higher = leases.waiting(resource).filter((other) => priority.get(other)! > one.priority);
            expect(higher.length).toBeLessThan(free);
          }
        }
        expect(leases.holders(resource).length).toBeLessThanOrEqual(capacity);
      }
      fs.rmSync(root, { recursive: true, force: true });
    }), { numRuns: 200 });
  });

  it("gives a released seat to the highest priority waiting, not to whoever asks next", () => {
    let clock = 0;
    const leases = new Leases(fs.mkdtempSync(path.join(os.tmpdir(), "amy-lease-")), () => new Date(clock));
    const claim = (holder: string, priority: number) => leases.claim({ resource: "account", capacity: 1, holder, priority, ttlMs: 60_000 });

    expect(claim("holder", 0).held).toBe(true);
    expect(claim("low", 1).held).toBe(false);
    expect(claim("high", 5).held).toBe(false);
    leases.release("account", "holder");
    clock += 1;

    expect(claim("low", 1)).toMatchObject({ held: false, ahead: 0 });
    expect(claim("high", 5).held).toBe(true);
  });
});
