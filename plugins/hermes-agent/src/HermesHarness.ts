import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { AgentOutcome, AgentRun, CommandRunner, Harness, HarnessReply, TokenUsage } from "@amykit/core";
import { costOf, specFor } from "@amykit/model-specs";

export interface HermesHarnessConfig {
  model?: string;
  timeoutMs?: number;
}

/** The report `--usage-file` writes, which it writes even on a failed run. */
export interface HermesUsage {
  estimated_cost_usd?: number;
  cost_status?: string;
  cost_source?: string;
  input_tokens?: number;
  output_tokens?: number;
  cache_read_tokens?: number;
  cache_write_tokens?: number;
  model?: string;
  provider?: string;
  completed?: boolean;
  failed?: boolean;
}

/**
 * Hermes, over its one-shot mode.
 *
 * `-z` prints only the final response, and `--usage-file` writes the account
 * beside it. The account is written **even when the run fails**, which is the
 * nicest property of the three harnesses: a failed run still says what it
 * spent, so nothing is silently free.
 */
export class HermesHarness implements Harness {
  readonly name = "hermes";

  constructor(
    private readonly runner: CommandRunner,
    private readonly config: HermesHarnessConfig = {},
    private readonly tmpDir: string = os.tmpdir(),
  ) {}

  async ask(prompt: string, cwd: string): Promise<HarnessReply> {
    const report = path.join(this.tmpDir, `amy-hermes-${process.pid}-${Date.now()}.json`);
    const args = ["-z", prompt, "--usage-file", report];
    if (this.config.model) {
      args.push("-m", this.config.model);
    }

    const started = Date.now();
    const result = await this.runner.run("hermes", args, {
      cwd,
      timeoutMs: this.config.timeoutMs,
    });

    const usage = readUsage(report);
    fs.rmSync(report, { force: true });

    const tokens = tokensOf(usage);
    const model = usage?.model ?? this.config.model ?? "";

    return {
      text: result.stdout,
      run: {
        outcome: classify(usage, result.ok),
        harness: this.name,
        model,
        tokens,
        ...cost(usage, tokens, model),
        durationMs: Date.now() - started,
        output: [result.stdout, result.stderr].filter(Boolean).join("\n").trim(),
      } satisfies AgentRun,
    };
  }
}

export function readUsage(file: string): HermesUsage | undefined {
  if (!fs.existsSync(file)) return undefined;

  try {
    return JSON.parse(fs.readFileSync(file, "utf-8")) as HermesUsage;
  } catch {
    return undefined;
  }
}

/**
 * The token counts.
 *
 * `input_tokens` here **excludes** what was served from cache: the report's
 * own `total_tokens` is the sum of input, output and cache reads. That is the
 * opposite of the convention codex uses for a field of the same name, so
 * neither can borrow the other's mapping.
 */
export function tokensOf(usage: HermesUsage | undefined): TokenUsage | undefined {
  if (!usage) return undefined;

  return {
    input: usage.input_tokens ?? 0,
    output: usage.output_tokens ?? 0,
    cacheRead: usage.cache_read_tokens ?? 0,
    cacheWrite: usage.cache_write_tokens ?? 0,
  };
}

/**
 * What it cost, and how that is known.
 *
 * `cost_status: "included"` means a subscription covered the run, so zero is
 * the right answer rather than a missing one. Anything else Hermes puts in
 * `estimated_cost_usd` is, by its own word, an estimate from a price table,
 * so it is recorded as `computed` rather than `reported`: presenting somebody
 * else's estimate as a measurement is exactly what `costSource` exists to
 * stop.
 */
export function cost(
  usage: HermesUsage | undefined,
  tokens: TokenUsage | undefined,
  model: string,
): { costUsd?: number; costSource: AgentRun["costSource"] } {
  if (usage?.cost_status === "included") {
    return { costUsd: 0, costSource: "included" };
  }

  if (typeof usage?.estimated_cost_usd === "number" && usage.estimated_cost_usd > 0) {
    return { costUsd: usage.estimated_cost_usd, costSource: "computed" };
  }

  if (tokens) {
    const spec = specFor(model);
    if (spec) return { costUsd: costOf(spec, tokens), costSource: "computed" };
  }

  return { costSource: "unknown" };
}

/**
 * Which outcome this was.
 *
 * The report says plainly whether the run completed or failed, which beats
 * an exit code. Hermes publishes no quota status, so a rate limit reads as
 * `failed` rather than `rate-limited`.
 */
export function classify(usage: HermesUsage | undefined, exitOk: boolean): AgentOutcome {
  if (!usage) return exitOk ? "completed" : "abandoned";
  if (usage.failed === true) return "failed";
  if (usage.completed === true) return "completed";
  return exitOk ? "completed" : "failed";
}
