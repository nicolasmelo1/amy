import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { Event } from "@amykit/core";
import { FileEventLog } from "../src/FileEventLog.js";

let root: string;

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), "amy-log-stamp-"));
});

afterEach(() => {
  fs.rmSync(root, { recursive: true, force: true });
});

const event = (overrides: Partial<Event> = {}): Event => ({
  at: "2026-09-03T12:00:00.000Z",
  kind: "stop.requested",
  ...overrides,
});

describe("which build wrote the line", () => {
  it("stamps every line, so no caller has to remember", () => {
    // A field each caller sets by hand is a field that goes missing on the
    // one code path nobody tested.
    const log = new FileEventLog(root, () => new Date(), "0.3.1+83ef192");
    log.append(event());

    expect(log.read()[0]?.build).toBe("0.3.1+83ef192");
  });

  it("leaves a line that already names a build alone", () => {
    // A line copied in from another machine keeps saying who really wrote it,
    // which is the whole reason the field exists.
    const log = new FileEventLog(root, () => new Date(), "0.3.1+83ef192");
    log.append(event({ build: "0.2.0+aaaaaaa" }));

    expect(log.read()[0]?.build).toBe("0.2.0+aaaaaaa");
  });

  it("keeps the stamp on disk, not just in memory", () => {
    const log = new FileEventLog(root, () => new Date(), "0.3.1+83ef192");
    log.append(event());

    const line = fs.readFileSync(path.join(root, "2026-09-03.jsonl"), "utf-8").trim();

    expect(JSON.parse(line).build).toBe("0.3.1+83ef192");
  });

  it("says `dev` when running from a checkout", () => {
    // The default comes from the compile-time defines, which are undefined
    // under node, so a dev run is visibly not a build.
    const log = new FileEventLog(root);
    log.append(event());

    expect(log.read()[0]?.build).toBe("dev");
  });
});
