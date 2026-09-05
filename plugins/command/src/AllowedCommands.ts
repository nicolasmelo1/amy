import { CommandOutcome, CommandRunner, Commands } from "@amykit/core";

export interface AllowedCommandsConfig {
  /** Name to command line. The only place a command line is ever written. */
  allow: Readonly<Record<string, string>>;
  cwd?: string;
  timeoutMs?: number;
}

/**
 * The command line tools a workflow is allowed to reach, by name.
 *
 * One adapter rather than one per tool. `pup` for the monitors, `ntn` for the
 * pages, whatever next year's is: the machine learns none of them, it learns
 * that a name in the config maps to a line somebody wrote down.
 */
export class AllowedCommands implements Commands {
  constructor(
    private readonly runner: CommandRunner,
    private readonly config: AllowedCommandsConfig,
  ) {}

  available(): readonly string[] {
    return Object.keys(this.config.allow).sort();
  }

  async run(
    name: string,
    args: readonly string[] = [],
    options: { cwd?: string } = {},
  ): Promise<CommandOutcome> {
    const at = new Date().toISOString();
    const line = this.config.allow[name];

    // Refused by name, with what there was. A workflow asking for something
    // nobody allowed is a config that has not caught up with it, and that is
    // a sentence somebody can act on rather than a silent no-op.
    if (!line) {
      const known = this.available();
      return {
        name,
        ok: false,
        exitCode: -1,
        at,
        output:
          `\`${name}\` is not a command this install allows. ` +
          `Allowed: ${known.length > 0 ? known.join(", ") : "nothing"}`,
      };
    }

    // The arguments become positional parameters rather than being spliced
    // into the line. `sh -c 'pup monitors "$@"' sh --since 1h` passes them
    // through untouched, so an argument carrying a quote, a semicolon or a
    // backtick is an argument and never a second command.
    const result = await this.runner.run("sh", ["-c", `${line} "$@"`, "sh", ...args], {
      cwd: options.cwd ?? this.config.cwd ?? undefined,
      timeoutMs: this.config.timeoutMs,
    });

    return {
      name,
      ok: result.ok,
      exitCode: result.exitCode,
      at,
      output: `${result.stdout}${result.stderr}`.trim(),
    };
  }
}
