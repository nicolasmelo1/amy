/**
 * Review of PR #226 against docs/design/claudes-usage-is-read-without-its-token.md,
 * as tests that are red until the reader keeps the plan. Each `describe` is
 * one severity; each test names the criterion it holds the reader to.
 *
 * The stand-ins here are real processes behind the real `NodeCommandRunner`:
 * a pipe that fills, a tree that survives a kill and a line on stderr are
 * things a mocked child cannot show.
 */
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { NodeCommandRunner } from "@amykit/core";
import { ClaudeUsageReader, parseClaudeUsage } from "../src/usage.js";

/** Every synchronous command started in this file, beside the runner's managed spawn. */
const beside = vi.hoisted(() => [] as string[]);
vi.mock("node:child_process", async (original) => {
  const actual = await original<typeof import("node:child_process")>();
  const recorded = <F extends (...args: never[]) => unknown>(name: string, run: F): F =>
    ((...args: Parameters<F>) => {
      beside.push(`${name} ${String(args[0])}`);
      return run(...args);
    }) as F;
  return {
    ...actual,
    execFileSync: recorded("execFileSync", actual.execFileSync),
    execSync: recorded("execSync", actual.execSync),
    spawnSync: recorded("spawnSync", actual.spawnSync),
  };
});

const FIXTURES = new URL("./fixtures/", import.meta.url);

/** Recorded 2026-11-15 from Claude Code 2.1.325; the initialize answer keeps only the version. */
const RECORDED_2_1_325 = fs.readFileSync(new URL("get-usage-2.1.325.jsonl", FIXTURES), "utf8").trim().split("\n");

const made: string[] = [];
const started: number[] = [];

afterEach(() => {
  for (const pid of started.splice(0)) {
    try {
      process.kill(pid, "SIGKILL");
    } catch {
      // already gone
    }
  }
  for (const dir of made.splice(0)) fs.rmSync(dir, { recursive: true, force: true });
});

/** A stand-in `claude` as a shell script, answering the probe the way `body` says. */
function standIn(body: string): { command: string; dir: string } {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "claude-usage-review-"));
  made.push(dir);
  const command = path.join(dir, "claude");
  fs.writeFileSync(command, `#!/bin/sh\n${body}\n`, { mode: 0o755 });
  return { command, dir };
}

/** Answers initialize, then get_usage with the recorded line, then waits to be ended. */
const ANSWERS_THE_RECORDING = (recording: string) => `
read -r init
sed -n 1p '${recording}'
read -r usage
sed -n 2p '${recording}'
while read -r more; do :; done`;

function alive(pid: number): boolean {
  try {
    process.kill(pid, 0);
  } catch {
    return false;
  }
  // A zombie still answers signal 0 until it is reaped; it is not running.
  const state = execFileSync("ps", ["-o", "stat=", "-p", String(pid)], { encoding: "utf8" }).trim();
  return state !== "" && !state.startsWith("Z");
}

function recordingFile(): string {
  const { dir } = standIn("");
  const file = path.join(dir, "recording.jsonl");
  fs.writeFileSync(file, `${RECORDED_2_1_325.join("\n")}\n`);
  return file;
}

describe("high: A1 is proven against what Claude Code really answers", () => {
  it("normalizes the 2.1.325 recording, whose resets carry microseconds and an offset, to ISO instants", () => {
    const answer = JSON.parse(RECORDED_2_1_325[1]!).response.response;

    // Codex and Hermes give `toISOString()` resets (A7: one normalized shape);
    // Claude Code sends `2026-11-15T19:19:59.758635+00:00`.
    expect(parseClaudeUsage(answer)).toEqual({
      windows: [
        { label: "five-hour", usedPercent: 2, resetsAt: "2026-11-15T19:19:59.758Z" },
        { label: "seven-day", usedPercent: 30, resetsAt: "2026-11-16T17:59:59.758Z" },
      ],
    });
  });

  it("asks a stand-in replaying the 2.1.325 recording and gets the same normalized windows", async () => {
    const { command } = standIn(ANSWERS_THE_RECORDING(recordingFile()));

    await expect(new ClaudeUsageReader(new NodeCommandRunner(), { command, timeoutMs: 5000 }).read()).resolves.toEqual({
      windows: [
        { label: "five-hour", usedPercent: 2, resetsAt: "2026-11-15T19:19:59.758Z" },
        { label: "seven-day", usedPercent: 30, resetsAt: "2026-11-16T17:59:59.758Z" },
      ],
    });
  });

  it("keeps only recordings as get_usage fixtures: each names the Claude Code version its file is named for", () => {
    // get-usage-2.1.322.jsonl was transcribed, not recorded: its initialize
    // answer carries no version and its shape (top-level total_cost_usd, `Z`
    // resets) is not what the CLI sends. The gate's stand-in must replay a
    // recording, so the transcription goes and the scenario follows.
    const fixtures = fs.readdirSync(FIXTURES).filter((name) => /^get-usage-.*\.jsonl$/.test(name));

    for (const name of fixtures) {
      const version = /^get-usage-(.+)\.jsonl$/.exec(name)![1];
      const init = JSON.parse(fs.readFileSync(new URL(name, FIXTURES), "utf8").split("\n")[0]!);
      expect({ name, version: init.response?.response?.claude_code_version }).toEqual({ name, version });
    }
  });
});

describe("medium: A4, a probe that goes wrong is unavailable naming why, and nothing of it is left running", () => {
  it("still reads the windows when Claude Code writes more to stderr than a pipe holds", async () => {
    // The managed spawn pipes stderr; nobody reads it, so a chatty CLI blocks
    // on write and a healthy answer becomes a timeout.
    const { command } = standIn(`head -c 300000 /dev/zero | tr '\\0' w >&2\n${ANSWERS_THE_RECORDING(recordingFile())}`);

    const result = await new ClaudeUsageReader(new NodeCommandRunner(), { command, timeoutMs: 3000 }).read();

    expect(result).toHaveProperty("windows");
  });

  it("names what Claude Code said when it ends before answering", async () => {
    const { command } = standIn(`echo 'Not logged in · Please run /login' >&2\nexit 1`);

    const result = await new ClaudeUsageReader(new NodeCommandRunner(), { command, timeoutMs: 5000 }).read();

    expect(result).toEqual({ unavailable: expect.stringContaining("Not logged in · Please run /login") });
  });

  it("kills a hung probe with everything it started", async () => {
    const { command, dir } = standIn(`sleep 60 &\necho $! > "$(dirname "$0")/pid"\nwhile read -r line; do :; done`);

    const result = await new ClaudeUsageReader(new NodeCommandRunner(), { command, timeoutMs: 300 }).read();
    const pid = Number(fs.readFileSync(path.join(dir, "pid"), "utf8"));
    started.push(pid);
    await new Promise((resolve) => setTimeout(resolve, 100));

    expect(result).toEqual({ unavailable: `Claude usage is unavailable: ${command} did not answer in 300ms` });
    expect(alive(pid)).toBe(false);
  });
});

describe("low: A3, the probe reads only the answer to what it asked", () => {
  it("does not take a get_usage answer printed before initialize was answered and get_usage asked", async () => {
    // Prints the usage line first and never answers initialize: nothing was asked.
    const { command } = standIn(`sed -n 2p '${recordingFile()}'\nwhile read -r line; do :; done`);

    const result = await new ClaudeUsageReader(new NodeCommandRunner(), { command, timeoutMs: 300 }).read();

    expect(result).toEqual({ unavailable: `Claude usage is unavailable: ${command} did not answer in 300ms` });
  });
});

describe("medium (round 2): the probe's tree is ended through the runner, not beside it", () => {
  it("runs no command of its own to end the probe: no ps, no taskkill, nothing synchronous", async () => {
    // CommandRunner: "Every adapter that shells out goes through this". A
    // synchronous ps per read also blocks the process that asked. A probe in
    // its own process group ends with one signal to the group.
    const { command } = standIn(ANSWERS_THE_RECORDING(recordingFile()));
    beside.length = 0;

    await new ClaudeUsageReader(new NodeCommandRunner(), { command, timeoutMs: 5000 }).read();

    expect(beside).toEqual([]);
  });
});

describe("low (round 2): what an early end says, and the plan that says it", () => {
  it("says why Claude Code ended on one line, whatever it wrote to stderr", async () => {
    const { command } = standIn(`echo 'warning: something noisy' >&2\necho 'Not logged in · Please run /login' >&2\nexit 1`);

    const result = await new ClaudeUsageReader(new NodeCommandRunner(), { command, timeoutMs: 5000 }).read();

    expect(result).toEqual({ unavailable: expect.stringContaining("Not logged in · Please run /login") });
    expect((result as { unavailable: string }).unavailable).not.toMatch(/\n/);
  });

  it("the delivered plan names only files that exist and the recording that proves it", () => {
    const repo = new URL("../../../", import.meta.url);
    const plan = fs.readFileSync(new URL("docs/design/claudes-usage-is-read-without-its-token.md", repo), "utf8");
    const lines = plan.split("\n");
    const from = lines.indexOf("touches:") + 1;
    const touches: string[] = [];
    for (const line of lines.slice(from)) {
      if (!line.startsWith("  - ")) break;
      touches.push(line.slice("  - ".length));
    }

    expect(touches.filter((file) => !fs.existsSync(new URL(file, repo)))).toEqual([]);
    expect(plan).not.toContain("2.1.322");
  });
});
