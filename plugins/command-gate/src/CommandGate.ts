import { CommandRunner, Git, AttemptOutcome, Gate, Workplace } from "@amykit/core";


/** The refusal, once a command has been run and one of them was red. */
function red(transcript: string[], command: string, exitCode: number | null, output: string): AttemptOutcome {
  // One check, because it stops here: how many were red is what it saw, and a
  // workflow weighing this round against a threshold is told the number it
  // actually found rather than only that it failed.
  transcript.push(`$ ${command}\nexited ${exitCode}\n\n${output}`);
  return { ok: false, output: transcript.join("\n\n"), at: new Date().toISOString(), findings: 1 };
}

export interface CommandGateConfig {
  /**
   * The checks to run, per repository, falling back to the `default` entry.
   * Written as shell command lines, because that is how they are written in
   * a repository's own contributor docs.
   */
  commands: Readonly<Record<string, readonly string[]>>;
  timeoutMs?: number;
}

/**
 * The deterministic check, as a list of shell commands run in the work's own
 * tree.
 *
 * It stops at the first failure rather than collecting all of them, so the
 * agent gets one clear thing to fix instead of a wall of noise where the
 * second half is caused by the first.
 */
export class CommandGate implements Gate {
  constructor(
    private readonly runner: CommandRunner,
    private readonly git: Git,
    private readonly config: CommandGateConfig,
  ) {}

  async run(workplace: Workplace): Promise<AttemptOutcome> {
    const commands = this.config.commands[workplace.repo] ?? this.config.commands.default ?? [];
    const at = new Date().toISOString();

    if (commands.length === 0) {
      return {
        ok: false,
        output: `no gate is configured for ${workplace.repo}, so nothing can vouch for this change`,
        at,
        // Nothing was run, so nothing was found red: the refusal is the
        // configuration's, and charging it to the change would be a lie.
        findings: 0,
      };
    }

    const transcript: string[] = [];

    for (const command of commands) {
      const result = await this.runner.run("sh", ["-c", command], {
        // Where the work is, not where the checkout is: with a worktree port
        // behind the Git, the gate runs in the work's own tree.
        cwd: this.git.pathFor(workplace.repo, workplace.workId),
        timeoutMs: this.config.timeoutMs,
      });

      const output = [result.stdout, result.stderr].filter(Boolean).join("\n").trim();

      if (!result.ok) return red(transcript, command, result.exitCode, output);

      transcript.push(`$ ${command}\nok`);
    }

    return { ok: true, output: transcript.join("\n"), at: new Date().toISOString(), findings: 0 };
  }
}
