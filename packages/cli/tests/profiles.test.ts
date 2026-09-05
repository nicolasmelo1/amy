import { describe, it, expect } from "vitest";
import { DEFAULT_CONFIG } from "../src/config.js";
import { directoriesFor, profiles, recommendedFor, resolveProfile } from "../src/profiles.js";

/** A config that has one workflow this repository has never heard of. */
const WITH_ONCALL = {
  ...DEFAULT_CONFIG,
  workflows: {
    oncall: { workflow: "@acme/workflow-oncall", plugins: ["@acme/workflow-oncall"] },
  },
};

describe("which workflows an install can drive", () => {
  it("drives the three it ships with, before anybody writes a config", () => {
    expect(Object.keys(profiles(DEFAULT_CONFIG))).toEqual([
      "ticket-to-qa",
      "note-to-plan",
      "errand",
    ]);
  });

  it("drives one the config declares and this package never heard of", () => {
    const resolution = resolveProfile(WITH_ONCALL, "oncall");

    expect(resolution.ok).toBe(true);
    expect(resolution.ok && resolution.profile.workflow).toBe("@acme/workflow-oncall");
  });

  it("keeps the shipped ones beside it", () => {
    expect(Object.keys(profiles(WITH_ONCALL))).toContain("ticket-to-qa");
  });

  it("lets a config replace a shipped one without renaming it", () => {
    const config = {
      ...DEFAULT_CONFIG,
      workflows: { "ticket-to-qa": { workflow: "@acme/workflow-tickets" } },
    };

    expect(resolveProfile(config, "ticket-to-qa")).toMatchObject({
      profile: { workflow: "@acme/workflow-tickets" },
    });
  });

  it("names what there was, rather than saying no", () => {
    const resolution = resolveProfile(WITH_ONCALL, "onkall");

    expect(resolution.ok).toBe(false);
    expect(!resolution.ok && resolution.problem).toContain("oncall");
  });

  it("takes the configured default when nothing is named", () => {
    const config = { ...WITH_ONCALL, defaultWorkflow: "oncall" };

    expect(resolveProfile(config, undefined)).toMatchObject({ profile: { name: "oncall" } });
  });

  it("takes the first declared when there is no default either", () => {
    expect(resolveProfile(DEFAULT_CONFIG, undefined)).toMatchObject({
      profile: { name: "ticket-to-qa" },
    });
  });

  it("recommends the shared set for a workflow it does not know", () => {
    const oncall = resolveProfile(WITH_ONCALL, "oncall");
    if (!oncall.ok) throw new Error(oncall.problem);

    expect(recommendedFor(oncall.profile)).toContain("@acme/workflow-oncall");
    expect(recommendedFor(oncall.profile)).toContain("@amykit/plugin-serial-engine");
  });
});

describe("where a profile keeps its state", () => {
  it("gives every profile its own pair, named after it", () => {
    expect(directoriesFor("oncall")).toEqual({
      records: "oncall/records",
      queue: "oncall/queue",
    });
  });

  it("collides with no other profile, which is what makes swapping safe", () => {
    const seen = new Set<string>();

    for (const name of [...Object.keys(profiles(WITH_ONCALL))]) {
      const dirs = directoriesFor(name);
      expect(seen.has(dirs.records)).toBe(false);
      expect(seen.has(dirs.queue)).toBe(false);
      seen.add(dirs.records).add(dirs.queue);
    }
  });
});
