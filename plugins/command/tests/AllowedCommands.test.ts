import { describe, it, expect } from "vitest";
import { CommandResult, RunOptions } from "@amykit/core";
import { AllowedCommands } from "../src/AllowedCommands.js";

const OK: CommandResult = { ok: true, exitCode: 0, stdout: "", stderr: "" };

class World {
  readonly calls: { command: string; args: string[]; options?: RunOptions }[] = [];
  result: CommandResult = OK;

  run = async (
    command: string,
    args: readonly string[],
    options?: RunOptions,
  ): Promise<CommandResult> => {
    this.calls.push({ command, args: [...args], options });
    return this.result;
  };
}

const commands = (world: World, allow: Record<string, string>, extra = {}) =>
  new AllowedCommands({ run: world.run }, { allow, timeoutMs: 1000, ...extra });

describe("the commands a workflow may reach", () => {
  it("runs the line the config gave the name", async () => {
    const world = new World();
    world.result = { ...OK, stdout: "3 monitors alerting" };

    const outcome = await commands(world, { datadog: "pup monitors list" }).run("datadog");

    expect(outcome.ok).toBe(true);
    expect(outcome.output).toBe("3 monitors alerting");
    expect(world.calls[0]?.args[1]).toBe('pup monitors list "$@"');
  });

  it("passes arguments as arguments, never as more command", async () => {
    // The whole security model in one assertion: an argument carrying a
    // semicolon is an argument. Splicing it into the line would make a
    // ticket somebody else wrote into a second command.
    const world = new World();

    await commands(world, { notion: "ntn page get" }).run("notion", ["; rm -rf /", "--json"]);

    expect(world.calls[0]?.args).toEqual([
      "-c",
      'ntn page get "$@"',
      "sh",
      "; rm -rf /",
      "--json",
    ]);
  });

  it("refuses a name nobody allowed, and says what there was", async () => {
    const world = new World();

    const outcome = await commands(world, { datadog: "pup" }).run("kubectl");

    expect(outcome.ok).toBe(false);
    expect(outcome.output).toContain("not a command this install allows");
    expect(outcome.output).toContain("datadog");
    expect(world.calls).toEqual([]);
  });

  it("says so plainly when nothing at all is allowed", async () => {
    const outcome = await commands(new World(), {}).run("anything");

    expect(outcome.output).toContain("Allowed: nothing");
  });

  it("reports what is allowed, in a stable order", () => {
    expect(commands(new World(), { zulu: "z", alpha: "a" }).available()).toEqual([
      "alpha",
      "zulu",
    ]);
  });

  it("keeps both streams, because the line that matters is often on stderr", async () => {
    const world = new World();
    world.result = { ok: false, exitCode: 2, stdout: "checked 4\n", stderr: "monitor 7 is down" };

    const outcome = await commands(world, { datadog: "pup" }).run("datadog");

    expect(outcome.ok).toBe(false);
    expect(outcome.exitCode).toBe(2);
    expect(outcome.output).toContain("checked 4");
    expect(outcome.output).toContain("monitor 7 is down");
  });

  it("runs where it was told, and where it was configured otherwise", async () => {
    const world = new World();
    const runner = commands(world, { datadog: "pup" }, { cwd: "/state" });

    await runner.run("datadog");
    await runner.run("datadog", [], { cwd: "/elsewhere" });

    expect(world.calls[0]?.options?.cwd).toBe("/state");
    expect(world.calls[1]?.options?.cwd).toBe("/elsewhere");
  });

  it("carries the timeout it was given, so a hung CLI is not forever", async () => {
    const world = new World();

    await commands(world, { datadog: "pup" }).run("datadog");

    expect(world.calls[0]?.options?.timeoutMs).toBe(1000);
  });
});
