import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { loadConfig, removeProfile, writeProfilePlugins } from "../src/config.js";
import { profiles, resolveProfile } from "../src/profiles.js";

describe("forgetting a workflow", () => {
  let home: string;

  beforeEach(() => {
    home = fs.mkdtempSync(path.join(os.tmpdir(), "amy-rm-"));
    fs.writeFileSync(
      path.join(home, "config.yaml"),
      `# what the team reviews in\nrepos:\n  - acme/widgets\n\nworkflows:\n` +
        `  oncall:\n    workflow: "@acme/workflow-oncall"\n` +
        `  weekly:\n    workflow: "@acme/workflow-weekly"\n`,
      "utf-8",
    );
  });

  afterEach(() => fs.rmSync(home, { recursive: true, force: true }));

  it("drops the one named", () => {
    removeProfile(home, "oncall", loadConfig(home));

    expect(resolveProfile(loadConfig(home), "oncall").ok).toBe(false);
  });

  it("leaves every other profile drivable", () => {
    removeProfile(home, "oncall", loadConfig(home));

    expect(resolveProfile(loadConfig(home), "weekly")).toMatchObject({
      profile: { workflow: "@acme/workflow-weekly" },
    });
  });

  it("keeps the comments that explain every other setting", () => {
    removeProfile(home, "oncall", loadConfig(home));

    expect(fs.readFileSync(path.join(home, "config.yaml"), "utf-8")).toContain(
      "# what the team reviews in",
    );
  });

  it("leaves the shipped workflows where they were", () => {
    // Dropping a profile the config declared cannot remove one it never did:
    // the two that ship are a default, and a default is not an entry.
    removeProfile(home, "oncall", loadConfig(home));

    expect(Object.keys(profiles(loadConfig(home)))).toContain("ticket-to-qa");
  });

  it("writes a config with no workflows block when the last one goes", () => {
    for (const name of ["oncall", "weekly"]) removeProfile(home, name, loadConfig(home));

    const written = fs.readFileSync(path.join(home, "config.yaml"), "utf-8");
    expect(written).not.toContain("@acme/workflow");
    expect(loadConfig(home).workflows).toEqual({});
  });

  it("does not touch the log, because the budget is measured off it", () => {
    // The one directory `amy workflow rm` will not delete. Removing what a
    // workflow spent would move a ceiling rather than tidy a directory.
    const log = path.join(home, "log");
    fs.mkdirSync(log);
    fs.writeFileSync(path.join(log, "2026-09-05.jsonl"), '{"kind":"agent.run"}\n', "utf-8");

    removeProfile(home, "oncall", loadConfig(home));

    expect(fs.readdirSync(log)).toEqual(["2026-09-05.jsonl"]);
  });

  it("survives a profile that was written by `plugin add` rather than by hand", () => {
    writeProfilePlugins(home, "oncall", ["@acme/workflow-oncall"], loadConfig(home));
    removeProfile(home, "oncall", loadConfig(home));

    expect(loadConfig(home).workflows.oncall).toBeUndefined();
  });
});
