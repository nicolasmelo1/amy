import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { clearDaemon, isAlive, readDaemon, running, writeDaemon } from "../src/daemon.js";

describe("the loop that is running", () => {
  let home: string;
  let file: string;

  beforeEach(() => {
    home = fs.mkdtempSync(path.join(os.tmpdir(), "amy-daemon-"));
    file = path.join(home, "daemon.pid");
  });

  afterEach(() => fs.rmSync(home, { recursive: true, force: true }));

  const record = (pid: number) => ({ pid, workflow: "oncall", startedAt: "2026-09-05T00:00:00.000Z" });

  it("is nothing when nothing was ever written", () => {
    expect(running(file)).toBeUndefined();
    expect(readDaemon(file)).toBeUndefined();
  });

  it("is what was written, while that process is alive", () => {
    writeDaemon(file, record(process.pid));

    expect(running(file)).toMatchObject({ pid: process.pid, workflow: "oncall" });
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

  it("knows this process is alive and a made-up one is not", () => {
    expect(isAlive(process.pid)).toBe(true);
    expect(isAlive(0x7fffffff)).toBe(false);
  });
});
