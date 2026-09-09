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
  it("drives nothing before anybody writes a config", () => {
    expect(profiles(DEFAULT_CONFIG)).toEqual({});
  });

  it("drives one the config declares and this package never heard of", () => {
    const resolution = resolveProfile(WITH_ONCALL, "oncall");

    expect(resolution.ok).toBe(true);
    expect(resolution.ok && resolution.profile.workflow).toBe("@acme/workflow-oncall");
  });

  it("lets a config replace a declared one without renaming it", () => {
    const config = {
      ...WITH_ONCALL,
      workflows: { oncall: { workflow: "@acme/workflow-tickets" } },
    };

    expect(resolveProfile(config, "oncall")).toMatchObject({
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
    expect(resolveProfile(WITH_ONCALL, undefined)).toMatchObject({
      profile: { name: "oncall" },
    });
  });

  it("says there is nothing to drive, and names what writes one", () => {
    const resolution = resolveProfile(DEFAULT_CONFIG, undefined);

    expect(resolution.ok).toBe(false);
    expect(!resolution.ok && resolution.problem).toContain("amy workflow new");
    expect(!resolution.ok && resolution.problem).toContain("amy add");
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