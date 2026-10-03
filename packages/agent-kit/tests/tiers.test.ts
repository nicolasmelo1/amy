import { describe, it, expect } from "vitest";
import { Harness, Registry } from "@amykit/core";
import { HARNESS_COLLECTION, contributeTiers, tierName } from "../src/index.js";

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
  it("adds one harness per model, in the order given", () => {
    const { registry, named } = recordingRegistry();

    contributeTiers(registry, {
      harness: "claude",
      models: ["sonnet", "opus"],
      make: fakeHarness,
    });

    expect(named(HARNESS_COLLECTION)).toEqual(["claude:sonnet", "claude:opus"]);
  });

  it("contributes to the harness collection and nowhere else", () => {
    // One collection: the agent only answers, so there is no ticket-shaped
    // agent to contribute beside the harness any more.
    const { registry, contributions } = recordingRegistry();

    contributeTiers(registry, { harness: "claude", models: ["sonnet"], make: fakeHarness });

    expect(contributions.map((c) => c.collection)).toEqual([HARNESS_COLLECTION]);
  });

  it("carries the harness's own accounting onto every rung of it", () => {
    // Whether a run of this harness arrives with a cost on it is the
    // harness's fact, not the tier's, and whoever asks whether a ceiling in
    // money could stop anything reads it off the rung.
    const { registry, contributions } = recordingRegistry();

    const made = contributeTiers(registry, {
      harness: "hermes",
      models: ["llama-3.3", "hermes-4-405b"],
      make: fakeHarness,
      pricesItsOwnRuns: true,
    });

    expect(made.map((tier) => tier.pricesItsOwnRuns)).toEqual([true, true]);
    const bare = contributions.find(
      (c) => c.collection === HARNESS_COLLECTION && c.name === "hermes:llama-3.3",
    );

    expect(bare?.impl).toMatchObject({ pricesItsOwnRuns: true });
  });

  it("says a harness does not price itself rather than leaving it unsaid", () => {
    // Absent would read as "nobody has decided", and the check that consults
    // this would then treat a harness nobody thought about as one that
    // accounts for itself — which is the permissive direction.
    const { registry } = recordingRegistry();

    const made = contributeTiers(registry, {
      harness: "codex",
      models: ["gpt-5"],
      make: fakeHarness,
    });

    expect(made[0]?.pricesItsOwnRuns).toBe(false);
  });

  it("declares the harness and the model on each one", () => {
    // The relay decides where to go next before running anything, so these
    // have to be known in advance rather than discovered from a result.
    const { registry, contributions } = recordingRegistry();

    const made = contributeTiers(registry, {
      harness: "codex",
      models: ["gpt-5"],
      make: fakeHarness,
    });

    expect(made[0]).toMatchObject({ name: "codex:gpt-5", harness: "codex", model: "gpt-5" });
    expect(contributions[0]?.impl).toBe(made[0]);
  });

  it("contributes one harness when no model was configured", () => {
    const { registry, named } = recordingRegistry();

    contributeTiers(registry, { harness: "hermes", models: [], make: fakeHarness });

    expect(named(HARNESS_COLLECTION)).toEqual(["hermes"]);
  });

  it("mounts a rung named twice once, keeping the first mention", () => {
    // The shape `amy init` ships: `ladder` and a step's own ladder both naming
    // `claude:opus`. Unioned raw, the second contribution met the collection's
    // one-name rule and the mount was refused — the template's own example was
    // a config that could not boot.
    const { registry, named } = recordingRegistry();

    contributeTiers(registry, {
      harness: "claude",
      models: ["sonnet", "opus", "haiku", "opus"],
      make: fakeHarness,
    });

    expect(named(HARNESS_COLLECTION)).toEqual(["claude:sonnet", "claude:opus", "claude:haiku"]);
  });

  it("never mounts the agent port itself", () => {
    // The point of the whole inversion: a harness that mounted the port would
    // refuse to coexist with the next harness installed.
    const { registry, ports } = recordingRegistry();

    contributeTiers(registry, {
      harness: "claude",
      models: ["sonnet"],
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
      make: (model) => {
        asked.push(model);
        return fakeHarness("claude");
      },
    });

    expect(asked).toEqual(["sonnet", "opus"]);
  });
});
