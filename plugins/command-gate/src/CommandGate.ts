import { CommandRunner, Git, AttemptOutcome, Gate, Workplace } from "@amykit/core";


/** One command that was red, in the transcript the refusal carries. */
function red(command: string, exitCode: number | null, output: string): string {
  return `$ ${command}\nexited ${exitCode}\n\n${output}`;
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
 * It runs every command, so the answer it gives the workflow is how many
 * checks were red rather than only whether one was: escalation weighs that
 * number, and a run that stopped at the first failure would always say one.
 * The transcript keeps each failure whole, so an agent still meets every red
 * check by name.
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
    let findings = 0;

    for (const command of commands) {
      const result = await this.runner.run("sh", ["-c", command], {
        // Where the work is, not where the checkout is: with a worktree port
        // behind the Git, the gate runs in the work's own tree.
        cwd: this.git.pathFor(workplace.repo, workplace.workId),
        timeoutMs: this.config.timeoutMs,
      });

      const output = [result.stdout, result.stderr].filter(Boolean).join("\n").trim();

      if (!result.ok) {
        findings += 1;
        transcript.push(red(command, result.exitCode, output));
        continue;
      }

      transcript.push(`$ ${command}\nok`);
    }

    if (findings > 0) {
      return { ok: false, output: transcript.join("\n\n"), at: new Date().toISOString(), findings };
    }
    return { ok: true, output: transcript.join("\n"), at: new Date().toISOString(), findings: 0 };
  }
}
