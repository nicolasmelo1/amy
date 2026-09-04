import { CommandRunner, Git } from "@amy/core";
import { Gate } from "@amy/workflow-ticket-to-qa";
import { AttemptOutcome } from "@amy/workflow-ticket-to-qa";
import { Ticket } from "@amy/workflow-ticket-to-qa";


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
 * The deterministic check, as a list of shell commands run in the ticket's
 * checkout.
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

  async run(ticket: Ticket): Promise<AttemptOutcome> {
    const commands = this.config.commands[ticket.repo] ?? this.config.commands.default ?? [];
    const at = new Date().toISOString();

    if (commands.length === 0) {
      return {
        ok: false,
        output: `no gate is configured for ${ticket.repo}, so nothing can vouch for this change`,
        at,
      };
    }

    const transcript: string[] = [];

    for (const command of commands) {
      const result = await this.runner.run("sh", ["-c", command], {
        cwd: this.git.pathFor(ticket.repo),
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
