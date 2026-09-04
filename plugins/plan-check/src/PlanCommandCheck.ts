import { CommandRunner, Git } from "@amy/core";
import { AttemptOutcome, PlanCheck } from "@amy/workflow-note-to-plan";

export interface PlanCommandCheckConfig {
  /**
   * The checks to run, per repository, falling back to the `default` entry.
   * Written as shell command lines, because that is how a repository's own
   * contributor docs write them.
   */
  commands: Readonly<Record<string, readonly string[]>>;
  timeoutMs?: number;
}

/**
 * The quality bar for a drafted plan: the repository's own check, run in its
 * checkout.
 *
 * Nobody had to invent a rubric here. The repository being written into
 * already has one — a plan with no exit condition, or one missing from the
 * ordered list, is refused by it — and it is the same one a human contributor
 * meets. What comes back is kept verbatim, because it becomes the finding the
 * agent is sent back with.
 *
 * It stops at the first failure rather than collecting all of them, so the
 * agent gets one clear thing to fix instead of a wall of noise where the
 * second half is caused by the first.
 */
export class PlanCommandCheck implements PlanCheck {
  constructor(
    private readonly runner: CommandRunner,
    private readonly git: Git,
    private readonly config: PlanCommandCheckConfig,
  ) {}

  async check(repo: string): Promise<AttemptOutcome> {
    const commands = this.config.commands[repo] ?? this.config.commands.default ?? [];

    if (commands.length === 0) {
      return {
        ok: false,
        output: `no check is configured for ${repo}, so nothing can vouch for this plan`,
        at: new Date().toISOString(),
      };
    }

    const transcript: string[] = [];

    for (const command of commands) {
      const result = await this.runner.run("sh", ["-c", command], {
        cwd: this.git.pathFor(repo),
        timeoutMs: this.config.timeoutMs,
      });

      const output = [result.stdout, result.stderr].filter(Boolean).join("\n").trim();

      if (!result.ok) {
        transcript.push(`$ ${command}\nexited ${result.exitCode}\n\n${output}`);
        return { ok: false, output: transcript.join("\n\n"), at: new Date().toISOString() };
      }

      transcript.push(`$ ${command}\nok`);
    }

    return { ok: true, output: transcript.join("\n"), at: new Date().toISOString() };
  }
}
