import { describe, expect, it } from "vitest";
import yaml from "yaml";
import { validateConfig } from "@amykit/core";
import { configSchema } from "@amykit/workflow-ticket-to-qa";
import { EXAMPLE_CONFIG } from "../src/config.js";

const TICKET = "@amykit/workflow-ticket-to-qa";

/**
 * The ticket profile the annotated example teaches, with its leading `# `
 * taken off once — or twice, for the tune it shows as a nested comment.
 */
function uncommentedExample(tune: boolean): Record<string, unknown> {
  const lines = EXAMPLE_CONFIG.split("\n");
  const start = lines.findIndex((line) => line.startsWith("#   workflows:"));
  let end = start;
  while (end < lines.length && lines[end]!.startsWith("#  ")) end += 1;
  const block = lines
    .slice(start, end)
    .map((line) => line.slice(2))
    .map((line) => (tune ? line.replace(/^(\s*)# (?=\s*\w+:(\s|$))/, "$1") : line))
    .filter((line) => !/^\s*#/.test(line));
  return yaml.parse(block.join("\n")) as Record<string, unknown>;
}

/** A profile's settings as the mount reads them: over the repositories the workspace slice derives. */
function ticketSettings(document: Record<string, unknown>): unknown {
  const workflows = document.workflows as Record<string, { workflow: string; settings?: Record<string, unknown> }>;
  const profile = Object.values(workflows).find((one) => one.workflow === TICKET);
  return { repos: ["acme/widgets"], ...profile?.settings };
}

describe("the annotated example's ticket profile", () => {
  it("mounts once uncommented, naming every setting the workflow requires", () => {
    const result = validateConfig(TICKET, configSchema, ticketSettings(uncommentedExample(false)));

    expect(result.ok ? [] : result.problems).toEqual([]);
  });

  it("mounts with the tune it shows uncommented too, naming no setting the workflow refuses", () => {
    const result = validateConfig(TICKET, configSchema, ticketSettings(uncommentedExample(true)));
    const refused = result.ok ? [] : result.problems.filter((problem) => problem.includes("is not a setting"));

    expect(refused).toEqual([]);
  });
});
