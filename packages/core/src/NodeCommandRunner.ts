import { ChildProcess, spawn } from "node:child_process";
import { CommandResult, CommandRunner, RunOptions } from "./ports/CommandRunner.js";

const DEFAULT_TIMEOUT_MS = 30 * 60 * 1000;

export class NodeCommandRunner implements CommandRunner {
  /**
   * Every child still running.
   *
   * Tracked so a stop request can actually end the work in flight. Refusing
   * to start the next thing is not stopping: an agent call can run for half
   * an hour, and until it is killed nothing has stopped.
   */
  private readonly live = new Set<ChildProcess>();

  /** Ends every child still running, and says how many there were. */
  killAll(signal: NodeJS.Signals = "SIGTERM"): number {
    const running = [...this.live];
    for (const child of running) {
      child.kill(signal);
    }
    return running.length;
  }

  run(
    command: string,
    args: readonly string[],
    options: RunOptions = {},
  ): Promise<CommandResult> {
    const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;

    return new Promise((resolve) => {
      const child = spawn(command, [...args], {
        cwd: options.cwd,
        env: options.env ? { ...process.env, ...options.env } : process.env,
        stdio: ["pipe", "pipe", "pipe"],
      });

      this.live.add(child);

      let stdout = "";
      let stderr = "";
      let settled = false;

      const settle = (exitCode: number | null, extra = ""): void => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        this.live.delete(child);
        resolve({
          ok: exitCode === 0,
          exitCode,
          stdout: stdout.trim(),
          stderr: (stderr + extra).trim(),
        });
      };

      child.stdout.on("data", (data: Buffer) => {
        stdout += data.toString();
      });
      child.stderr.on("data", (data: Buffer) => {
        stderr += data.toString();
      });

      child.on("error", (error) => settle(null, `\ncould not start ${command}: ${error.message}`));
      child.on("close", (code) => settle(code));

      const timer = setTimeout(() => {
        child.kill();
        settle(null, `\n${command} timed out after ${timeoutMs}ms`);
      }, timeoutMs);

      if (options.stdin !== undefined) {
        child.stdin.on("error", () => {});
        child.stdin.end(options.stdin);
      } else {
        child.stdin.end();
      }
    });
  }
}
