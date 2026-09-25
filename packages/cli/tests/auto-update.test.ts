import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { DEFAULT_CONFIG, type AmyConfig } from "../src/config.js";
import {
  autoUpdatePath,
  beginAutoUpdateInvocation,
  finishDaemonUpdate,
  hasDaemonUpdate,
  markDaemonUpdate,
  runWithAutoUpdate,
  takeDaemonUpdate,
} from "../src/auto-update.js";

const config = (autoUpdate: Partial<AmyConfig["autoUpdate"]> = {}): AmyConfig => ({
  ...DEFAULT_CONFIG,
  autoUpdate: { ...DEFAULT_CONFIG.autoUpdate, ...autoUpdate },
});

describe("runWithAutoUpdate", () => {
  const directories: string[] = [];

  afterEach(() => {
    for (const directory of directories.splice(0)) fs.rmSync(directory, { recursive: true, force: true });
  });

  function home(): string {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), "amy-auto-update-"));
    directories.push(directory);
    return directory;
  }

  it("updates before the first due foreground workflow invocation", async () => {
    const calls: string[] = [];

    await runWithAutoUpdate({
      home: home(),
      profile: "oncall",
      config: config({ everyRuns: 1 }),
      update: async () => { calls.push("update"); return 0; },
      work: async () => { calls.push("work"); },
    });

    expect(calls).toEqual(["update", "work"]);
  });

  it("updates after the workflow when configured", async () => {
    const calls: string[] = [];

    await runWithAutoUpdate({
      home: home(),
      profile: "oncall",
      config: config({ everyRuns: 1, timing: "after" }),
      update: async () => { calls.push("update"); return 0; },
      work: async () => { calls.push("work"); },
    });

    expect(calls).toEqual(["work", "update"]);
  });

  it("persists cadence independently for each profile across restarts", async () => {
    const root = home();
    const updates: string[] = [];
    const invoke = (profile: string) => runWithAutoUpdate({
      home: root,
      profile,
      config: config({ everyRuns: 2 }),
      update: async () => { updates.push(profile); return 0; },
      work: async () => {},
    });

    await invoke("oncall");
    await invoke("plans");
    await invoke("oncall");
    await invoke("plans");

    expect(updates).toEqual(["oncall", "plans"]);
    expect(JSON.parse(fs.readFileSync(autoUpdatePath(root, "oncall"), "utf8"))).toEqual({ runs: 2 });
  });

  it("does not invoke update when disabled or between due ordinals", async () => {
    const root = home();
    let updates = 0;
    const update = async () => { updates += 1; return 0; };

    await runWithAutoUpdate({ home: root, profile: "oncall", config: config({ enabled: false }), update, work: async () => {} });
    await runWithAutoUpdate({ home: root, profile: "plans", config: config({ everyRuns: 2 }), update, work: async () => {} });

    expect(updates).toBe(0);
  });

  it("holds an after-timed daemon update until its child has ended", () => {
    const root = home();
    const schedule = beginAutoUpdateInvocation(root, "oncall", config({ everyRuns: 1, timing: "after" }));

    expect(schedule).toEqual({ due: true, timing: "after" });
    markDaemonUpdate(root, "oncall");
    expect(takeDaemonUpdate(root, "oncall")).toBe(true);
    // The claim stays visible while the detached reaper runs, so a new start
    // cannot clear the dead daemon record and lose this due update.
    expect(hasDaemonUpdate(root, "oncall")).toBe(true);
    expect(takeDaemonUpdate(root, "oncall")).toBe(false);
    finishDaemonUpdate(root, "oncall");
    expect(hasDaemonUpdate(root, "oncall")).toBe(false);
  });

  it("fails the workflow invocation when its scheduled update fails", async () => {
    let worked = false;

    await expect(runWithAutoUpdate({
      home: home(),
      profile: "oncall",
      config: config({ everyRuns: 1 }),
      update: async () => 1,
      work: async () => { worked = true; },
    })).rejects.toThrow("amy update failed");

    expect(worked).toBe(false);
  });
});
