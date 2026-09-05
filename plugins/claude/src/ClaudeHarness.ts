import { AgentRun, CommandRunner, Harness, HarnessReply } from "@amykit/core";
import { costOf, specFor } from "@amykit/model-specs";
import { ParsedRun, parseRun } from "./envelope.js";

export interface ClaudeHarnessConfig {
  /** Passed to the CLI as --model. Omit to use whatever the CLI defaults to. */
  model?: string;
  timeoutMs?: number;
}

/**
 * The `claude` CLI, and everything knowable about what a call to it took.
 *
 * `--output-format json` is what makes the run measurable rather than
 * guessed: it returns the answer, the token counts, the cost the harness
 * itself worked out, and an error status to classify on.
 */
export class ClaudeHarness implements Harness {
  readonly name = "claude";

  constructor(
    private readonly runner: CommandRunner,
    private readonly config: ClaudeHarnessConfig = {},
  ) {}

  async ask(prompt: string, cwd: string): Promise<HarnessReply> {
    const asked = this.config.model ?? "";
    const args: string[] = [];
    if (this.config.model) {
      args.push("--model", this.config.model);
    }
    args.push("--output-format", "json", "-p");

    const started = Date.now();
    const result = await this.runner.run("claude", args, {
      cwd,
      stdin: prompt,
      timeoutMs: this.config.timeoutMs,
    });
    const elapsed = Date.now() - started;

    const parsed = parseRun(result.stdout, result.ok, asked);
    return { text: parsed.text, run: this.account(parsed, elapsed, result.stderr) };
  }

  /**
   * Turns a parsed run into the account the engine logs and the budget spends.
   *
   * A cost the harness reported wins, because it knows the plan and the
   * discounts. Failing that, the vendored table computes one and says so. A
   * model the table has never heard of leaves the cost absent rather than
   * inventing a rate to spend against a ceiling.
   */
  private account(parsed: ParsedRun, elapsedMs: number, stderr: string): AgentRun {
    let costUsd = parsed.costUsd;
    let costSource = parsed.costSource;

    if (costUsd === undefined && parsed.tokens) {
      const spec = specFor(parsed.model);
      if (spec) {
        costUsd = costOf(spec, parsed.tokens);
        costSource = "computed";
      }
    }

    return {
      outcome: parsed.outcome,
      harness: this.name,
      model: parsed.model,
      tokens: parsed.tokens,
      costUsd,
      costSource,
      durationMs: parsed.durationMs ?? elapsedMs,
      output: [parsed.text, stderr].filter(Boolean).join("\n").trim(),
    };
  }
}
