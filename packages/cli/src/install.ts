import { CommandRunner } from "@amykit/core";

/**
 * The package manager, by the name this platform actually has for it.
 *
 * `spawn` without a shell will not find `npm` on Windows, because what is on
 * the PATH there is `npm.cmd`. Getting this wrong is not a subtle failure —
 * it is `ENOENT` on the one command that was supposed to make installing
 * easy — but it is invisible on the machine most of this was written on.
 */
export function packageManager(platform: string = process.platform): string {
  return platform === "win32" ? "npm.cmd" : "npm";
}

export interface InstallOutcome {
  ok: boolean;
  /** What was run, so a failure can be retried by hand. */
  command: string;
  output: string;
}

/**
 * Installs packages globally, which is where amy resolves its plugins from.
 *
 * Globally rather than into a directory of amy's own, because a plugin is
 * resolved by name at run time and Node walks up from the command's own
 * location — so a package installed beside the command is one the command can
 * import. That is also why this works for a plugin nobody here has heard of.
 *
 * Ten minutes rather than the runner's default, because a cold npm cache on a
 * slow connection is not a hang, and killing it half way leaves a global
 * prefix somebody has to repair by hand.
 */
export async function installGlobally(
  runner: CommandRunner,
  packages: readonly string[],
): Promise<InstallOutcome> {
  const args = ["install", "--global", ...packages];
  const command = `${packageManager()} ${args.join(" ")}`;

  const result = await runner.run(packageManager(), args, { timeoutMs: 10 * 60 * 1000 });

  return {
    ok: result.ok,
    command,
    // Both streams: npm says the interesting part on stderr about half the
    // time, and a summary that drops the line that mattered is worse than
    // the noise.
    output: [result.stdout, result.stderr].filter(Boolean).join("\n").trim(),
  };
}
