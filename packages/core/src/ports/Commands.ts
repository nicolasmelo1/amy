/**
 * What one command run produced.
 *
 * The output is kept verbatim and both streams are in it, because whatever
 * reads this next is usually an agent being told what happened, and a
 * summary is the part that loses the line that mattered.
 */
export interface CommandOutcome {
  /** The name from the allowlist, not the command line it stands for. */
  name: string;
  ok: boolean;
  /** Null when it was killed rather than exiting, which a timeout is. */
  exitCode: number | null;
  output: string;
  at: string;
}

/**
 * Any command line tool, reached by a name somebody put in the config.
 *
 * The port exists so a workflow can reach `pup`, `ntn`, `kubectl` or next
 * year's CLI without a plugin per tool and without the machine learning what
 * any of them mean. A workflow says *which* named command and with what
 * arguments; the config is the only place that says what that name runs.
 *
 * That split is the whole security model. A command line assembled from a
 * ticket, an agent's answer or anything else the outside world wrote would be
 * a machine that runs whatever a stranger can type into an issue.
 */
export interface Commands {
  run(name: string, args?: readonly string[], options?: { cwd?: string }): Promise<CommandOutcome>;
  /** What the config allows, for a refusal that names the alternatives. */
  available(): readonly string[];
}
