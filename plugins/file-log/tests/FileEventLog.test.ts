import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { Event } from "@amykit/core";
import { FileEventLog } from "../src/FileEventLog.js";

const DAY_ONE = "2026-09-03T12:00:00.000Z";
const DAY_TWO = "2026-09-04T09:00:00.000Z";

describe("FileEventLog", () => {
  let root: string;
  let log: FileEventLog;

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), "amy-log-"));
    log = new FileEventLog(root);
  });

  afterEach(() => {
    fs.rmSync(root, { recursive: true, force: true });
  });

  it("reads back what it appended, plus which build wrote it", () => {
    log.append({ at: DAY_ONE, kind: "run.claimed", workId: "W-1" });

    // `build` is added by the log itself, so it is part of what comes back.
    expect(log.read()).toEqual([
      { at: DAY_ONE, kind: "run.claimed", workId: "W-1", build: "dev" },
    ]);
  });

  it("keeps one file per day, named by the day", () => {
    log.append({ at: DAY_ONE, kind: "run.claimed" });
    log.append({ at: DAY_TWO, kind: "run.idle" });

    expect(fs.readdirSync(root).sort()).toEqual(["2026-09-03.jsonl", "2026-09-04.jsonl"]);
  });

  it("reads across days, oldest first", () => {
    log.append({ at: DAY_TWO, kind: "run.idle" });
    log.append({ at: DAY_ONE, kind: "run.claimed" });

    expect(log.read().map((e) => e.kind)).toEqual(["run.claimed", "run.idle"]);
  });

  it("reads only from the instant asked for", () => {
    log.append({ at: DAY_ONE, kind: "run.claimed" });
    log.append({ at: DAY_TWO, kind: "run.idle" });

    expect(log.read(new Date(DAY_TWO)).map((e) => e.kind)).toEqual(["run.idle"]);
  });

  it("appends rather than rewriting", () => {
    for (let i = 0; i < 5; i += 1) {
      log.append({ at: DAY_ONE, kind: "action.started", detail: { n: i } });
    }

    expect(log.read()).toHaveLength(5);
  });

  it("loses a line to a crash mid-append, not the file", () => {
    log.append({ at: DAY_ONE, kind: "run.claimed" });
    fs.appendFileSync(path.join(root, "2026-09-03.jsonl"), '{"at":"2026-09-03T12:0\n');
    log.append({ at: DAY_ONE, kind: "run.idle" });

    expect(log.read().map((e) => e.kind)).toEqual(["run.claimed", "run.idle"]);
  });

  it("keeps the detail it was given", () => {
    log.append({
      at: DAY_ONE,
      kind: "agent.run",
      workId: "W-1",
      state: "IMPLEMENTING",
      detail: { harness: "claude", model: "sonnet", outcome: "completed" },
    });

    expect(log.read()[0]?.detail).toEqual({
      harness: "claude",
      model: "sonnet",
      outcome: "completed",
    });
  });

  it("leaves out a line whose kind this build has never heard of", () => {
    log.append({ at: DAY_ONE, kind: "run.claimed" });
    fs.appendFileSync(
      path.join(root, "2026-09-03.jsonl"),
      `${JSON.stringify({ at: DAY_ONE, kind: "work.teleported" })}\n`,
    );

    // A newer build's kind, or a corrupted one. Either way an aggregate that
    // counted it would be counting something it cannot read.
    expect(log.read().map((e) => e.kind)).toEqual(["run.claimed"]);
  });

  it("writes down whatever it is given, so filtering never loses a line", () => {
    log.append({ at: DAY_ONE, kind: "work.teleported" as never });

    const written = fs.readFileSync(path.join(root, "2026-09-03.jsonl"), "utf-8");
    expect(written).toContain("work.teleported");
  });

  it("reads nothing from a directory with no days in it", () => {
    expect(new FileEventLog(path.join(root, "fresh")).read()).toEqual([]);
  });

  it("survives being reopened on the same directory", () => {
    log.append({ at: DAY_ONE, kind: "run.claimed" });

    expect(new FileEventLog(root).read()).toHaveLength(1);
  });
});

describe("FileEventLog: watching", () => {
  let root: string;
  let log: FileEventLog;
  let stop: () => void = () => undefined;

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), "amy-log-watch-"));
    log = new FileEventLog(root);
  });

  afterEach(() => {
    stop();
    fs.rmSync(root, { recursive: true, force: true });
  });

  const watching = (since = new Date(0)): Event[] => {
    const seen: Event[] = [];
    stop = log.watch(since, (event) => seen.push(event));
    return seen;
  };

  /** Appends the way the daemon does, from a process that is not this one. */
  const appendFromAnotherProcess = (events: Event[]): void => {
    const lines = events.map((event) => `${JSON.stringify(event)}\n`).join("");
    const file = path.join(root, `${events[0]?.at.slice(0, 10)}.jsonl`);
    const script = "require('fs').appendFileSync(process.argv[1], process.argv[2])";
    const child = spawnSync(process.execPath, ["-e", script, file, lines]);
    expect(child.status).toBe(0);
  };

  /** Long enough for a watch to have delivered anything it was going to. */
  const settle = () => new Promise((resolve) => setTimeout(resolve, 700));

  it("hands over what is already there from the instant asked for, oldest first", () => {
    log.append({ at: DAY_TWO, kind: "run.idle" });
    log.append({ at: DAY_ONE, kind: "run.claimed" });
    log.append({ at: "2026-09-02T12:00:00.000Z", kind: "run.claimed" });

    const seen = watching(new Date(DAY_ONE));

    expect(seen.map((e) => e.at)).toEqual([DAY_ONE, DAY_TWO]);
  });

  it("delivers an event another process appends, once, in order", async () => {
    log.append({ at: DAY_ONE, kind: "run.claimed", workId: "W-0" });
    const seen = watching();

    appendFromAnotherProcess([
      { at: "2026-09-03T12:00:01.000Z", kind: "work.advanced", workId: "W-1" },
      { at: "2026-09-03T12:00:02.000Z", kind: "work.waiting", workId: "W-2" },
    ]);

    await vi.waitFor(() => expect(seen).toHaveLength(3), { timeout: 2_000 });
    await settle();
    expect(seen.map((e) => e.workId)).toEqual(["W-0", "W-1", "W-2"]);
  });

  it("holds a line back until its newline is on disk", async () => {
    const seen = watching();
    const file = path.join(root, "2026-09-03.jsonl");

    fs.appendFileSync(file, JSON.stringify({ at: DAY_ONE, kind: "work.advanced", workId: "W-1" }));
    await settle();
    expect(seen).toEqual([]);

    fs.appendFileSync(file, "\n");
    await vi.waitFor(() => expect(seen.map((e) => e.workId)).toEqual(["W-1"]), { timeout: 2_000 });
  });

  it("follows the next day's file across midnight without being asked again", async () => {
    const seen = watching();

    log.append({ at: "2026-09-03T23:59:59.900Z", kind: "work.waiting", workId: "W-1" });
    await vi.waitFor(() => expect(seen).toHaveLength(1), { timeout: 2_000 });

    appendFromAnotherProcess([{ at: "2026-09-04T00:00:00.100Z", kind: "work.advanced", workId: "W-1" }]);

    await vi.waitFor(() => expect(seen.map((e) => e.kind)).toEqual(["work.waiting", "work.advanced"]), {
      timeout: 2_000,
    });
  });

  it("leaves out a line it cannot read, and goes on following the file", async () => {
    const seen = watching();
    const file = path.join(root, "2026-09-03.jsonl");

    fs.appendFileSync(file, '{"at":"2026-09-03T12:0\n');
    log.append({ at: DAY_ONE, kind: "run.idle" });

    await vi.waitFor(() => expect(seen.map((e) => e.kind)).toEqual(["run.idle"]), { timeout: 2_000 });
  });

  it("stops delivering, and lets go of what it held, once told to", async () => {
    // What a watch holds is a filesystem watcher and a timer. Earlier tests'
    // are let go first, so the count is this watch's alone.
    const held = () =>
      process.getActiveResourcesInfo().filter((r) => r === "FSEventWrap" || r === "Timeout").length;
    await settle();
    const before = held();
    const seen = watching();
    expect(held()).toBe(before + 2);

    stop();
    log.append({ at: DAY_ONE, kind: "run.claimed" });
    await settle();

    expect(seen).toEqual([]);
    expect(held()).toBe(before);
  });
});
