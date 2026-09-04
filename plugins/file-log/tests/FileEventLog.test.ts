import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
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
