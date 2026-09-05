import { describe, it, expect } from "vitest";
import { DEFAULT_CONFIG } from "../src/config.js";
import { profiles } from "../src/profiles.js";
import { ladderNames, pluginList, pluginSlices, tiersFor } from "../src/slices.js";

const TICKETS = profiles(DEFAULT_CONFIG)["ticket-to-qa"]!;
const PLANS = profiles(DEFAULT_CONFIG)["note-to-plan"]!;

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
    const slices = pluginSlices(CONFIG, TICKETS) as Record<string, Record<string, unknown>>;

    expect(slices["@amy/plugin-linear"]).toMatchObject({
      workingStatusName: "In Progress",
      repoByTeam: { ACME: "acme/widgets" },
    });
  });

  it("gives the agent and the gate the branch new work is cut from", () => {
    const slices = pluginSlices(CONFIG, TICKETS) as Record<string, Record<string, unknown>>;

    // Not always `main`, and branching off the wrong base is silent.
    expect(slices["@amy/plugin-claude"]?.defaultBranch).toBe("dev");
    expect(slices["@amy/plugin-command-gate"]?.defaultBranch).toBe("dev");
  });

  it("gives the gate the commands, per repository", () => {
    const slices = pluginSlices(CONFIG, TICKETS) as Record<string, Record<string, unknown>>;

    expect(slices["@amy/plugin-command-gate"]?.commands).toEqual({ "acme/widgets": ["npm test"] });
  });

  it("gives the workflow the policy, so a configured ceiling reaches the machine", () => {
    const slices = pluginSlices({
      ...CONFIG,
      policy: { ...CONFIG.policy, maxOpenReviewsPerReviewer: 0 },
    }, TICKETS) as Record<string, Record<string, unknown>>;

    // The policy is written in the workflow's vocabulary — attempt ceilings,
    // backoffs, how many open reviews one person may be handed — so it goes
    // to the workflow rather than to whatever is driving it.
    expect(slices["@amy/workflow-ticket-to-qa"]?.policy).toMatchObject({
      maxOpenReviewsPerReviewer: 0,
    });
  });

  it("gives the relay the budget, because it is the only thing that spends", () => {
    const budget = { perFiveHours: { tokens: 2_000_000 }, stopAt: 0.8 };
    const slices = pluginSlices({
      ...CONFIG,
      agent: { ...CONFIG.agent, budget },
    }, TICKETS) as Record<string, Record<string, unknown>>;

    expect(slices["@amy/plugin-agent-relay"]?.budget).toEqual(budget);
  });

  it("gives the relay the skills, because it is what decides who answers", () => {
    const skills = { triage: ["/logion"] };
    const slices = pluginSlices({ ...CONFIG, skills }, TICKETS) as Record<string, Record<string, unknown>>;

    expect(slices["@amy/plugin-agent-relay"]?.skills).toEqual(skills);
  });

  it("says nothing about a channel that is not configured", () => {
    const slices = pluginSlices(
      { ...CONFIG, notify: { tracker: true, hermes: null, inbox: false } },
      TICKETS,
    );

    expect("@amy/plugin-notify-hermes" in slices).toBe(false);
    expect("@amy/plugin-notify-inbox" in slices).toBe(false);
  });

  it("keeps the derived settings a hand-written slice did not mention", () => {
    // The bug this is here for: a config that set `retentionDays` on the
    // queue lost the `directory` beside it, so two profiles quietly shared
    // one queue and each claimed the other's work.
    const slices = pluginSlices(
      { ...CONFIG, plugins: { "@amy/plugin-file-queue": { retentionDays: 30 } } },
      TICKETS,
    ) as Record<string, Record<string, unknown>>;

    expect(slices["@amy/plugin-file-queue"]).toMatchObject({
      retentionDays: 30,
      directory: "ticket-to-qa/queue",
    });
  });

  it("lets an explicit setting win over the one that was derived", () => {
    // This is the direction of travel: the derivation is a shim for a config
    // written before plugins declared their own settings.
    const slices = pluginSlices({
      ...CONFIG,
      plugins: { "@amy/plugin-claude": { model: "opus", defaultBranch: "trunk" } },
    }, TICKETS) as Record<string, Record<string, unknown>>;

    expect(slices["@amy/plugin-claude"]).toMatchObject({ model: "opus", defaultBranch: "trunk" });
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
    }, TICKETS) as Record<string, Record<string, unknown>>;

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
    const slices = pluginSlices(CONFIG, TICKETS) as Record<string, Record<string, unknown>>;

    expect(slices["@amy/plugin-claude"]?.models).toEqual([]);
    expect(slices["@amy/plugin-agent-relay"]?.ladder).toEqual([]);
  });
});

describe("pluginList", () => {
  it("uses what the profile asked for, in that order", () => {
    const oncall = { ...TICKETS, plugins: ["@amy/plugin-z", "@amy/plugin-a"] };

    expect(pluginList(CONFIG, oncall)).toEqual(["@amy/plugin-z", "@amy/plugin-a"]);
  });

  it("falls back to what the workflow needs, starting with the workflow", () => {
    expect(pluginList(CONFIG, TICKETS)[0]).toBe("@amy/workflow-ticket-to-qa");
    expect(pluginList(CONFIG, PLANS)[0]).toBe("@amy/workflow-note-to-plan");
  });

  it("recommends a different set for a workflow it has never heard of", () => {
    // The shared half, and nothing invented: a third workflow lists whatever
    // else it needs in its own `plugins:`.
    const oncall = {
      name: "oncall",
      workflow: "@acme/workflow-oncall",
      plugins: [],
      takesNotes: false,
      takesTasks: false,
    };

    expect(pluginList(CONFIG, oncall)[0]).toBe("@acme/workflow-oncall");
    expect(pluginList(CONFIG, oncall)).toContain("@amy/plugin-serial-engine");
    expect(pluginList(CONFIG, oncall)).not.toContain("@amy/plugin-linear");
  });

  it("leaves out a channel nobody configured", () => {
    // Mounting it would have the fan-out announce into a target that is not
    // there, which fails at the worst moment rather than at boot.
    const config = { ...CONFIG, notify: { tracker: true, hermes: null, inbox: false } };

    expect(pluginList(config, TICKETS)).not.toContain("@amy/plugin-notify-hermes");
    expect(pluginList(config, TICKETS)).not.toContain("@amy/plugin-notify-inbox");
  });

  it("keeps a channel that is configured", () => {
    const config = { ...CONFIG, notify: { tracker: true, hermes: "slack:ops", inbox: true } };

    expect(pluginList(config, TICKETS)).toContain("@amy/plugin-notify-hermes");
    expect(pluginList(config, TICKETS)).toContain("@amy/plugin-notify-inbox");
  });

  it("leaves out a harness the ladder never named", () => {
    // Mounting codex on a machine that never installed it only produces a
    // doctor failure for a tool the operator did not ask for.
    expect(pluginList(CONFIG, TICKETS)).toContain("@amy/plugin-claude");
    expect(pluginList(CONFIG, TICKETS)).not.toContain("@amy/plugin-codex");
    expect(pluginList(CONFIG, TICKETS)).not.toContain("@amy/plugin-hermes-agent");
  });

  it("mounts the harnesses the ladder does name", () => {
    const config = { ...CONFIG, agent: { ladder: ["claude:sonnet", "hermes"] } };

    expect(pluginList(config, TICKETS)).toContain("@amy/plugin-hermes-agent");
    expect(pluginList(config, TICKETS)).not.toContain("@amy/plugin-codex");
  });

  it("always keeps the relay, because nothing else mounts the agent port", () => {
    // Dropping it leaves every agent action without a port, and mount()
    // refuses at boot rather than failing at the first ticket.
    expect(pluginList(CONFIG, TICKETS)).toContain("@amy/plugin-agent-relay");
  });
});
