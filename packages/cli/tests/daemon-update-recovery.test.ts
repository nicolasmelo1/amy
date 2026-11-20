import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

/**
 * Removals of one path, as the processes on a machine can order them. While
 * `held` is set, a removal of the watched path waits until the test lets it
 * go; `after` runs once, right after the first removal that does happen.
 */
const removals: { watched?: string; after?: () => void; held?: boolean; waiting: string[] } = { waiting: [] };

vi.mock("node:fs", async (original) => {
  const real = await original<typeof import("node:fs")>();
  const rmSync: typeof real.rmSync = (target, options) => {
    if (removals.watched !== undefined && String(target) === removals.watched) {
      if (removals.held) {
        removals.waiting.push(String(target));
        return;
      }
      real.rmSync(target, options);
      const after = removals.after;
      removals.after = undefined;
      after?.();
      return;
    }
    real.rmSync(target, options);
  };
  return { ...real, rmSync, default: { ...real, rmSync } };
});

const { takeDaemonUpdate } = await import("../src/auto-update.js");

const PROFILE = "oncall";
const homes: string[] = [];

afterEach(() => {
  removals.watched = undefined;
  removals.after = undefined;
  removals.held = false;
  removals.waiting = [];
  for (const home of homes.splice(0)) fs.rmSync(home, { recursive: true, force: true });
});

describe("recovering an update whose owner died holding it", () => {
  it("runs it once when a second starter arrives while the first is recovering it", () => {
    const home = fs.mkdtempSync(path.join(os.tmpdir(), "amy-update-recovery-"));
    homes.push(home);
    const claim = path.join(home, "workflows", PROFILE, "auto-update-daemon.claimed");
    fs.mkdirSync(path.dirname(claim), { recursive: true });
    // The owner consumed the due and died: the update it owed never ran.
    fs.writeFileSync(claim, `${JSON.stringify({ pid: 999_999, stamp: "gone" })}\n`);

    // The second starter runs whole the moment the dead owner's claim is
    // gone, and lets go of whatever it took only after the first is done.
    let second: boolean | undefined;
    removals.watched = claim;
    removals.after = () => {
      removals.held = true;
      second = takeDaemonUpdate(home, PROFILE);
    };
    const first = takeDaemonUpdate(home, PROFILE);
    removals.held = false;
    for (const target of removals.waiting.splice(0)) fs.rmSync(target, { force: true });

    expect([first, second ?? false].filter(Boolean)).toHaveLength(1);
  });
});
