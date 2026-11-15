import type { ChildProcessWithoutNullStreams } from "node:child_process";
import { EventEmitter } from "node:events";
import fs from "node:fs";
import { createInterface } from "node:readline";
import { PassThrough } from "node:stream";
import { afterEach, describe, expect, it, vi } from "vitest";
import { contributeUsage, USAGE_COLLECTION, type UsageReader } from "@amykit/agent-kit";
import { definePlugin, HostServices, mount, type CommandRunner } from "@amykit/core";
import { ScriptedRunner } from "@amykit/test-fixtures";
import { plugin } from "../src/plugin.js";
import { CLAUDE_PROBE_ARGS, ClaudeUsageReader, parseClaudeUsage } from "../src/usage.js";

const RECORDED = fs.readFileSync(new URL("./fixtures/get-usage-2.1.322.jsonl", import.meta.url), "utf8");
const RECORDED_LINES = RECORDED.trim().split("\n");

const WINDOWS = [
  { label: "five-hour", usedPercent: 42, resetsAt: "2026-11-12T17:00:00.000Z" },
  { label: "seven-day", usedPercent: 18, resetsAt: "2026-11-18T03:00:00.000Z" },
];

/** A child whose stdin is read as control requests and whose stdout answers them. */
class ProbeChild extends EventEmitter {
  readonly stdout = new PassThrough();
  readonly stderr = new PassThrough();
  readonly stdin = new PassThrough();
  readonly requests: Record<string, unknown>[] = [];
  killed = false;

  constructor(answer: (request: Record<string, unknown>) => readonly string[]) {
    super();
    createInterface({ input: this.stdin }).on("line", (line) => {
      const request = JSON.parse(line) as Record<string, unknown>;
      this.requests.push(request);
      for (const out of answer(request)) this.stdout.write(`${out}\n`);
    });
  }

  kill(): boolean {
    this.killed = true;
    this.emit("close");
    return true;
  }
}

/** A runner with a managed spawn, holding the child a probe would ask. */
class ProbeRunner implements CommandRunner {
  readonly spawned: { command: string; args: readonly string[] }[] = [];
  readonly children: ProbeChild[] = [];

  constructor(
    private readonly answer: (request: Record<string, unknown>) => readonly string[] = () => [],
    private readonly afterSpawn: (child: ProbeChild) => void = () => {},
  ) {}

  async run(): Promise<never> {
    throw new Error("the usage reader must run no command");
  }

  spawn(command: string, args: readonly string[]): ChildProcessWithoutNullStreams {
    this.spawned.push({ command, args });
    const child = new ProbeChild(this.answer);
    this.children.push(child);
    this.afterSpawn(child);
    return child as unknown as ChildProcessWithoutNullStreams;
  }
}

/** The recorded answer to one control request the probe sent. */
function recordedAnswer(request: Record<string, unknown>): readonly string[] {
  return RECORDED_LINES.filter((line) => line.includes(`"request_id":"${String(request.request_id)}"`));
}

const host: HostServices = { runner: new ScriptedRunner(), now: () => new Date(), paths: { state: "/state" } };

describe("Claude account usage", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it("contributes one reader without starting an agent turn", async () => {
    const mounted = await mount([plugin], {}, host);

    expect(mounted.ok && [...mounted.mounted.contributions.get(USAGE_COLLECTION)!.keys()]).toEqual(["Claude"]);
  });

  it("normalizes the recorded get_usage answer", () => {
    const answer = JSON.parse(RECORDED_LINES[1]!).response.response;

    expect(parseClaudeUsage(answer)).toEqual({ windows: WINDOWS });
  });

  it("shows opus and sonnet windows only when Claude reports them", () => {
    const opus = "2026-11-20T00:00:00.000Z";

    expect(
      parseClaudeUsage({
        rate_limits_available: true,
        rate_limits: {
          five_hour: { utilization: 42, resets_at: "2026-11-12T17:00:00.000Z" },
          seven_day: { utilization: 18, resets_at: "2026-11-18T03:00:00.000Z" },
          seven_day_opus: { utilization: 9, resets_at: opus },
          seven_day_sonnet: null,
        },
      }),
    ).toEqual({ windows: [...WINDOWS, { label: "seven-day-opus", usedPercent: 9, resetsAt: opus }] });
  });

  it("asks Claude Code for its windows and ends the child once answered", async () => {
    const runner = new ProbeRunner(recordedAnswer);
    const reader = new ClaudeUsageReader(runner, { timeoutMs: 5000 });

    await expect(reader.read()).resolves.toEqual({ windows: WINDOWS });
    expect(runner.spawned).toEqual([{ command: "claude", args: [...CLAUDE_PROBE_ARGS] }]);
    expect(runner.children[0]!.requests).toEqual([
      { type: "control_request", request_id: "init", request: { subtype: "initialize" } },
      { type: "control_request", request_id: "usage", request: { subtype: "get_usage", skip_behaviors: true } },
    ]);
    expect(runner.children[0]!.killed).toBe(true);
  });

  it("reads no credential and passes no prompt or token to the child", async () => {
    vi.stubEnv("CLAUDE_CODE_OAUTH_TOKEN", "secret-token");
    const read = vi.spyOn(fs, "readFileSync");
    const runner = new ProbeRunner(recordedAnswer);

    await new ClaudeUsageReader(runner).read();

    expect(read).not.toHaveBeenCalled();
    expect(runner.spawned).toEqual([{ command: "claude", args: [...CLAUDE_PROBE_ARGS] }]);
    expect(JSON.stringify(runner.children[0]!.requests)).not.toContain("secret-token");
    expect(CLAUDE_PROBE_ARGS.join(" ")).not.toMatch(/prompt|--model|--permission-mode/);
  });

  it("says why a plan without rate limits is unavailable", () => {
    expect(parseClaudeUsage({ rate_limits_available: false })).toEqual({
      unavailable: "Claude usage is unavailable: Claude Code reports no rate limits for this sign-in",
    });
    expect(parseClaudeUsage({ rate_limits_available: true, rate_limits: {} })).toEqual({
      unavailable: "Claude usage is unavailable: Claude Code reported no measured windows",
    });
    expect(parseClaudeUsage("not an answer")).toEqual({
      unavailable: "Claude usage is unavailable: get_usage returned no answer",
    });
  });

  it("says why an error answer is unavailable", async () => {
    const runner = new ProbeRunner((request) =>
      request.request_id === "usage"
        ? [JSON.stringify({ type: "control_response", response: { request_id: "usage", subtype: "error", error: "get_usage is unknown" } })]
        : recordedAnswer(request),
    );

    await expect(new ClaudeUsageReader(runner, { timeoutMs: 5000 }).read()).resolves.toEqual({
      unavailable: "Claude usage is unavailable: get_usage was answered with error: get_usage is unknown",
    });
    expect(runner.children[0]!.killed).toBe(true);
  });

  it("kills a child that never answers and says how long it waited", async () => {
    const runner = new ProbeRunner();

    await expect(new ClaudeUsageReader(runner, { timeoutMs: 20 }).read()).resolves.toEqual({
      unavailable: "Claude usage is unavailable: claude did not answer in 20ms",
    });
    expect(runner.children[0]!.killed).toBe(true);
  });

  it("says a child that ended first is unavailable", async () => {
    const runner = new ProbeRunner(
      () => [],
      (child) => setTimeout(() => child.emit("close"), 0),
    );

    await expect(new ClaudeUsageReader(runner, { timeoutMs: 5000 }).read()).resolves.toEqual({
      unavailable: "Claude usage is unavailable: claude ended before answering",
    });
  });

  it("reads Claude as unavailable while another runner and reader still answer", async () => {
    const other = definePlugin({
      name: "@fixture/other-usage",
      configSchema: {},
      register(registry) {
        contributeUsage(registry, {
          label: "Other",
          read: async () => ({ windows: [{ label: "Session", usedPercent: 12 }] }),
        });
      },
    });
    const mounted = await mount([plugin, other], {}, host);
    if (!mounted.ok) throw new Error("the fixture machine did not mount");
    const readers = [...mounted.mounted.contributions.get(USAGE_COLLECTION)!.values()] as UsageReader[];

    expect(await Promise.all(readers.map((reader) => reader.read()))).toEqual([
      { unavailable: "Claude usage is unavailable: this runner cannot start claude" },
      { windows: [{ label: "Session", usedPercent: 12 }] },
    ]);
  });
});
