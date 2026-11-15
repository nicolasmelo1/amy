import type { ChildProcessWithoutNullStreams } from "node:child_process";
import { createInterface } from "node:readline";
import { CommandRunner } from "@amykit/core";
import type { UsageReader, UsageResult, UsageWindow } from "@amykit/agent-kit";

export interface ClaudeUsageReaderOptions {
  /** How long Claude Code has to answer, in milliseconds. */
  readonly timeoutMs?: number;
  /** The CLI to ask; a test points it at a stand-in. */
  readonly command?: string;
}

/**
 * Claude Code with nothing of the operator's own: no settings, hooks, MCP
 * servers or kept session. Print mode with stream-json input is what lets a
 * control request reach it with no prompt.
 */
export const CLAUDE_PROBE_ARGS = [
  "-p",
  "--input-format",
  "stream-json",
  "--output-format",
  "stream-json",
  "--verbose",
  "--setting-sources",
  "",
  "--strict-mcp-config",
  "--no-session-persistence",
] as const;

/** How long Claude Code has to answer `get_usage`; a probe reads, it never runs. */
const DEFAULT_TIMEOUT_MS = 15_000;

/** The windows `get_usage` reports, and the label each is shown under. */
const WINDOWS = [
  ["five_hour", "five-hour"],
  ["seven_day", "seven-day"],
  ["seven_day_opus", "seven-day-opus"],
  ["seven_day_sonnet", "seven-day-sonnet"],
] as const;

/**
 * Reads Claude's account windows by asking Claude Code itself.
 *
 * The token, the Keychain item and the credentials file stay Claude Code's:
 * `get_usage` is a control request over a short-lived print-mode child, so no
 * model call and no agent turn happens. A runner without a managed spawn
 * cannot hold that child open, and reads as unavailable.
 */
export class ClaudeUsageReader implements UsageReader {
  readonly label = "Claude";

  constructor(
    private readonly runner: CommandRunner,
    private readonly options: ClaudeUsageReaderOptions = {},
  ) {}

  async read(): Promise<UsageResult> {
    const spawn = this.runner.spawn;
    if (!spawn) return unavailable("this runner cannot start claude");
    try {
      return await probe(spawn.bind(this.runner), this.options);
    } catch (error) {
      return unavailable(reason(error));
    }
  }
}

/** Normalizes a `get_usage` answer; a plan whose limits do not apply has none. */
export function parseClaudeUsage(response: unknown): UsageResult {
  if (!record(response)) return unavailable("get_usage returned no answer");
  if (response.rate_limits_available === false) return unavailable("Claude Code reports no rate limits for this sign-in");
  const limits = record(response.rate_limits) ? response.rate_limits : undefined;
  if (response.rate_limits_available !== true || !limits) return unavailable("Claude Code did not report rate limits");

  const windows = WINDOWS.flatMap(([key, label]) => {
    const window = windowOf(label, limits[key]);
    return window ? [window] : [];
  });
  return windows.length > 0 ? { windows } : unavailable("Claude Code reported no measured windows");
}

type Spawn = NonNullable<CommandRunner["spawn"]>;

/** One short-lived CLI, asked for its windows and ended once it answers. */
function probe(spawn: Spawn, options: ClaudeUsageReaderOptions): Promise<UsageResult> {
  const command = options.command ?? "claude";
  return new Promise((resolve) => {
    let child: ChildProcessWithoutNullStreams;
    try {
      child = spawn(command, [...CLAUDE_PROBE_ARGS]);
    } catch (error) {
      resolve(unavailable(`could not start ${command}: ${reason(error)}`));
      return;
    }
    new Probe(child, command, options.timeoutMs ?? DEFAULT_TIMEOUT_MS, resolve).start();
  });
}

/** What a `control_response` line carries, as far as this reader reads it. */
interface Answer {
  readonly request_id?: unknown;
  readonly subtype?: unknown;
  readonly response?: unknown;
  readonly error?: unknown;
}

class Probe {
  private answered = false;
  private readonly timer: ReturnType<typeof setTimeout>;

  constructor(
    private readonly child: ChildProcessWithoutNullStreams,
    private readonly command: string,
    private readonly timeoutMs: number,
    private readonly settle: (result: UsageResult) => void,
  ) {
    this.timer = setTimeout(() => this.finish(unavailable(`${command} did not answer in ${timeoutMs}ms`)), timeoutMs);
  }

  start(): void {
    this.child.stdin.on("error", () => {});
    this.child.on("error", (error) => this.finish(unavailable(`could not start ${this.command}: ${reason(error)}`)));
    this.child.on("close", () => this.finish(unavailable(`${this.command} ended before answering`)));
    createInterface({ input: this.child.stdout, crlfDelay: Number.POSITIVE_INFINITY }).on("line", (line) =>
      this.onLine(line),
    );
    this.send({ type: "control_request", request_id: "init", request: { subtype: "initialize" } });
  }

  private send(message: unknown): void {
    try {
      this.child.stdin.write(`${JSON.stringify(message)}\n`);
    } catch {
      // Its end settles the probe.
    }
  }

  private onLine(line: string): void {
    const answer = responseOf(line);
    if (!answer) return;
    if (answer.request_id === "init") this.afterInitialize(answer);
    else if (answer.request_id === "usage") this.finish(usageAnswer(answer));
  }

  private afterInitialize(answer: Answer): void {
    if (answer.subtype !== "success") return this.finish(unavailable(`${this.command} answered initialize with ${said(answer)}`));
    this.send({ type: "control_request", request_id: "usage", request: { subtype: "get_usage", skip_behaviors: true } });
  }

  private finish(result: UsageResult): void {
    if (this.answered) return;
    this.answered = true;
    clearTimeout(this.timer);
    this.child.kill("SIGKILL");
    this.settle(result);
  }
}

/** The answer inside one stream-json line, when the line is a control response. */
function responseOf(line: string): Answer | undefined {
  let message: unknown;
  try {
    message = JSON.parse(line);
  } catch {
    return undefined;
  }
  if (!record(message) || message.type !== "control_response") return undefined;
  return record(message.response) ? message.response : undefined;
}

/** What Claude Code answered a control request with, for a person to read. */
function said(answer: Answer): string {
  const word = typeof answer.subtype === "string" ? answer.subtype : "nothing";
  return typeof answer.error === "string" && answer.error ? `${word}: ${answer.error}` : word;
}

function usageAnswer(answer: Answer): UsageResult {
  if (answer.subtype !== "success") return unavailable(`get_usage was answered with ${said(answer)}`);
  return parseClaudeUsage(answer.response);
}

function windowOf(label: string, value: unknown): UsageWindow | undefined {
  if (!record(value) || typeof value.utilization !== "number" || !Number.isFinite(value.utilization)) return undefined;
  const resetsAt = resetOf(value.resets_at);
  return {
    label,
    usedPercent: Math.max(0, Math.min(100, value.utilization)),
    ...(resetsAt ? { resetsAt } : {}),
  };
}

/** A reset time is an ISO date; anything Claude Code sends otherwise is not one. */
function resetOf(value: unknown): string | undefined {
  return typeof value === "string" && !Number.isNaN(Date.parse(value)) ? value : undefined;
}

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function unavailable(why: string): UsageResult {
  return { unavailable: `Claude usage is unavailable: ${why}` };
}

function reason(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
