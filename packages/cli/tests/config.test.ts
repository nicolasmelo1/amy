import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  DEFAULT_CONFIG,
  configuredAutoUpdateProblems,
  loadConfig,
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

  it("keeps relative filesystem workflows portable when loading config", () => {
    fs.writeFileSync(paths(root).config, "workflows:\n  execution:\n    workflow: ./project/workflow\n");

    expect(loadConfig(root).workflows.execution?.workflow).toBe("./project/workflow");
  });

  it.each(["autoUpdate: null\n", "autoUpdate: every day\n"])("preserves malformed auto-update source %j", (text) => {
    fs.writeFileSync(paths(root).config, text);

    const config = loadConfig(root);

    expect(config.autoUpdate).toEqual(DEFAULT_CONFIG.autoUpdate);
    expect(configuredAutoUpdateProblems(config)).toEqual(["`autoUpdate` must be a mapping"]);
  });

  it("expands `~` in a per-repository checkout path", () => {
    fs.writeFileSync(
      paths(root).config,
      "repos:\n  - a/b\ncheckouts:\n  a/b: ~/code/b\n",
    );

    const config = loadConfig(root);

    expect(config.checkouts["a/b"]).toBe(path.join(os.homedir(), "code", "b"));
  });

  it("keeps an empty `checkouts` block when the file names none", () => {
    fs.writeFileSync(paths(root).config, "repos:\n  - a/b\n");

    expect(loadConfig(root).checkouts).toEqual({});
  });

  it("merges a partial policy rather than replacing it", () => {
    fs.writeFileSync(paths(root).config, "policy:\n  maxGateAttempts: 9\n");

    const config = loadConfig(root);

    expect(config.policy.maxGateAttempts).toBe(9);
    expect(config.policy.maxImplementAttempts).toBe(
      DEFAULT_CONFIG.policy.maxImplementAttempts,
    );
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

  it("preserves a relative workflow spec when rewriting its plugins", () => {
    writeConfig("workflows:\n  execution:\n    workflow: ./project/workflow\n");

    writeProfilePlugins(root, "execution", ["@acme/plugin-one"], loadConfig(root));

    expect(fs.readFileSync(file(), "utf-8")).toContain("workflow: ./project/workflow");
  });

  it("restores a normalized filesystem workflow plugin to its configured spelling", () => {
    writeConfig("workflows:\n  execution:\n    workflow: ./project/workflow\n    plugins:\n      - ./project/workflow\n");
    writeProfilePlugins(root, "execution", [path.join(root, "project", "workflow"), "@acme/plugin-one"], loadConfig(root));

    expect(loadConfig(root).workflows.execution?.plugins).toEqual(["./project/workflow", "@acme/plugin-one"]);
  });

  it("refuses a profile nobody declared, rather than inventing one", () => {
    expect(() => writeProfilePlugins(root, "oncall", [], loadConfig(root))).toThrow("oncall");
  });
});