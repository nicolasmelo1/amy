import fs from "node:fs";
import path from "node:path";
import { type HeldLock, takeLock } from "@amykit/core";
import { segment } from "./names.js";

/**
 * Seats on a resource, shared by every project and profile on the machine.
 *
 * The work moves under the proof: two tickets in different phases may need
 * one account at once. A resource has a capacity; a run claims a seat before
 * its first step, and waits when it cannot. The next free seat goes by the
 * work's priority, and a holder that stops renewing loses its seat.
 *
 * Kept under Amy home rather than in a project's artifact root: one account
 * is one resource however many projects reach it, and each project's root is
 * its own.
 */

interface Seat {
  readonly priority: number;
  readonly expiresAt: number;
  /** When it first asked, kept so a seat given back waits where it waited. */
  readonly since?: number;
}

interface Waiter {
  readonly priority: number;
  /** When it first asked, for the order among equal priorities. */
  readonly since: number;
  /** A waiter that stops asking is forgotten, or it would hold the queue forever. */
  readonly expiresAt: number;
}

interface Ledger {
  holders: Record<string, Seat>;
  waiting: Record<string, Waiter>;
  /** The last holder, taking the resource down: no seat is given until it is down. */
  draining?: string;
}

export interface Claim {
  readonly resource: string;
  readonly capacity: number;
  /** Who holds the seat: the run's work id. */
  readonly holder: string;
  /** Higher goes first. */
  readonly priority: number;
  /** How long a seat lasts without a renewal. */
  readonly ttlMs: number;
}

export type Claimed =
  | { readonly held: true }
  | { readonly held: false; readonly holders: readonly string[]; readonly ahead: number };

/** How long a lock naming no process, an earlier version's half-made one, stands before its maker is taken for dead. */
const UNOWNED_STALE_MS = 10_000;
/** How long a claim waits for another process's lock before saying it stayed taken. */
const LOCK_PATIENCE_MS = 10_000;

export class Leases {
  constructor(
    private readonly root: string,
    private readonly now: () => Date = () => new Date(),
    private readonly patienceMs: number = LOCK_PATIENCE_MS,
  ) {}

  /**
   * Takes a seat, or joins the queue for one. A holder claiming again
   * renews; a waiter keeps its place in the queue by asking again.
   */
  claim(claim: Claim): Claimed {
    if (!Number.isInteger(claim.capacity) || claim.capacity < 1) throw new Error(`the resource \`${claim.resource}\` has a capacity of ${claim.capacity}; it needs at least one seat`);
    return this.locked(claim.resource, (ledger, now) => {
      const expiresAt = now + claim.ttlMs;
      if (ledger.holders[claim.holder]) {
        ledger.holders[claim.holder] = { priority: claim.priority, expiresAt };
        return { held: true };
      }
      const already = ledger.waiting[claim.holder];
      const since = already?.since ?? now;
      ledger.waiting[claim.holder] = { priority: claim.priority, since, expiresAt };
      const free = ledger.draining === undefined ? this.freeSeats(claim.capacity, Object.keys(ledger.holders).length) : 0;
      const ahead = queue(ledger).indexOf(claim.holder);
      if (ahead < free) {
        delete ledger.waiting[claim.holder];
        ledger.holders[claim.holder] = { priority: claim.priority, expiresAt, since };
        return { held: true };
      }
      return { held: false, holders: Object.keys(ledger.holders).sort(), ahead: ahead - Math.max(free, 0) };
    });
  }

  /** Extends a held seat; false when the seat was already lost. */
  renew(resource: string, holder: string, ttlMs: number): boolean {
    return this.locked(resource, (ledger, now) => {
      const seat = ledger.holders[holder];
      if (!seat) return false;
      ledger.holders[holder] = { ...seat, expiresAt: now + ttlMs };
      return true;
    });
  }

  /** Gives the seat back, or leaves the queue. */
  release(resource: string, holder: string): void {
    this.locked(resource, (ledger) => {
      delete ledger.holders[holder];
      delete ledger.waiting[holder];
      if (ledger.draining === holder) delete ledger.draining;
    });
  }

  /**
   * Whether this holder is the last one on the resource. When it is, it
   * keeps its seat and the resource drains — no seat is given — until its
   * `release`, so taking the resource down never pulls it from under a run
   * that just claimed it. Otherwise its seat is given back at once. A
   * holder whose seat ran out with nobody else on the resource is the last.
   */
  leaveLast(resource: string, holder: string, ttlMs: number): boolean {
    return this.locked(resource, (ledger, now) => {
      const others = Object.keys(ledger.holders).filter((one) => one !== holder);
      if (others.length === 0) {
        // A seat that ran out while nobody took it is still this run's to
        // take down: it holds the resource again while it drains.
        ledger.holders[holder] ??= { priority: 0, expiresAt: now + ttlMs };
        ledger.draining = holder;
        return true;
      }
      delete ledger.holders[holder];
      delete ledger.waiting[holder];
      return false;
    });
  }

  /** Who holds a seat now, expired seats left out. */
  holders(resource: string): string[] {
    const ledger = this.read(resource);
    const now = this.now().getTime();
    return Object.entries(ledger.holders).filter(([, seat]) => seat.expiresAt > now).map(([holder]) => holder).sort();
  }

  /** Who waits, in the order seats will go to them. */
  waiting(resource: string): string[] {
    const ledger = this.read(resource);
    expire(ledger, this.now().getTime());
    return queue(ledger);
  }

  holds(resource: string, holder: string): boolean {
    return this.holders(resource).includes(holder);
  }

  /** The seats left; a seam a property test plants a mutation in. */
  protected freeSeats(capacity: number, held: number): number {
    return capacity - held;
  }

  private file(resource: string): string {
    return path.join(this.root, `${segment(resource)}.json`);
  }

  private read(resource: string): Ledger {
    try {
      const parsed = JSON.parse(fs.readFileSync(this.file(resource), "utf-8")) as Partial<Ledger>;
      return { holders: parsed.holders ?? {}, waiting: parsed.waiting ?? {}, ...(parsed.draining ? { draining: parsed.draining } : {}) };
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return { holders: {}, waiting: {} };
      throw error;
    }
  }

  /**
   * Reads, changes and writes one resource's ledger under its lock, so two
   * daemons claiming at once never both see a free seat.
   */
  private locked<T>(resource: string, change: (ledger: Ledger, now: number) => T): T {
    fs.mkdirSync(this.root, { recursive: true });
    const lock = `${this.file(resource)}.lock`;
    const held = acquire(lock, this.patienceMs);
    try {
      const ledger = this.read(resource);
      const now = this.now().getTime();
      expire(ledger, now);
      const answer = change(ledger, now);
      const temporary = `${this.file(resource)}.${process.pid}.tmp`;
      fs.writeFileSync(temporary, `${JSON.stringify(ledger, null, 2)}\n`);
      fs.renameSync(temporary, this.file(resource));
      return answer;
    } finally {
      held.release();
    }
  }
}

function expire(ledger: Ledger, now: number): void {
  for (const [holder, seat] of Object.entries(ledger.holders)) if (seat.expiresAt <= now) delete ledger.holders[holder];
  for (const [holder, waiter] of Object.entries(ledger.waiting)) if (waiter.expiresAt <= now) delete ledger.waiting[holder];
  if (ledger.draining !== undefined && !ledger.holders[ledger.draining]) delete ledger.draining;
}

/** The waiters in the order seats go to them: priority first, then who asked first. */
function queue(ledger: Ledger): string[] {
  return Object.entries(ledger.waiting)
    .sort(([a, one], [b, other]) => other.priority - one.priority || one.since - other.since || a.localeCompare(b))
    .map(([holder]) => holder);
}

/**
 * Takes the lock, waiting while a live owner holds it. The core's lock
 * reclaims one whose owner died — never by age alone, since a slow owner is
 * still an owner — and of the processes that find it dead, one takes it.
 */
function acquire(lock: string, patienceMs: number): HeldLock {
  for (const until = Date.now() + patienceMs; Date.now() < until;) {
    const held = takeLock(lock, { graceMs: UNOWNED_STALE_MS });
    if (held) return held;
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 5);
  }
  throw new Error(`the lease lock ${lock} stayed taken; remove it if no amy is running`);
}
