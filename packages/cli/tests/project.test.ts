import { describe, expect, it } from "vitest";
import path from "node:path";
import { DEFAULT_CONFIG } from "../src/config.js";
import { profilePaths } from "../src/paths.js";
import { profiles } from "../src/profiles.js";
import { hostPaths, pluginSlices } from "../src/slices.js";

describe("a project is three phases", () => {
  const root = path.join("/projects", "invoices");
  const config = {
    ...DEFAULT_CONFIG,
    workflows: {
      grooming: {
        workflow: path.join(root, "brief"),
        agent: { ladder: ["claude:opus"], budget: { perFiveHours: { tokens: 1000 } } },
      },
      execution: {
        workflow: path.join(root, "workflow"),
        agent: { ladder: ["claude:haiku"], budget: { perFiveHours: { tokens: 20 } } },
      },
      proving: { workflow: path.join(root, "test") },
    },
  };

  it("gives every phase its own queue, records, log and budget", () => {
    const known = profiles(config);
    const phasePaths = Object.values(known).map((profile) => profilePaths("/amy", profile));

    expect(new Set(phasePaths.map((place) => place.queue)).size).toBe(3);
    expect(new Set(phasePaths.map((place) => place.records)).size).toBe(3);
    expect(new Set(phasePaths.map((place) => place.log)).size).toBe(3);
    expect(new Set(phasePaths.map((place) => place.pid)).size).toBe(3);
  });

  it("shares briefs through the project artifact root, never another phase state", () => {
    const known = profiles(config);
    const grooming = known.grooming!;
    const execution = known.execution!;
    const groomingPaths = hostPaths(config, "/amy", grooming);
    const executionPaths = hostPaths(config, "/amy", execution);

    expect(groomingPaths.artifacts).toBe(executionPaths.artifacts);
    expect(groomingPaths.artifacts).not.toContain("..");
    expect(pluginSlices(config, grooming)["@amykit/plugin-file-brief-store"]).toEqual({ directory: "briefs" });
    expect(pluginSlices(config, execution)["@amykit/plugin-file-brief-store"]).toEqual({ directory: "briefs" });
  });

  it("lets the grooming and execution phases choose separate model ladders and budgets", () => {
    const known = profiles(config);
    const grooming = pluginSlices(config, known.grooming!) as Record<string, Record<string, unknown>>;
    const execution = pluginSlices(config, known.execution!) as Record<string, Record<string, unknown>>;

    expect(grooming["@amykit/plugin-agent-relay"]?.ladder).toEqual(["claude:opus"]);
    expect(execution["@amykit/plugin-agent-relay"]?.ladder).toEqual(["claude:haiku"]);
    expect(grooming["@amykit/plugin-agent-relay"]?.budget).not.toEqual(execution["@amykit/plugin-agent-relay"]?.budget);
  });

  it("keeps a workflow-only project compatible without a new configuration key", () => {
    const only = profiles({ ...DEFAULT_CONFIG, workflows: { execution: { workflow: path.join(root, "workflow") } } });

    expect(only.execution?.project).toBeUndefined();
    expect(profilePaths("/amy", only.execution!).records).toBe("/amy/execution/records");
    expect(only.execution?.agent).toBeUndefined();
  });

  it("keeps the project state component bounded for long valid paths", () => {
    const longRoot = path.join("/projects", "x".repeat(500));
    const known = profiles({
      ...DEFAULT_CONFIG,
      workflows: {
        grooming: { workflow: path.join(longRoot, "brief") },
        execution: { workflow: path.join(longRoot, "workflow") },
      },
    });

    const component = profilePaths("/amy", known.execution!).records.split(path.sep)[3]!;
    expect(component).toHaveLength(43);
  });
});
