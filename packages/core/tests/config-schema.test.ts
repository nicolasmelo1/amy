import { describe, it, expect } from "vitest";
import { ConfigSchema, validateConfig } from "../src/config-schema.js";

const SCHEMA: ConfigSchema = {
  target: { type: "string", description: "where announcements go", required: true },
  retries: { type: "number", description: "how many times to try", default: 3 },
  loud: { type: "boolean", description: "print everything" },
  repos: { type: "string[]", description: "the repositories to watch" },
  byTeam: { type: "record", description: "team key to repository" },
};

describe("validateConfig", () => {
  it("accepts a configuration that matches", () => {
    const result = validateConfig("@amykit/plugin-x", SCHEMA, {
      target: "slack:ops",
      retries: 5,
      loud: true,
      repos: ["acme/widgets"],
      byTeam: { ACME: "acme/widgets" },
    });

    expect(result).toEqual({
      ok: true,
      config: {
        target: "slack:ops",
        retries: 5,
        loud: true,
        repos: ["acme/widgets"],
        byTeam: { ACME: "acme/widgets" },
      },
    });
  });

  it("names the plugin and the field when something required is missing", () => {
    const result = validateConfig("@amykit/plugin-x", SCHEMA, {});

    expect(result.ok).toBe(false);
    expect(result.ok === false && result.problems[0]).toBe(
      "@amykit/plugin-x: `target` is required — where announcements go",
    );
  });

  it("fills in a default rather than leaving a hole", () => {
    const result = validateConfig("@amykit/plugin-x", SCHEMA, { target: "slack:ops" });

    expect(result.ok === true && result.config.retries).toBe(3);
  });

  it("leaves an optional field with no default alone", () => {
    const result = validateConfig("@amykit/plugin-x", SCHEMA, { target: "slack:ops" });

    expect(result.ok === true && "loud" in result.config).toBe(false);
  });

  it("says what the type should have been, and what it got", () => {
    const result = validateConfig("@amykit/plugin-x", SCHEMA, { target: 42 });

    expect(result.ok === false && result.problems[0]).toContain("`target` must be string, got number");
  });

  it("refuses a setting the plugin does not have, because that is a typo", () => {
    // Ignoring it means the setting silently never applied, which is worse
    // than refusing it.
    const result = validateConfig("@amykit/plugin-x", SCHEMA, { target: "x", targt: "y" });

    expect(result.ok === false && result.problems[0]).toBe(
      "@amykit/plugin-x: `targt` is not a setting this plugin has",
    );
  });

  it("reports every problem, so one boot fixes one round of edits", () => {
    const result = validateConfig("@amykit/plugin-x", SCHEMA, { retries: "many", nope: 1 });

    expect(result.ok === false && result.problems).toHaveLength(3);
  });

  it("refuses a configuration that is not a mapping at all", () => {
    expect(validateConfig("@amykit/plugin-x", SCHEMA, ["a list"])).toEqual({
      ok: false,
      problems: ["@amykit/plugin-x: configuration must be a mapping"],
    });
  });

  it("treats an absent configuration as an empty one", () => {
    const result = validateConfig("@amykit/plugin-x", { loud: { type: "boolean", description: "d" } }, undefined);

    expect(result).toEqual({ ok: true, config: {} });
  });

  it("rejects a list of things that are not all strings", () => {
    const result = validateConfig("@amykit/plugin-x", SCHEMA, { target: "x", repos: ["a", 2] });

    expect(result.ok === false && result.problems[0]).toContain("`repos` must be string[]");
  });

  it("does not accept a list where a mapping was declared", () => {
    const result = validateConfig("@amykit/plugin-x", SCHEMA, { target: "x", byTeam: ["a"] });

    expect(result.ok === false && result.problems[0]).toContain("got an array");
  });

  it("does not accept a number that is not finite", () => {
    const result = validateConfig("@amykit/plugin-x", SCHEMA, { target: "x", retries: Number.NaN });

    expect(result.ok).toBe(false);
  });
});

describe("a setting that must name another setting's key", () => {
  // The dotted keys declare the group, and the oneOf setting may only name its leaves.
  const ESCALATION: ConfigSchema = {
    "escalation.scale.patient": { type: "number", required: true, description: "rounds a patient level allows" },
    "escalation.scale.normal": { type: "number", required: true, description: "rounds a normal level allows" },
    "escalation.scale.immediate": { type: "number", required: true, description: "rounds an immediate level allows" },
    "escalation.origins.gate.level": {
      type: "oneOf",
      group: "escalation.scale",
      required: true,
      description: "the level the gate's rounds are counted at",
    },
  };

  const scale = { patient: 3, normal: 2, immediate: 1 };

  it("refuses a value outside the group, naming the setting and every name it accepts", () => {
    // config-schema.ts:455 names the accepted keys; a misspelt level is a threshold nobody applies.
    const result = validateConfig("@amykit/plugin-x", ESCALATION, {
      escalation: { scale, origins: { gate: { level: "quickly" } } },
    });

    expect(result.ok).toBe(false);
    const said = result.ok === false ? result.problems.join("; ") : "";
    expect(said).toContain("`escalation.origins.gate.level` must be one of " + "`patient`, `normal`, `immediate`");
    expect(said).toContain('got "quickly"');
    expect(said).toContain("the level the gate's rounds are counted at");
  });

  it("accepts one of the names the group declares", () => {
    const result = validateConfig("@amykit/plugin-x", ESCALATION, {
      escalation: { scale, origins: { gate: { level: "patient" } } },
    });

    expect(result.ok).toBe(true);
    expect(result.ok === true && result.config).toEqual({
      escalation: { scale, origins: { gate: { level: "patient" } } },
    });
  });

  it("refuses a value that is not a name at all", () => {
    const result = validateConfig("@amykit/plugin-x", ESCALATION, {
      escalation: { scale, origins: { gate: { level: 3 } } },
    });

    expect(result.ok).toBe(false);
    const said = result.ok === false ? result.problems.join("; ") : "";
    expect(said).toContain("`escalation.origins.gate.level` must be a name, got number");
  });

  it("refuses a default that names nothing the group declares", () => {
    const withDefault: ConfigSchema = {
      ...ESCALATION,
      "escalation.origins.thread.level": {
        type: "oneOf",
        group: "escalation.scale",
        default: "quickly",
        description: "the level a review thread's rounds are counted at",
      },
    };

    const result = validateConfig("@amykit/plugin-x", withDefault, {
      escalation: { scale, origins: { gate: { level: "patient" } } },
    });

    expect(result.ok).toBe(false);
    const said = result.ok === false ? result.problems.join("; ") : "";
    expect(said).toContain("escalation.origins.thread.level");
    expect(said).toContain("quickly");
  });
});
