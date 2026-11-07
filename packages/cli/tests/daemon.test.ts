import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { claimDaemonBoundary, claimExitedDaemon, clearDaemon, isAlive, readDaemon, runLoop, running, runningForWorkflow, writeDaemon } from "../src/daemon.js";

describe("the loop that is running", () => {
  let home: string;
  let file: string;

  beforeEach(() => {
    home = fs.mkdtempSync(path.join(os.tmpdir(), "amy-daemon-"));
    file = path.join(home, "daemon.pid");
  });

  afterEach(() => fs.rmSync(home, { recursive: true, force: true }));

  const record = (pid: number, workflow = "oncall") => ({ pid, workflow, startedAt: "2026-09-05T00:00:00.000Z" });

  it("is nothing when nothing was ever written", () => {
    expect(running(file)).toBeUndefined();
    expect(readDaemon(file)).toBeUndefined();
  });

  it("is what was written, while that process is alive", () => {
    writeDaemon(file, record(process.pid));

    expect(running(file)).toMatchObject({ pid: process.pid, workflow: "oncall" });
  });

  it("does not treat another workflow's live legacy record as its own", () => {
    writeDaemon(file, record(process.pid, "other"));

    expect(runningForWorkflow(file, "selected")).toBeUndefined();
    expect(runningForWorkflow(file, "other")).toMatchObject({ pid: process.pid, workflow: "other" });
  });

  it("keeps a live shared record visible before another profile can publish", () => {
    writeDaemon(file, record(process.pid, "other"));

    expect(running(file)).toMatchObject({ pid: process.pid, workflow: "other" });
  });

  it("is nothing when the process it names is gone", () => {
    // What a reboot leaves behind. A second `amy start` has to be able to
    // tell this from a loop that is genuinely up.
    writeDaemon(file, record(0x7fffffff));

    expect(running(file)).toBeUndefined();
  });

  it("clears the file it found to be stale, so the next start just works", () => {
    writeDaemon(file, record(0x7fffffff));
    running(file);

    expect(fs.existsSync(file)).toBe(false);
  });

  it("survives a file that will not parse", () => {
    fs.writeFileSync(file, "not json", "utf-8");

    expect(readDaemon(file)).toBeUndefined();
  });

  it("clears on request", () => {
    writeDaemon(file, record(process.pid));
    clearDaemon(file);

    expect(fs.existsSync(file)).toBe(false);
  });

  it("lets one reaper claim an exited daemon exactly once", () => {
    writeDaemon(file, record(0x7fffffff));

    expect(claimExitedDaemon(file, 0x7fffffff)).toMatchObject({ workflow: "oncall" });
    expect(claimExitedDaemon(file, 0x7fffffff)).toBeUndefined();
    expect(fs.existsSync(file)).toBe(false);
  });

  it("makes startup and update mutually exclusive until the owner releases it", () => {
    const release = claimDaemonBoundary(file);
    expect(release).toBeTypeOf("function");
    expect(claimDaemonBoundary(file)).toBeUndefined();

    release?.();
    const next = claimDaemonBoundary(file);
    expect(next).toBeTypeOf("function");
    next?.();
  });

  it("knows this process is alive and a made-up one is not", () => {
    expect(isAlive(process.pid)).toBe(true);
    expect(isAlive(0x7fffffff)).toBe(false);
  });
});

describe("the loop, when what it mounted changes", () => {
  it("remounts after the tick in progress and never during one", async () => {
    const said: string[] = [];
    let changed = false;
    let turns = 0;
    let inTurn = false;

    await runLoop({
      idleMs: 1,
      stopping: () => turns >= 3,
      paused: () => false,
      turn: async () => {
        inTurn = true;
        turns += 1;
        said.push(`tick ${turns} starts`);
        // A file in the fork is saved while this tick is still running.
        if (turns === 1) changed = true;
        await new Promise((resolve) => setTimeout(resolve, 5));
        said.push(`tick ${turns} ends`);
        inTurn = false;
        return { idle: false };
      },
      changed: () => changed,
      remount: async () => {
        expect(inTurn).toBe(false);
        changed = false;
        said.push("remount");
      },
      sleep: async () => {},
    });

    expect(said).toEqual(["tick 1 starts", "tick 1 ends", "remount", "tick 2 starts", "tick 2 ends", "tick 3 starts", "tick 3 ends"]);
  });

  it("stops after a remount that replaced it, before another tick", async () => {
    let stopping = false;
    let turns = 0;

    await runLoop({
      idleMs: 1,
      stopping: () => stopping,
      paused: () => false,
      turn: async () => {
        turns += 1;
        return { idle: true };
      },
      changed: () => true,
      remount: async () => {
        stopping = true;
      },
      sleep: async () => {},
    });

    expect(turns).toBe(0);
  });
});
