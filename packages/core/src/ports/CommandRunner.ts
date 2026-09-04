export interface CommandResult {
  ok: boolean;
  exitCode: number | null;
  stdout: string;
  stderr: string;
}

export interface RunOptions {
  cwd?: string;
  stdin?: string;
  timeoutMs?: number;
  env?: Record<string, string>;
}

/**
 * Running a child process, behind a port.
 *
 * Every adapter that shells out goes through this, so each one can be tested
 * against a scripted runner instead of the real `gh`, `claude` or `git`.
 */
export interface CommandRunner {
  run(command: string, args: readonly string[], options?: RunOptions): Promise<CommandResult>;
}
