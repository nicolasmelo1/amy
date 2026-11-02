import { describe, expect, it } from "vitest";
import { describeEntries, explainReport } from "../src/config-explain.js";
import { machineSchema, DEFAULT_CONFIG } from "../src/config.js";
import type { Profile } from "../src/profiles.js";

/** The mount the report explains: the recommended set, workflow included. */
const PROFILE: Profile = {
  name: "errand",
  workflow: "@amykit/workflow-errand",
  plugins: [],
  takesNotes: false,
  takesTasks: false,
  settings: {},
};

/** The machine the report is read off, with every default the loader merges. */
const CONFIG = { ...DEFAULT_CONFIG, repos: ["acme/widgets"] };

describe("describeEntries", () => {
  it("says the type, the default and the reason on one line per setting", () => {
    const lines = describeEntries(machineSchema);

    // Every line the machine answers with names all three, because an
    // operator deciding a value needs all three and a list that names two is
    // a list somebody has to go find the third for.
    expect(lines.length).toBeGreaterThan(0);
    for (const line of lines) {
      expect(line).toMatch(/required|default|not set/);
      expect(line.trim().length).toBeGreaterThan(60);
    }
  });

  it("names a defaulted value as its default, and a required one as required", () => {
    const lines = describeEntries({
      "policy.maxAttempts": { type: "number", default: 2, description: "how many times one errand may be tried" },
      repos: { type: "string[]", required: true, example: ["acme/widgets"], description: "the repositories a plan may be written into" },
    });

    expect(lines[0]).toContain("policy.maxAttempts");
    expect(lines[0]).toContain("default 2");
    expect(lines[1]).toContain("required");
  });
});

describe("explainReport", () => {
  it("lists the machine's settings first, then the plugins that mount, with defaults and descriptions", async () => {
    const report = await explainReport(CONFIG, PROFILE, undefined);

    // The machine's list comes first, and names a setting the machine keeps.
    const machine = report.lines.slice(0, report.lines.indexOf(""));
    expect(machine[0]).toBe("machine:");
    expect(machine.join("\n")).toContain("repos");

    // The mounted plugin follows, and the ceiling that once hid behind a
    // `policy: record` is on the list with its default, because a default an
    // operator cannot find is a default nobody can tune.
    expect(report.lines.join("\n")).toContain("@amykit/workflow-errand");
    const attempts = report.lines.filter((line) => line.trim().startsWith("policy.maxAttempts"));
    expect(attempts).toHaveLength(1);
    expect(attempts[0]).toContain("default 2");
  });

  it("narrows to one plugin", async () => {
    const report = await explainReport(CONFIG, PROFILE, "@amykit/plugin-file-store");

    expect(report.refused).toBeUndefined();
    expect(report.lines.join("\n")).toContain("@amykit/plugin-file-store");
    expect(report.lines.join("\n")).toContain("retentionDays");
    expect(report.lines.join("\n")).not.toContain("policy.maxAttempts");
  });

  it("refuses a name nothing mounted, naming what is mounted", async () => {
    const report = await explainReport(CONFIG, PROFILE, "@amykit/workflow-not-here");

    expect(report.refused).toContain("@amykit/workflow-not-here");
    expect(report.refused).toContain("Mounted:");
    expect(report.refused).toContain("@amykit/plugin-file-store");
  });
});