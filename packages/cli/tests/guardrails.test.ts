import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import YAML from "yaml";
import { DEFAULT_CONFIG } from "../src/config.js";
import { guardrailRules, writeWorkflow } from "../src/workflow.js";

// What `sf check` and `sf verify` say about these files is proven by the
// workflow-new scenario, which runs the real binary; this suite needs none.
describe("a workflow ships with its guardrails", () => {
  let home: string;
  let factory: string;

  beforeEach(() => {
    home = fs.mkdtempSync(path.join(os.tmpdir(), "amy-guardrails-"));
    factory = path.join(writeWorkflow(home, "oncall", DEFAULT_CONFIG), ".software-factory");
  });
  afterEach(() => fs.rmSync(home, { recursive: true, force: true }));

  it("enables the three guardrails and nothing else", () => {
    const policy = YAML.parse(fs.readFileSync(path.join(factory, "policy.yaml"), "utf-8")) as { rules: Record<string, { enabled: boolean }> };

    expect(guardrailRules().map(([id]) => id)).toEqual([
      "L6.BRANCH_RESET_LOSES_COMMITS",
      "L6.EMPTY_FOLD_AGREES_WITH_EVERYTHING",
      "L6.FOLD_READS_A_MOVED_RECORD",
    ]);
    expect(policy.rules).toEqual(Object.fromEntries(guardrailRules().map(([id]) => [id, { enabled: true }])));
  });

  it("writes each rule as a repo-local rule, so sf needs nothing beyond its own binary", () => {
    for (const [id, file] of guardrailRules()) {
      const rule = YAML.parse(fs.readFileSync(path.join(factory, "rules", file), "utf-8")) as { id: string; why: string; fix: string };
      expect(rule.id).toBe(id);
      expect(rule.why.length, `${id} says why`).toBeGreaterThan(0);
      expect(rule.fix.length, `${id} says how to fix it`).toBeGreaterThan(0);
    }
  });

  it("gives every rule a fixture that is a repository of its own, enabling only that rule", () => {
    for (const [id, file] of guardrailRules()) {
      const fixture = path.join(factory, "mutations", id);
      const policy = YAML.parse(fs.readFileSync(path.join(fixture, ".software-factory", "policy.yaml"), "utf-8")) as { rules: object };

      expect(policy.rules).toEqual({ [id]: { enabled: true } });
      expect(fs.readFileSync(path.join(fixture, ".software-factory", "rules", file), "utf-8"))
        .toBe(fs.readFileSync(path.join(factory, "rules", file), "utf-8"));
      expect(fs.readdirSync(fixture).filter((entry) => entry !== ".software-factory"), `${id} has something to trip on`).not.toEqual([]);
    }
  });

  it("keeps the guardrails out of the package a workflow publishes", () => {
    const manifest = JSON.parse(fs.readFileSync(path.join(factory, "..", "package.json"), "utf-8")) as { files: string[] };

    expect(manifest.files).toEqual(["dist"]);
  });
});
