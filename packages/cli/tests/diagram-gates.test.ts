import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import YAML from "yaml";

const repo = path.resolve(import.meta.dirname, "../../..");
const read = (file: string): string => fs.readFileSync(path.join(repo, file), "utf-8");

interface Policy {
  gates: Record<string, { activation: string[] }>;
  rules: Record<string, { enabled?: boolean }>;
}

const policy = YAML.parse(read(".software-factory/policy.yaml")) as Policy;
const drawn = fs.readdirSync(path.join(repo, "packages"))
  .filter((name) => name.startsWith("workflow-") && fs.existsSync(path.join(repo, "packages", name, "workflow.mmd")));

/**
 * A changed diagram is a changed workflow. `L3.GATE_HAS_FRESH_EVIDENCE`
 * expires a gate's proof when one of its activation paths moves, and `sf
 * verify` proves that rule fires on its mutation fixture; what is left to
 * hold is that the diagram is one of those paths wherever the code is.
 */
describe("a shipped workflow's diagram activates the gates its code does", () => {
  it("holds the three shipped workflows' diagrams", () => {
    expect(drawn).toEqual(expect.arrayContaining(["workflow-errand", "workflow-note-to-plan", "workflow-ticket-to-qa"]));
  });

  it.each(drawn)("lists %s's workflow.mmd beside its source in every gate that drives it", (name) => {
    const driving = Object.entries(policy.gates).filter(([, gate]) => gate.activation.includes(`packages/${name}/src/**`));

    for (const [gate, { activation }] of driving) {
      expect(activation, gate).toContain(`packages/${name}/workflow.mmd`);
    }
  });

  it("is enforced by a rule that is on, and proven to fire", () => {
    expect(policy.rules["L3.GATE_HAS_FRESH_EVIDENCE"]?.enabled).toBe(true);
    expect(fs.existsSync(path.join(repo, ".software-factory/mutations/L3.GATE_HAS_FRESH_EVIDENCE"))).toBe(true);
  });

  it("ships each diagram in its package, where the host looks for it", () => {
    for (const name of drawn) {
      const manifest = JSON.parse(read(`packages/${name}/package.json`)) as { files: string[] };
      expect(manifest.files, name).toContain("workflow.mmd");
    }
  });
});
