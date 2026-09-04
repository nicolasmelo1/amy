import { AgentOutcome, AgentRun, CommandRunner, Harness, HarnessReply, TokenUsage } from "@amy/core";
import { costOf, specFor } from "@amy/model-specs";

export interface CodexHarnessConfig {
  model?: string;
  timeoutMs?: number;
}

interface CodexEvent {
  type?: string;
  item?: { type?: string; text?: string };
  usage?: {
    input_tokens?: number;
    cached_input_tokens?: number;
    cache_write_input_tokens?: number;
    output_tokens?: number;
    reasoning_output_tokens?: number;
  };
}

/**
 * The `codex` CLI, over the JSONL event stream `exec --json` prints.
 *
 * The stream ends with a `turn.completed` carrying the usage, and the answer
 * arrives as an `agent_message` item along the way.
 */
export class CodexHarness implements Harness {
  readonly name = "codex";

  constructor(
    private readonly runner: CommandRunner,
    private readonly config: CodexHarnessConfig = {},
  ) {}

  async ask(prompt: string, cwd: string): Promise<HarnessReply> {
    const args = ["exec", "--json", "--sandbox", "workspace-write"];
    if (this.config.model) {
      args.push("--model", this.config.model);
    }
    // amy always runs in a checkout it prepared itself, so the repository
    // check is redundant here, and without skipping it an untrusted-directory
    // prompt would hang a run nobody is watching.
    args.push("--skip-git-repo-check", "-");

    const started = Date.now();
    const result = await this.runner.run("codex", args, {
      cwd,
      stdin: prompt,
      timeoutMs: this.config.timeoutMs,
    });

    const events = parseEvents(result.stdout);
    const text = messageOf(events);
    const tokens = tokensOf(events);
    const outcome = classify(events, result.ok, Boolean(text));

    let costUsd: number | undefined;
    let costSource: AgentRun["costSource"] = "unknown";
    const model = this.config.model ?? "";

    // Codex reports tokens and never a price, so a cost here is always
    // computed or absent.
    if (tokens) {
      const spec = specFor(model);
      if (spec) {
        costUsd = costOf(spec, tokens);
        costSource = "computed";
      }
    }

    return {
      text,
      run: {
        outcome,
        harness: this.name,
        // The events do not echo the model, so this is what was asked for.
        // A fallback inside codex would not be visible here.
        model,
        tokens,
        costUsd,
        costSource,
        durationMs: Date.now() - started,
        output: [text, result.stderr].filter(Boolean).join("\n").trim(),
      },
    };
  }
}

/** One JSON object per line, and a line that does not parse is skipped. */
export function parseEvents(stdout: string): CodexEvent[] {
  return stdout
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.startsWith("{"))
    .flatMap((line) => {
      try {
        return [JSON.parse(line) as CodexEvent];
      } catch {
        return [];
      }
    });
}

/** The last thing the agent said, which is its answer. */
export function messageOf(events: readonly CodexEvent[]): string {
  const messages = events
    .filter((event) => event.type === "item.completed" && event.item?.type === "agent_message")
    .map((event) => event.item?.text ?? "");

  return messages.at(-1) ?? "";
}

/**
 * The token counts, from the `turn.completed` event.
 *
 * `input_tokens` is the **total** input including what was served from cache,
 * so the cached part is subtracted out. Mapping both straight across would
 * count those tokens twice, which inflates every cost and every budget.
 * Hermes uses the opposite convention for the same field name, which is why
 * this is spelled out rather than shared.
 */
export function tokensOf(events: readonly CodexEvent[]): TokenUsage | undefined {
  const usage = events.filter((event) => event.usage).at(-1)?.usage;
  if (!usage) return undefined;

  const cacheRead = usage.cached_input_tokens ?? 0;
  const total = usage.input_tokens ?? 0;

  return {
    input: Math.max(total - cacheRead, 0),
    output: usage.output_tokens ?? 0,
    cacheRead,
    cacheWrite: usage.cache_write_input_tokens ?? 0,
  };
}

/**
 * Which outcome this was.
 *
 * Codex publishes no error status in the stream, so this is the exit code and
 * whether a turn finished. A rate limit therefore reads as `failed` here
 * rather than `rate-limited`, which is honest: inventing the distinction from
 * stderr text is what this design set out to avoid.
 */
export function classify(
  events: readonly CodexEvent[],
  exitOk: boolean,
  gotMessage: boolean,
): AgentOutcome {
  if (events.length === 0) return "abandoned";
  if (events.some((event) => event.type === "turn.failed")) return "failed";
  if (!exitOk) return "failed";
  return gotMessage ? "completed" : "failed";
}
