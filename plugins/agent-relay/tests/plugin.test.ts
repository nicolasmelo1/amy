import { describe, it, expect, beforeAll, afterAll } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { HostServices, mount, Plugin } from "@amy/core";
import { AGENT_COLLECTION, NamedAgent } from "@amy/agent-kit";
import { agentResult, fakeAgent } from "@amy/test-fixtures";
import { plugin as relay } from "../src/plugin.js";

const host: HostServices = {
  runner: { run: async () => ({ ok: true, exitCode: 0, stdout: "", stderr: "" }) },
  now: () => new Date("2026-09-03T12:00:00.000Z"),
  paths: { workspace: "/w", state: "/w/.amy" },
};

/** A stand-in harness plugin, contributing tiers without running anything. */
function harnessPlugin(harness: string, models: string[]): Plugin {
  return {
    name: `@amy/plugin-${harness}-fake`,
    version: "0.0.0",
    register(registry) {
      for (const model of models) {
        const named: NamedAgent = {
          name: model ? `${harness}:${model}` : harness,
          harness,
          model,
          agent: fakeAgent({
            triage: async () => agentResult({ kind: "clear" }, { outcome: "completed", harness, model }),
          }),
        };

        registry.contribute(AGENT_COLLECTION, named.name, named);
      }
    },
  };
}

const ladder = (ladder: string[]) => ({ "@amy/plugin-agent-relay": { ladder } });

describe("mounting the relay", () => {
  it("mounts the agent port, which is the only reason it exists", async () => {
    const outcome = await mount([relay, harnessPlugin("claude", ["sonnet"])], ladder([]), host);

    if (!outcome.ok) throw new Error(outcome.problems.join("; "));
    expect(outcome.mounted.ports.has("agent")).toBe(true);
  });

  it("finds a harness listed after it", async () => {
    // Contributions are read on use, not on mount, so an operator never has
    // to work out which order the plugins go in.
    const outcome = await mount([relay, harnessPlugin("codex", ["gpt-5"])], ladder(["codex:gpt-5"]), host);

    expect(outcome.ok).toBe(true);
  });

  it("finds a harness listed before it", async () => {
    const outcome = await mount([harnessPlugin("codex", ["gpt-5"]), relay], ladder(["codex:gpt-5"]), host);

    expect(outcome.ok).toBe(true);
  });

  it("refuses at boot when the ladder names an agent nobody contributed", async () => {
    // The typo case. Skipping the unknown name would leave a ladder shorter
    // than the operator believes, and the first symptom would be a ticket
    // escalating for no reason.
    const outcome = await mount(
      [relay, harnessPlugin("claude", ["sonnet"])],
      ladder(["claude:sonnet", "claude:opuss"]),
      host,
    );

    expect(outcome.ok).toBe(false);
    if (outcome.ok) return;
    expect(outcome.problems.join("\n")).toContain("claude:opuss");
    // And it says what there was to choose from, so the fix is obvious.
    expect(outcome.problems.join("\n")).toContain("claude:sonnet");
  });

  it("refuses at boot when no harness was mounted at all", async () => {
    const outcome = await mount([relay], ladder([]), host);

    expect(outcome.ok).toBe(false);
    if (outcome.ok) return;
    expect(outcome.problems.join("\n")).toContain("no harness plugin contributed");
  });

  it("uses everything contributed when no ladder was written", async () => {
    const outcome = await mount(
      [relay, harnessPlugin("claude", ["sonnet", "opus"]), harnessPlugin("codex", ["gpt-5"])],
      ladder([]),
      host,
    );

    if (!outcome.ok) throw new Error(outcome.problems.join("; "));

    const agent = outcome.mounted.ports.get("agent") as { triage: (t: unknown) => Promise<{ run: { harness: string } }> };
    const result = await agent.triage({ id: "PROJ-1" });

    // Mounting order decides the default ladder, and claude was first.
    expect(result.run.harness).toBe("claude");
  });

  it("mounts a budget only when a ceiling was configured", async () => {
    const withLog = { ...host, log: { append: () => {}, read: () => [] } };
    const bare = await mount([relay, harnessPlugin("claude", ["sonnet"])], ladder([]), withLog);

    const capped = await mount([relay, harnessPlugin("claude", ["sonnet"])], {
      "@amy/plugin-agent-relay": { ladder: [], budget: { perFiveHours: { tokens: 10 } } },
    }, withLog);

    // A budget that can never refuse is a port pretending to be one.
    expect(bare.ok === true && bare.mounted.ports.has("budget")).toBe(false);
    expect(capped.ok === true && capped.mounted.ports.has("budget")).toBe(true);
  });

  it("refuses a budget it cannot mean, while boot can still refuse", async () => {
    const outcome = await mount([relay, harnessPlugin("claude", ["sonnet"])], {
      "@amy/plugin-agent-relay": { ladder: [], budget: { perDay: { tokens: 10 } } },
    }, { ...host, log: { append: () => {}, read: () => [] } });

    expect(outcome.ok).toBe(false);
    expect(outcome.ok === false && outcome.problems.join("\n")).toContain("perFiveHours, perWeek");
  });

  it("refuses a ceiling with no log to measure the spending against", async () => {
    // The host lends the log. Without one the ledger has nothing to read, and
    // a ceiling nobody can measure is a promise rather than a brake.
    const outcome = await mount([relay, harnessPlugin("claude", ["sonnet"])], {
      "@amy/plugin-agent-relay": { ladder: [], budget: { perWeek: { costUsd: 10 } } },
    }, host);

    expect(outcome.ok).toBe(false);
    expect(outcome.ok === false && outcome.problems.join("\n")).toContain("event log");
  });

  it("keeps two mounts apart", async () => {
    // The exported plugin is a module singleton, so a relay cached on it
    // would answer the second host with the first host's ladder.
    const first = await mount([relay, harnessPlugin("claude", ["sonnet"])], ladder([]), host);
    const second = await mount([relay, harnessPlugin("codex", ["gpt-5"])], ladder([]), host);

    if (!first.ok || !second.ok) throw new Error("both mounts should have worked");

    const agentOf = (m: typeof first) =>
      m.mounted.ports.get("agent") as { triage: (t: unknown) => Promise<{ run: { harness: string } }> };

    expect((await agentOf(first).triage({ id: "PROJ-1" })).run.harness).toBe("claude");
    expect((await agentOf(second).triage({ id: "PROJ-1" })).run.harness).toBe("codex");
  });
});

describe("mounting the skills", () => {
  let root: string;

  beforeAll(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), "amy-skill-mount-"));
    for (const name of ["logion", "northwind-code-review"]) {
      fs.mkdirSync(path.join(root, name), { recursive: true });
      fs.writeFileSync(path.join(root, name, "SKILL.md"), "# a skill\n");
    }
  });

  afterAll(() => {
    fs.rmSync(root, { recursive: true, force: true });
  });

  const withSkills = (skills: Record<string, string[]>) => ({
    "@amy/plugin-agent-relay": { ladder: [], skills, skillRoots: [root] },
  });

  it("mounts when every skill named is installed", async () => {
    const outcome = await mount(
      [relay, harnessPlugin("claude", ["sonnet"])],
      withSkills({ triage: ["/logion"] }),
      host,
    );

    expect(outcome.ok).toBe(true);
  });

  it("refuses a skill nobody installed, while boot can still refuse", async () => {
    const outcome = await mount(
      [relay, harnessPlugin("claude", ["sonnet"])],
      withSkills({ triage: ["/nao-existe"] }),
      host,
    );

    expect(outcome.ok).toBe(false);
    expect(outcome.ok === false && outcome.problems.join("\n")).toContain("/nao-existe");
  });

  it("names what there was to choose from", async () => {
    // Config is true or it is not. A ladder that quietly means less than it
    // says would first show up as a ticket escalating for no reason.
    const outcome = await mount(
      [relay, harnessPlugin("claude", ["sonnet"])],
      withSkills({ triage: ["/nao-existe"] }),
      host,
    );

    const said = outcome.ok === false ? outcome.problems.join("\n") : "";
    expect(said).toContain("/logion");
    expect(said).toContain("/northwind-code-review");
  });

  it("refuses a step no agent performs", async () => {
    const outcome = await mount(
      [relay, harnessPlugin("claude", ["sonnet"])],
      withSkills({ "open-pull-request": ["/logion"] }),
      host,
    );

    expect(outcome.ok).toBe(false);
    expect(outcome.ok === false && outcome.problems.join("\n")).toContain("open-pull-request");
  });
});
