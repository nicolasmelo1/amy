import { describe, expect, it } from "vitest";
import { Harness, defineContract, invoke } from "@amykit/core";
import { fakeRun } from "@amykit/test-fixtures";
import { browserOperations, configSchema } from "../src/plugin.js";
import { FakeRunner, scope } from "./runner.js";

const settings = Object.fromEntries(Object.entries(configSchema).map(([key, field]) => [key, field.default]));
const INPUT = { tree: "invoice.tree", image: "invoice.png", threshold: 0.1, tolerancePercent: 1 };

function check(tree: string, pixels: string, agent?: Harness) {
  const ok = (text: string) => ({ stdout: JSON.stringify({ success: true, data: { diff: text } }) });
  const runner = new FakeRunner([{ when: ["diff", "snapshot"], answer: ok(tree) }, { when: ["diff", "screenshot"], answer: ok(pixels) }]);
  const asked: string[] = [];
  const port = (name: string) => (name === "agent" && agent ? { name: agent.name, ask: async (prompt: string, cwd: string) => { asked.push(prompt); return agent.ask(prompt, cwd); } } : undefined);
  return { asked, ran: invoke(defineContract(browserOperations(runner)), "browser.ui-check", INPUT, { port, plugin: scope(settings) }) };
}

const agentSaying = (text: string, outcome: "completed" | "failed" = "completed"): Harness => ({ name: "fake", ask: async () => ({ text, run: fakeRun({ outcome, output: text }) }) });

describe("a UI check settles on structure, then pixels, then an agent", () => {
  it("passes when the trees match and the pixels differ within the tolerance, asking no agent", async () => {
    const { asked, ran } = check("0 additions, 0 removals, 41 unchanged", "12 pixels differ (0.3%)", agentSaying("{}"));

    expect(await ran).toEqual({ kind: "output", output: { status: "passed", by: "structure-and-pixels" } });
    expect(asked).toEqual([]);
  });

  it("goes to an agent when the trees differ, and keeps its verdict", async () => {
    const { asked, ran } = check("1 additions, 0 removals, 40 unchanged", "0 pixels differ (0%)", agentSaying('It is the same design.\n{"verdict":"passed","why":"a tooltip appeared"}'));

    expect(await ran).toEqual({ kind: "output", output: { status: "passed", by: "agent", why: "a tooltip appeared" } });
    expect(asked[0]).toContain("1 addition(s) and 0 removal(s), and 0% of pixels differ");
  });

  it("goes to an agent when the pixels differ past the tolerance", async () => {
    const { ran } = check("0 additions, 0 removals, 41 unchanged", "9000 pixels differ (12.5%)", agentSaying('{"verdict":"failed","why":"the badge is red"}'));

    expect(await ran).toEqual({ kind: "output", output: { status: "failed", by: "agent", why: "the badge is red" } });
  });

  it("is unsupported when the agent cannot settle it", async () => {
    const { ran } = check("2 additions, 1 removals, 38 unchanged", "0 pixels differ (0%)", agentSaying('{"verdict":"unsupported","why":"the page needs a login I do not have"}'));

    expect(await ran).toEqual({ kind: "output", output: { status: "unsupported", by: "agent", why: "the page needs a login I do not have" } });
  });

  it("is unsupported when no agent is mounted to settle it", async () => {
    const { ran } = check("2 additions, 1 removals, 38 unchanged", "0 pixels differ (0%)");

    expect(await ran).toMatchObject({ kind: "output", output: { status: "unsupported", by: "nothing" } });
  });

  it("is unsupported when the sizes differ, comparing no pixel and asking no agent", async () => {
    const { asked, ran } = check("0 additions, 0 removals, 41 unchanged", "dimension mismatch: 1280x720 vs 1440x900", agentSaying('{"verdict":"passed"}'));

    expect(await ran).toEqual({ kind: "output", output: { status: "unsupported", by: "nothing", why: "the page and the planned design are of different sizes, so no pixel was compared" } });
    expect(asked).toEqual([]);
  });
});
