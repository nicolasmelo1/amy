import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  DEFAULT_CONFIG,
  EXAMPLE_ROSTER,
  confirmRoster,
  loadConfig,
  loadRoster,
  writeProfilePlugins,
} from "../src/config.js";
import { paths } from "../src/paths.js";

describe("config", () => {
  let root: string;

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), "amy-config-"));
    fs.mkdirSync(paths(root).base, { recursive: true });
  });

  afterEach(() => {
    fs.rmSync(root, { recursive: true, force: true });
  });

  it("falls back to defaults when there is no config file", () => {
    expect(loadConfig(root)).toEqual(DEFAULT_CONFIG);
  });

  it("keeps the defaults for anything the file leaves out", () => {
    fs.writeFileSync(paths(root).config, "repos:\n  - a/b\n");

    const config = loadConfig(root);

    expect(config.repos).toEqual(["a/b"]);
    expect(config.qaStatusName).toBe("In QA");
    expect(config.policy).toEqual(DEFAULT_CONFIG.policy);
  });

  it("merges a partial policy rather than replacing it", () => {
    fs.writeFileSync(paths(root).config, "policy:\n  maxGateAttempts: 9\n");

    const config = loadConfig(root);

    expect(config.policy.maxGateAttempts).toBe(9);
    expect(config.policy.maxImplementAttempts).toBe(
      DEFAULT_CONFIG.policy.maxImplementAttempts,
    );
  });

  it("refuses to run without a roster", () => {
    expect(() => loadRoster(root)).toThrow(/no roster at/);
  });

  it("refuses a roster that is missing a required part", () => {
    fs.writeFileSync(paths(root).roster, "confirmedOn: 2026-09-03\n");

    expect(() => loadRoster(root)).toThrow(/needs confirmedOn, reviewers and qa/);
  });

  it("reads a full roster", () => {
    fs.writeFileSync(paths(root).roster, EXAMPLE_ROSTER);

    const roster = loadRoster(root);

    expect(roster.reviewers.map((r) => r.host)).toEqual([
      "ada",
      "alan",
      "edsger",
    ]);
    expect(roster.qa.tracker).toBe("grace@example.test");
  });

  it("stamps today's date without touching anything else", () => {
    fs.writeFileSync(paths(root).roster, EXAMPLE_ROSTER);

    const confirmed = confirmRoster(root, new Date("2026-09-03T09:00:00.000Z"));

    expect(confirmed.confirmedOn).toBe("2026-09-03");
    expect(loadRoster(root).confirmedOn).toBe("2026-09-03");
    expect(loadRoster(root).reviewers).toHaveLength(3);
  });
});

describe("writing a profile's plugin list", () => {
  let root: string;

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), "amy-config-"));
    fs.mkdirSync(paths(root).base, { recursive: true });
  });

  afterEach(() => fs.rmSync(root, { recursive: true, force: true }));

  const file = () => paths(root).config;

  const writeConfig = (text: string) => {
    fs.writeFileSync(file(), text, "utf-8");
  };

  it("keeps the comments that explain every other setting", () => {
    writeConfig(
      '# what the team reviews in\nrepos:\n  - acme/widgets\nworkflows:\n  tickets:\n    workflow: "@amykit/workflow-ticket-to-qa"\n',
    );

    writeProfilePlugins(root, "tickets", ["@acme/plugin-mine"], loadConfig(root));

    expect(fs.readFileSync(file(), "utf-8")).toContain("# what the team reviews in");
    expect(loadConfig(root).workflows["tickets"]?.plugins).toEqual(["@acme/plugin-mine"]);
  });

  it("writes the workflow the profile drives beside its plugins", () => {
    writeConfig(
      'workflows:\n  plans:\n    workflow: "@amykit/workflow-note-to-plan"\n    notes: true\n',
    );

    writeProfilePlugins(root, "plans", ["@amykit/workflow-note-to-plan"], loadConfig(root));

    expect(loadConfig(root).workflows["plans"]).toMatchObject({
      workflow: "@amykit/workflow-note-to-plan",
      notes: true,
    });
  });

  it("edits one profile without touching another", () => {
    writeConfig(
      'workflows:\n  tickets:\n    workflow: "@amykit/workflow-ticket-to-qa"\n  plans:\n    workflow: "@amykit/workflow-note-to-plan"\n',
    );

    writeProfilePlugins(root, "tickets", ["@acme/plugin-one"], loadConfig(root));
    writeProfilePlugins(root, "plans", ["@acme/plugin-two"], loadConfig(root));

    const config = loadConfig(root);
    expect(config.workflows["tickets"]?.plugins).toEqual(["@acme/plugin-one"]);
    expect(config.workflows["plans"]?.plugins).toEqual(["@acme/plugin-two"]);
  });

  it("refuses a profile nobody declared, rather than inventing one", () => {
    expect(() => writeProfilePlugins(root, "oncall", [], loadConfig(root))).toThrow("oncall");
  });
});