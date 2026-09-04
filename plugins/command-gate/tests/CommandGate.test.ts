import { describe, it, expect } from "vitest";
import { CommandGate } from "../src/CommandGate.js";
import { Git } from "@amy/core";
import { CommandResult } from "@amy/core";
import { ScriptedRunner } from "@amy/test-fixtures";
import { ticket } from "@amy/test-fixtures";

const layout = { workspaceRoot: "/w/northwind", defaultBranch: "main" };

const BACKEND_GATE = [
  "npm run --workspace @northwind/api lint",
  "npm run --workspace @northwind/api typecheck",
];

function fails(fragment: string, stdout: string) {
  return {
    match: (_c: string, args: readonly string[]) => args.some((a) => a.includes(fragment)),
    result: { exitCode: 1, stdout } as Partial<CommandResult>,
  };
}

function gateFor(
  commands: Record<string, string[]>,
  scripts: { match: (c: string, a: readonly string[]) => boolean; result: Partial<CommandResult> }[] = [],
) {
  const runner = new ScriptedRunner(scripts);
  return { runner, gate: new CommandGate(runner, new Git(runner, layout), { commands }) };
}

describe("CommandGate", () => {
  it("runs the repository's own commands, in order, in its checkout", async () => {
    const { runner, gate } = gateFor({ "Northwind/northwind-backend": BACKEND_GATE });

    const outcome = await gate.run(ticket());

    expect(outcome.ok).toBe(true);
    expect(runner.calls.map((call) => call.args[1])).toEqual(BACKEND_GATE);
    expect(runner.calls[0]?.options?.cwd).toBe("/w/northwind/northwind-backend");
  });

  it("stops at the first failure so the agent gets one thing to fix", async () => {
    const { runner, gate } = gateFor(
      { "Northwind/northwind-backend": BACKEND_GATE },
      [fails("lint", "3 problems")],
    );

    const outcome = await gate.run(ticket());

    expect(outcome.ok).toBe(false);
    expect(runner.calls).toHaveLength(1);
    expect(outcome.output).toContain("3 problems");
    expect(outcome.output).toContain("exited 1");
  });

  it("names the command that failed", async () => {
    const { gate } = gateFor(
      { "Northwind/northwind-backend": BACKEND_GATE },
      [fails("typecheck", "src/invoice.ts(12,3): error TS2345")],
    );

    const outcome = await gate.run(ticket());

    expect(outcome.output).toContain("$ npm run --workspace @northwind/api typecheck");
    expect(outcome.output).toContain("error TS2345");
  });

  it("falls back to the default commands for an unlisted repository", async () => {
    const { runner, gate } = gateFor({ default: ["npm test"] });

    await gate.run(ticket({ repo: "Northwind/northwind-frontend" }));

    expect(runner.calls[0]?.args[1]).toBe("npm test");
  });

  it("refuses to vouch for a repository with no gate at all", async () => {
    // Reporting green here would let anything through unchecked.
    const { runner, gate } = gateFor({});

    const outcome = await gate.run(ticket());

    expect(outcome.ok).toBe(false);
    expect(outcome.output).toContain("no gate is configured");
    expect(runner.calls).toHaveLength(0);
  });

  it("records what passed, for the transcript", async () => {
    const { gate } = gateFor({ "Northwind/northwind-backend": BACKEND_GATE });

    const outcome = await gate.run(ticket());

    expect(outcome.output).toBe(
      "$ npm run --workspace @northwind/api lint\nok\n$ npm run --workspace @northwind/api typecheck\nok",
    );
  });
});
