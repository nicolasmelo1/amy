import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { parse } from "yaml";

/**
 * A gate whose scenario imports a workflow's built code proves that code, so a
 * change to the workflow must activate the gate. Otherwise the sealed evidence
 * stays "fresh" while the scenario, run live by `npm run e2e`, is red: #219
 * changed ticket-to-qa's prompts and only the e2e job saw that
 * `plugin-agent-relay` no longer held.
 */

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const evidence = path.join(root, ".software-factory/evidence");

interface Gate {
  readonly activation?: readonly string[];
}

const gates = (parse(fs.readFileSync(path.join(root, ".software-factory/policy.yaml"), "utf8")) as { gates: Record<string, Gate> }).gates;

/** The files a gate's scenario is made of: its script and everything in its own directory. */
function scenarioFiles(gate: string): string[] {
  const script = path.join(evidence, `${gate}-scenario.sh`);
  const directory = path.join(evidence, gate);
  const inDirectory = fs.existsSync(directory)
    ? fs.readdirSync(directory).map((file) => path.join(directory, file)).filter((file) => fs.statSync(file).isFile())
    : [];
  return [...(fs.existsSync(script) ? [script] : []), ...inDirectory];
}

/** The example workflows whose built code a gate's scenario imports. */
function workflowsImported(gate: string): string[] {
  const found = new Set<string>();
  for (const file of scenarioFiles(gate)) {
    const text = fs.readFileSync(file, "utf8");
    for (const match of text.matchAll(/dist\(\s*"examples",\s*"([a-z0-9-]+)"/g)) found.add(match[1]!);
    for (const match of text.matchAll(/examples\/([a-z0-9-]+)\/dist\b/g)) found.add(match[1]!);
  }
  return [...found].sort();
}

const imports = Object.keys(gates).flatMap((gate) => workflowsImported(gate).map((workflow) => [gate, workflow] as const));

describe("a gate that imports a workflow's built code activates on that workflow", () => {
  it("finds the gates it speaks about", () => {
    expect(imports.length).toBeGreaterThan(0);
  });

  it.each(imports)("%s activates on examples/%s/src", (gate, workflow) => {
    const sources = fs
      .readdirSync(path.join(root, "examples", workflow, "src"))
      .filter((file) => file.endsWith(".ts"))
      .map((file) => `examples/${workflow}/src/${file}`);
    const activation = gates[gate]!.activation ?? [];
    const uncovered = sources.filter((source) => !activation.some((glob) => path.matchesGlob(source, glob)));

    expect(uncovered).toEqual([]);
  });
});
