import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { AgentRun, AskContext, CommandRunner, Harness, HarnessReply } from "@amykit/core";
import { costOf, specFor } from "@amykit/model-specs";
import { ParsedRun, parseRun } from "./envelope.js";

export interface ClaudeHarnessConfig {
  /** Passed to the CLI as --model. Omit to use whatever the CLI defaults to. */
  model?: string;
  timeoutMs?: number;
}

/**
 * What keeps a run apart from the operator's own Claude.
 *
 * Without these a ticket run read the operator's personal CLAUDE.md, every
 * skill they had installed, their hooks and plugins, and kept a session and
 * an auto-memory under `~/.claude/projects`. The repository's own settings —
 * `project` and `local` — still load: they belong to the code being worked
 * on, not to the person running amy.
 */
export const ISOLATED = [
  "--setting-sources",
  "project,local",
  "--strict-mcp-config",
  "--no-session-persistence",
] as const;

/**
 * Lends one skill to a run: a fresh directory whose `.claude/skills/<name>`
 * links to where the skill is installed, for `--add-dir`.
 *
 * Dropping the user setting source drops `~/.claude/skills` with it, so the
 * skill a step was addressed to is handed over by place, and nothing else of
 * the operator's comes along. A skill whose directory is gone is not lent,
 * and the run goes ahead without it.
 */
export function lend(tmpDir: string, skill: { name: string; path: string }): string | undefined {
  if (!fs.existsSync(path.join(skill.path, "SKILL.md"))) return undefined;

  const root = fs.mkdtempSync(path.join(tmpDir, "amy-claude-skill-"));
  const skills = path.join(root, ".claude", "skills");
  fs.mkdirSync(skills, { recursive: true });
  fs.symlinkSync(skill.path, path.join(skills, skill.name), "dir");
  return root;
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
    private readonly tmpDir: string = os.tmpdir(),
  ) {}

  async ask(prompt: string, cwd: string, context: AskContext = {}): Promise<HarnessReply> {
    const asked = this.config.model ?? "";
    const args: string[] = [];
    if (this.config.model) {
      args.push("--model", this.config.model);
    }
    // Plan mode reads and does not edit or run anything, enforced by the CLI.
    if (context.readOnly) args.push("--permission-mode", "plan");
    args.push(...ISOLATED);

    const lent = context.skill ? lend(this.tmpDir, context.skill) : undefined;
    if (lent) args.push("--add-dir", lent);
    args.push("--output-format", "json", "-p");

    const started = Date.now();
    let result: Awaited<ReturnType<CommandRunner["run"]>>;
    try {
      result = await this.runner.run("claude", args, {
        cwd,
        stdin: prompt,
        timeoutMs: this.config.timeoutMs,
      });
    } finally {
      if (lent) fs.rmSync(lent, { recursive: true, force: true });
    }
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
