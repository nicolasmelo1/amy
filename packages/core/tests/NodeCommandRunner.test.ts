import { describe, it, expect } from "vitest";
import { NodeCommandRunner } from "../src/NodeCommandRunner.js";

const notOnWindows = process.platform !== "win32";

describe("NodeCommandRunner", () => {
  it("reports what a command printed and how it exited", async () => {
    const result = await new NodeCommandRunner().run("sh", ["-c", "echo hello; exit 0"]);

    expect(result).toMatchObject({ ok: true, exitCode: 0, stdout: "hello" });
  });

  it("keeps stderr apart from stdout", async () => {
    const result = await new NodeCommandRunner().run("sh", ["-c", "echo out; echo err 1>&2; exit 3"]);

    expect(result.stdout).toBe("out");
    expect(result.stderr).toBe("err");
    expect(result.exitCode).toBe(3);
    expect(result.ok).toBe(false);
  });

  it("pipes stdin when it is given", async () => {
    const result = await new NodeCommandRunner().run("cat", [], { stdin: "from stdin" });

    expect(result.stdout).toBe("from stdin");
  });

  it("says so when the command does not exist, rather than hanging", async () => {
    const result = await new NodeCommandRunner().run("amy-no-such-command", []);

    expect(result.ok).toBe(false);
    expect(result.stderr).toContain("could not start");
  });

  it("gives up on a command that outruns its timeout", async () => {
    const result = await new NodeCommandRunner().run("sleep", ["30"], { timeoutMs: 50 });

    expect(result.ok).toBe(false);
    expect(result.stderr).toContain("timed out");
  });

  it("kills nothing when nothing is running", () => {
    expect(new NodeCommandRunner().killAll()).toBe(0);
  });

  it.runIf(notOnWindows)("ends a child that is still running, and says how many", async () => {
    // This is what makes the handbrake a handbrake. Refusing to start the
    // next thing while a half-hour agent call keeps going is not stopping.
    const runner = new NodeCommandRunner();
    const running = runner.run("sleep", ["30"]);

    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(runner.killAll()).toBe(1);

    const result = await running;
    expect(result.ok).toBe(false);
  });

  it.runIf(notOnWindows)("stops counting a child once it has finished", async () => {
    const runner = new NodeCommandRunner();

    await runner.run("sh", ["-c", "exit 0"]);

    expect(runner.killAll()).toBe(0);
  });

  it.runIf(notOnWindows)("ends every child, not just the first", async () => {
    const runner = new NodeCommandRunner();
    const running = [runner.run("sleep", ["30"]), runner.run("sleep", ["30"])];

    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(runner.killAll()).toBe(2);

    await Promise.all(running);
  });
});
