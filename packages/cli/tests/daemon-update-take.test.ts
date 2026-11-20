import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { HeldLock } from "@amykit/core";

/**
 * What runs between a starter looking at the claim and taking it. The real
 * lock runs underneath; only the moment before it is scheduled here, so an
 * interleaving the processes can produce is produced every time.
 */
const between: { before?: () => void } = {};

/** Processes that have exited since the test began, whatever the system still says. */
const exited = new Set<number>();

vi.mock("@amykit/core", async (original) => {
  const core = await original<typeof import("@amykit/core")>();
  return {
    ...core,
    takeLock: (file: string, options?: Parameters<typeof core.takeLock>[1]) => {
      const before = between.before;
      between.before = undefined;
      before?.();
      return core.takeLock(file, options);
    },
    processAlive: (pid: number) => !exited.has(pid) && core.processAlive(pid),
  };
});

const { takeLock } = await import("@amykit/core");
const { hasDaemonUpdate, settleClaimedDaemonUpdate, takeDaemonUpdate } = await import("../src/auto-update.js");

const PROFILE = "oncall";
const homes: string[] = [];

afterEach(() => {
  between.before = undefined;
  exited.clear();
  for (const home of homes.splice(0)) fs.rmSync(home, { recursive: true, force: true });
});

function home(): { home: string; due: string; claim: string } {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "amy-update-take-"));
  homes.push(directory);
  const due = path.join(directory, "workflows", PROFILE, "auto-update-daemon");
  fs.mkdirSync(path.dirname(due), { recursive: true });
  return { home: directory, due, claim: `${due}.claimed` };
}

describe("taking the daemon's update", () => {
  it("does not run an update its owner finished while this starter was looking", () => {
    const { home: amy, claim } = home();
    // A live owner holds the claim; the due it took is already consumed.
    const owner = takeLock(claim) as HeldLock;
    expect(owner).toBeDefined();
    // The owner finishes, and releases, after this starter saw its claim and
    // before this starter takes the lock. Nothing is due any more.
    between.before = () => owner.release();

    expect(takeDaemonUpdate(amy, PROFILE)).toBe(false);
    expect(hasDaemonUpdate(amy, PROFILE)).toBe(false);
  });

  it("does not run an update its owner finished and then exited while this starter was looking", () => {
    const { home: amy, claim } = home();
    // A starter in another process holds the claim, as the reaper does.
    const pid = process.pid + 100_000;
    const owner = takeLock(claim, { pid }) as HeldLock;
    expect(owner).toBeDefined();
    // It settles its update, releases, and exits, all after this starter saw
    // its claim and before this starter takes the lock. Nothing is due.
    between.before = () => {
      owner.release();
      exited.add(pid);
    };

    expect(takeDaemonUpdate(amy, PROFILE)).toBe(false);
    expect(hasDaemonUpdate(amy, PROFILE)).toBe(false);
  });

  it("leaves the update due for the next starter when running it throws", async () => {
    const { home: amy, due, claim } = home();
    fs.writeFileSync(due, "due\n");
    expect(takeDaemonUpdate(amy, PROFILE)).toBe(true);

    await settleClaimedDaemonUpdate(amy, PROFILE, () => Promise.reject(new Error("npm went away"))).catch(() => undefined);

    expect(fs.existsSync(claim)).toBe(false);
    expect(fs.existsSync(due)).toBe(true);
  });
});
