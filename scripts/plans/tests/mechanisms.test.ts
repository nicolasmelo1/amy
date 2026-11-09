import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import yaml from "yaml";
import { describe, expect, it } from "vitest";
import { plansAdvancedBy } from "../advanced.js";

/**
 * The paths the gate and the mechanism catalog read are how a change finds the
 * proof it owes and the crossings it has to answer. A directory that moves and
 * leaves one of those paths behind is a change the gate no longer sees, which
 * passes quietly. Held here for the move of the shipped workflows out of
 * packages/ into examples/ (plans/the-examples-are-not-the-machine.md).
 */

const root = path.resolve(import.meta.dirname, "../../..");
const MOVED = ["workflow-errand", "workflow-feature-grooming", "workflow-note-to-plan", "workflow-pull-request", "workflow-ticket-to-qa"];

interface Gate {
  activation?: string[];
  plan?: string;
}

const policy = yaml.parse(fs.readFileSync(path.join(root, ".software-factory/policy.yaml"), "utf8")) as { gates: Record<string, Gate> };
const catalog = yaml.parse(fs.readFileSync(path.join(root, "docs/mechanisms.yaml"), "utf8")) as {
  mechanisms: Array<{ id: string; paths: string[] }>;
};
const gates = Object.entries(policy.gates).map(([name, gate]) => ({ name, plan: gate.plan ?? "", activation: gate.activation ?? [] }));

const tracked = execFileSync("git", ["ls-files", "-z", "--cached", "--others", "--exclude-standard"], { cwd: root, encoding: "utf8" })
  .split("\0")
  .filter((file) => file !== "" && fs.existsSync(path.join(root, file)));

/** The mechanisms whose paths a change to `file` reaches. */
function crossings(file: string): string[] {
  return catalog.mechanisms.filter((mechanism) => mechanism.paths.some((pattern) => path.matchesGlob(file, pattern))).map((mechanism) => mechanism.id);
}

describe("the paths the gate and the catalog read follow the move", () => {
  const every = [
    ...gates.flatMap((gate) => gate.activation.map((pattern) => ({ where: `gate ${gate.name}`, pattern }))),
    ...catalog.mechanisms.flatMap((mechanism) => mechanism.paths.map((pattern) => ({ where: `mechanism ${mechanism.id}`, pattern }))),
  ];

  it("names no moved workflow under packages/", () => {
    const stale = every.filter(({ pattern }) => MOVED.some((name) => pattern.startsWith(`packages/${name}`)));
    expect(stale).toEqual([]);
  });

  it("reaches, from every path naming a moved workflow, a file that exists", () => {
    const naming = every.filter(({ pattern }) => MOVED.some((name) => pattern.startsWith(`examples/${name}`)) || pattern.startsWith("examples/workflow-*"));
    const empty = naming.filter(({ pattern }) => !tracked.some((file) => path.matchesGlob(file, pattern)));

    expect(naming.length).toBeGreaterThan(10);
    expect(empty).toEqual([]);
  });
});

describe("the scenarios read the workflows where they now are", () => {
  it("leaves no evidence script reaching a moved workflow under packages/, however the path is spelled", () => {
    // `dist("packages", "workflow-ticket-to-qa")` names the old place as well
    // as "packages/workflow-ticket-to-qa" does, and passes on any disk that
    // still holds a build from before the move.
    const spelled = /packages["'/,\s]+(workflow-errand|workflow-feature-grooming|workflow-note-to-plan|workflow-pull-request|workflow-ticket-to-qa)\b/;
    const stale = tracked
      .filter((file) => file.startsWith(".software-factory/evidence/") && /\.(ts|sh)$/.test(file))
      .flatMap((file) => fs.readFileSync(path.join(root, file), "utf8").split("\n")
        .filter((line) => spelled.test(line))
        .map((line) => `${file}: ${line.trim()}`));

    expect(stale).toEqual([]);
  });
});

describe("a change under examples/ is seen where it was seen before", () => {
  it("activates the gate that proves the workflow it changed", () => {
    const advanced = plansAdvancedBy(
      ["examples/workflow-errand/src/actions.ts", "examples/workflow-ticket-to-qa/src/plugin.ts", "examples/workflow-note-to-plan/src/decide.ts"],
      gates,
    ).flatMap(({ via }) => via);

    expect(advanced).toEqual(expect.arrayContaining(["errand", "ticket-to-qa", "note-to-plan", "plugin-github"]));
  });

  it("reaches the crossings it reached from packages/", () => {
    expect(crossings("examples/workflow-errand/workflow.mmd")).toContain("diagram");
    expect(crossings("examples/workflow-ticket-to-qa/src/machine.ts")).toContain("record-migration");
    expect(crossings("examples/workflow-errand/src/record.ts")).toContain("record-migration");
    expect(crossings("examples/workflow-ticket-to-qa/src/agent-steps.ts")).toContain("agent-replies");
  });

  it("still reaches the diagram from a workflow under packages/", () => {
    expect(crossings("packages/some-workflow/workflow.mmd")).toContain("diagram");
  });
});
