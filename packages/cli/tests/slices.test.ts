import { describe, it, expect } from "vitest";
import { DEFAULT_CONFIG } from "../src/config.js";
import { ladderNames, pluginList, pluginSlices, tiersFor } from "../src/slices.js";

const CONFIG = {
  ...DEFAULT_CONFIG,
  repos: ["acme/widgets"],
  workingStatusName: "In Progress",
  qaStatusName: "In QA",
  defaultBranch: "dev",
  gate: { "acme/widgets": ["npm test"] },
  repoByTeam: { ACME: "acme/widgets" },
};

describe("pluginSlices", () => {
  it("gives the tracker the status name it matches on", () => {
    const slices = pluginSlices(CONFIG) as Record<string, Record<string, unknown>>;

    expect(slices["@amy/plugin-linear"]).toMatchObject({
      workingStatusName: "In Progress",
      repoByTeam: { ACME: "acme/widgets" },
    });
  });

  it("gives the agent and the gate the branch new work is cut from", () => {
    const slices = pluginSlices(CONFIG) as Record<string, Record<string, unknown>>;

    // Not always `main`, and branching off the wrong base is silent.
    expect(slices["@amy/plugin-claude"]?.defaultBranch).toBe("dev");
    expect(slices["@amy/plugin-command-gate"]?.defaultBranch).toBe("dev");
  });

  it("gives the gate the commands, per repository", () => {
    const slices = pluginSlices(CONFIG) as Record<string, Record<string, unknown>>;

    expect(slices["@amy/plugin-command-gate"]?.commands).toEqual({ "acme/widgets": ["npm test"] });
  });

  it("gives the engine the policy, so a configured ceiling reaches the machine", () => {
    const slices = pluginSlices({
      ...CONFIG,
      policy: { ...CONFIG.policy, maxOpenReviewsPerReviewer: 0 },
    }) as Record<string, Record<string, unknown>>;

    expect(slices["@amy/plugin-serial-engine"]?.policy).toMatchObject({
      maxOpenReviewsPerReviewer: 0,
    });
  });

  it("gives the relay the budget, because it is the only thing that spends", () => {
    const budget = { perFiveHours: { tokens: 2_000_000 }, stopAt: 0.8 };
    const slices = pluginSlices({
      ...CONFIG,
      agent: { ...CONFIG.agent, budget },
    }) as Record<string, Record<string, unknown>>;

    expect(slices["@amy/plugin-agent-relay"]?.budget).toEqual(budget);
  });

  it("gives the relay the skills, because it is what decides who answers", () => {
    const skills = { triage: ["/logion"] };
    const slices = pluginSlices({ ...CONFIG, skills }) as Record<string, Record<string, unknown>>;

    expect(slices["@amy/plugin-agent-relay"]?.skills).toEqual(skills);
  });

  it("says nothing about a channel that is not configured", () => {
    const slices = pluginSlices({ ...CONFIG, notify: { tracker: true, hermes: null, inbox: false } });

    expect("@amy/plugin-notify-hermes" in slices).toBe(false);
    expect("@amy/plugin-notify-inbox" in slices).toBe(false);
  });

  it("lets an explicit slice win over what was derived", () => {
    // This is the direction of travel: the derivation is a shim for a config
    // written before plugins declared their own settings.
    const slices = pluginSlices({
      ...CONFIG,
      plugins: { "@amy/plugin-claude": { model: "opus", defaultBranch: "trunk" } },
    }) as Record<string, Record<string, unknown>>;

    expect(slices["@amy/plugin-claude"]).toEqual({ model: "opus", defaultBranch: "trunk" });
  });
});

describe("the ladder, which is the one place harnesses are named", () => {
  it("reads the models one harness was asked for, in ladder order", () => {
    expect(tiersFor(["claude:sonnet", "codex:gpt-5", "claude:opus"], "claude")).toEqual([
      "sonnet",
      "opus",
    ]);
  });

  it("treats a bare harness name as its configured model", () => {
    // `claude` on its own is the single-model install. Reading it as a model
    // named "claude" would send a nonsense --model to the CLI.
    expect(tiersFor(["claude"], "claude")).toEqual([""]);
  });

  it("finds nothing for a harness the ladder never mentions", () => {
    expect(tiersFor(["claude:sonnet"], "codex")).toEqual([]);
    expect(ladderNames(["claude:sonnet"], "codex")).toBe(false);
  });

  it("counts a harness as named either way it can be written", () => {
    expect(ladderNames(["codex"], "codex")).toBe(true);
    expect(ladderNames(["codex:gpt-5"], "codex")).toBe(true);
  });

  it("turns the ladder into the tiers each harness plugin contributes", () => {
    const slices = pluginSlices({
      ...CONFIG,
      agent: { ladder: ["claude:sonnet", "claude:opus", "codex:gpt-5"] },
    }) as Record<string, Record<string, unknown>>;

    // One list to edit: the ladder names the tiers, and the harness plugins
    // contribute exactly those names back for the relay to find.
    expect(slices["@amy/plugin-claude"]?.models).toEqual(["sonnet", "opus"]);
    expect(slices["@amy/plugin-codex"]?.models).toEqual(["gpt-5"]);
    expect(slices["@amy/plugin-agent-relay"]?.ladder).toEqual([
      "claude:sonnet",
      "claude:opus",
      "codex:gpt-5",
    ]);
  });

  it("leaves the tiers empty when no ladder was written, which is one agent", () => {
    const slices = pluginSlices(CONFIG) as Record<string, Record<string, unknown>>;

    expect(slices["@amy/plugin-claude"]?.models).toEqual([]);
    expect(slices["@amy/plugin-agent-relay"]?.ladder).toEqual([]);
  });
});

describe("pluginList", () => {
  const BUILT_IN = ["@amy/plugin-a", "@amy/plugin-notify-hermes", "@amy/plugin-notify-inbox"];

  it("uses what the config asked for, in that order", () => {
    const config = { ...CONFIG, pluginList: ["@amy/plugin-z", "@amy/plugin-a"] };

    expect(pluginList(config, BUILT_IN)).toEqual(["@amy/plugin-z", "@amy/plugin-a"]);
  });

  it("falls back to the built-in set", () => {
    expect(pluginList(CONFIG, BUILT_IN)).toContain("@amy/plugin-a");
  });

  it("leaves out a channel nobody configured", () => {
    // Mounting it would have the fan-out announce into a target that is not
    // there, which fails at the worst moment rather than at boot.
    const config = { ...CONFIG, notify: { tracker: true, hermes: null, inbox: false } };

    expect(pluginList(config, BUILT_IN)).toEqual(["@amy/plugin-a"]);
  });

  it("keeps a channel that is configured", () => {
    const config = { ...CONFIG, notify: { tracker: true, hermes: "slack:ops", inbox: true } };

    expect(pluginList(config, BUILT_IN)).toEqual(BUILT_IN);
  });

  it("leaves out a harness the ladder never named", () => {
    // Mounting codex on a machine that never installed it only produces a
    // doctor failure for a tool the operator did not ask for.
    const harnesses = ["@amy/plugin-claude", "@amy/plugin-codex", "@amy/plugin-hermes-agent"];

    expect(pluginList(CONFIG, harnesses)).toEqual(["@amy/plugin-claude"]);
  });

  it("mounts the harnesses the ladder does name", () => {
    const harnesses = ["@amy/plugin-claude", "@amy/plugin-codex", "@amy/plugin-hermes-agent"];
    const config = { ...CONFIG, agent: { ladder: ["claude:sonnet", "hermes"] } };

    expect(pluginList(config, harnesses)).toEqual([
      "@amy/plugin-claude",
      "@amy/plugin-hermes-agent",
    ]);
  });

  it("always keeps the relay, because nothing else mounts the agent port", () => {
    // Dropping it leaves every agent action without a port, and mount()
    // refuses at boot rather than failing at the first ticket.
    expect(pluginList(CONFIG, ["@amy/plugin-agent-relay"])).toEqual(["@amy/plugin-agent-relay"]);
  });
});
