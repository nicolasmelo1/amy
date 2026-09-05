import { describe, it, expect } from "vitest";
import { Git, Harness, Registry } from "@amykit/core";
import { ScriptedRunner, fakeRun, ticket } from "@amykit/test-fixtures";
import {
  AGENT_COLLECTION,
  HARNESS_COLLECTION,
  contributeTiers,
  tierName,
} from "../src/index.js";

function fakeHarness(name: string): Harness {
  return {
    name,
    ask: async () => {
      throw new Error("not called");
    },
  };
}

/** Only the two methods this helper touches, so a failure names the reason. */
function recordingRegistry() {
  const contributions: { collection: string; name: string; impl: object }[] = [];
  const ports: string[] = [];

  const registry = {
    contribute: (collection: string, name: string, impl: object) =>
      void contributions.push({ collection, name, impl }),
    port: (kind: string) => void ports.push(kind),
  } as unknown as Registry;

  const named = (collection: string): string[] =>
    contributions.filter((c) => c.collection === collection).map((c) => c.name);

  return { registry, contributions, ports, named };
}

const git = () => new Git(new ScriptedRunner([]), { workspaceRoot: "/w", defaultBranch: "main" });

describe("naming a tier", () => {
  it("joins harness and model, which is what a ladder in a config refers to", () => {
    expect(tierName("claude", "opus")).toBe("claude:opus");
  });

  it("is the bare harness name when no model was chosen", () => {
    // The single-model install, where naming a model in the config would be
    // inventing one.
    expect(tierName("claude", "")).toBe("claude");
  });
});

describe("contributing tiers", () => {
  it("adds one agent per model, in the order given", () => {
    const { registry, named } = recordingRegistry();

    contributeTiers(registry, {
      harness: "claude",
      models: ["sonnet", "opus"],
      git: git(),
      make: fakeHarness,
    });

    expect(named(AGENT_COLLECTION)).toEqual(["claude:sonnet", "claude:opus"]);
  });

  it("adds the bare harness under the same name, so one ladder names both", () => {
    // The two collections are read at different levels — the ticket-shaped
    // agent, and the CLI a second workflow asks its own questions through —
    // and a ladder in a config file has to mean the same thing to each.
    const { registry, named } = recordingRegistry();

    contributeTiers(registry, {
      harness: "claude",
      models: ["sonnet", "opus"],
      git: git(),
      make: fakeHarness,
    });

    expect(named(HARNESS_COLLECTION)).toEqual(named(AGENT_COLLECTION));
  });

  it("declares the harness and the model on each one", () => {
    // The relay decides where to go next before running anything, so these
    // have to be known in advance rather than discovered from a result.
    const { registry, contributions } = recordingRegistry();

    const made = contributeTiers(registry, {
      harness: "codex",
      models: ["gpt-5"],
      git: git(),
      make: fakeHarness,
    });

    expect(made[0]).toMatchObject({ name: "codex:gpt-5", harness: "codex", model: "gpt-5" });
    expect(contributions[0]?.impl).toBe(made[0]);
  });

  it("contributes one agent when no model was configured", () => {
    const { registry, named } = recordingRegistry();

    contributeTiers(registry, { harness: "hermes", models: [], git: git(), make: fakeHarness });

    expect(named(AGENT_COLLECTION)).toEqual(["hermes"]);
  });

  it("never mounts the agent port itself", () => {
    // The point of the whole inversion: a harness that mounted the port would
    // refuse to coexist with the next harness installed.
    const { registry, ports } = recordingRegistry();

    contributeTiers(registry, {
      harness: "claude",
      models: ["sonnet"],
      git: git(),
      make: fakeHarness,
    });

    expect(ports).toEqual([]);
  });

  it("builds a separate harness per tier, so each gets its own model", () => {
    const asked: string[] = [];
    const { registry } = recordingRegistry();

    contributeTiers(registry, {
      harness: "claude",
      models: ["sonnet", "opus"],
      git: git(),
      make: (model) => {
        asked.push(model);
        return fakeHarness("claude");
      },
    });

    expect(asked).toEqual(["sonnet", "opus"]);
  });
});

describe("handing a step to a skill", () => {
  /** A harness that records what it was asked and answers a clear triage. */
  function recordingHarness(prompts: string[]): Harness {
    return {
      name: "claude",
      ask: async (prompt: string) => {
        prompts.push(prompt);
        return { text: '{"clear": true}', run: fakeRun({ harness: "claude" }) };
      },
    };
  }

  function tierWith(prompts: string[]) {
    const { registry } = recordingRegistry();
    const [tier] = contributeTiers(registry, {
      harness: "claude",
      models: ["sonnet"],
      git: git(),
      make: () => recordingHarness(prompts),
    });
    return tier!;
  }

  it("invokes the skill and still asks for the same answer", async () => {
    const prompts: string[] = [];

    await tierWith(prompts).using("logion").triage(ticket());

    // The invocation goes first and amy's own instructions follow, because
    // the answer has to arrive in the same shape whoever does the work.
    expect(prompts[0]?.startsWith("/logion\n\n")).toBe(true);
    expect(prompts[0]).toContain("single JSON object");
  });

  it("asks in amy's own words when no skill was named", async () => {
    const prompts: string[] = [];

    await tierWith(prompts).agent.triage(ticket());

    expect(prompts[0]?.startsWith("/")).toBe(false);
  });

  it("keeps the harness and the model it was contributed with", async () => {
    // The skill is a third axis, not a replacement for the other two: the
    // relay still needs to know where to go after a quota refusal.
    const prompts: string[] = [];
    const result = await tierWith(prompts).using("logion").triage(ticket());

    expect(result.run.harness).toBe("claude");
  });
});
