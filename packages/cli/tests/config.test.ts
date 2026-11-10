import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  DEFAULT_CONFIG,
  addModeFor,
  configuredAutoUpdateProblems,
  loadConfig,
  machineSchema,
  writeProfilePlugins,
} from "../src/config.js";
import { paths } from "../src/paths.js";
import { configSchema as worktreeSchema } from "@amykit/plugin-file-worktree";
import { configSchema as gateSchema } from "@amykit/plugin-command-gate";

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
    fs.writeFileSync(paths(root).config, "retentionDays: 7\n");

    const config = loadConfig(root);

    expect(config.retentionDays).toBe(7);
    expect(config.staleClaimMs).toBe(30 * 60 * 1000);
  });

  const MOVED = [
    "policy",
    "qaStatusName",
    "plans",
    "errands",
    "workingStatusName",
    "repoByTeam",
    "repos",
    "workspaceRoot",
    "checkouts",
    "defaultBranch",
    "baseBranch",
    "worktrees",
    "gate",
  ];

  it.each(MOVED)("refuses a top-level key that moved under the work that reads it, naming where it now lives: %s", (key) => {
    fs.writeFileSync(paths(root).config, `${key}: 1\n`);

    expect(() => loadConfig(root)).toThrow(/is where it used to live — it moved/);
  });

  it("says where a moved setting went, in the message that refuses it", () => {
    fs.writeFileSync(paths(root).config, "policy:\n  maxGateAttempts: 9\n");

    expect(() => loadConfig(root)).toThrow(/settings\.policy/);
  });

  it("says where a workspace key went, naming the plugin whose slice carries it", () => {
    fs.writeFileSync(paths(root).config, "workspaceRoot: ~/work/northwind\n");

    expect(() => loadConfig(root)).toThrow(/@amykit\/plugin-file-worktree/);
    fs.writeFileSync(paths(root).config, "gate:\n  default: [npm test]\n");

    expect(() => loadConfig(root)).toThrow(/@amykit\/plugin-command-gate/);
  });

  it("carries none of the workspace's seven keys on the machine's schema or defaults", () => {
    // The machine keeps none of the seven: the repositories, the checkout
    // root and map, the two branch settings and the worktrees themselves are
    // the file-worktree plugin's slice, and the gate the command-gate's.
    const seven = ["repos", "workspaceRoot", "checkouts", "defaultBranch", "baseBranch", "gate", "worktrees"];

    for (const key of seven) {
      expect(Object.hasOwn(machineSchema, key), `machine schema carries ${key}`).toBe(false);
      expect(Object.hasOwn(DEFAULT_CONFIG, key), `machine defaults carry ${key}`).toBe(false);
    }
  });

  it("carries the workspace's six keys in the file-worktree plugin's slice, each with its default and description", () => {
    const schema = worktreeSchema as Record<string, { default?: unknown; description?: string }>;

    // The worktrees answers are the slice's root and retentionDays; the
    // workspace's other four carry the keys' own names.
    for (const key of ["repos", "workspaceRoot", "checkouts", "defaultBranch", "baseBranch", "root", "retentionDays"]) {
      const entry = schema[key];
      expect(entry, `the slice carries ${key}`).toBeDefined();
      expect(entry!.default, `${key} has a default`).toBeDefined();
      expect(entry!.description ?? "", `${key} has a description`).not.toBe("");
    }
    expect(schema.repos!.default).toEqual([]);
    expect(schema.defaultBranch!.default).toBe("main");
  });

  it("carries gate in the command-gate plugin's slice, with its default and description", () => {
    const schema = gateSchema as Record<string, { default?: unknown; description?: string }>;

    expect(schema.gate, "the gate plugin's slice carries gate").toBeDefined();
    expect(schema.gate!.default).toEqual({});
    expect(schema.gate!.description ?? "").toContain("default");
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

  it("carries a workflow profile's settings through the load untouched", () => {
    fs.writeFileSync(
      paths(root).config,
      'workflows:\n  tickets:\n    workflow: "@amykit/workflow-ticket-to-qa"\n    settings:\n      qaStatusName: In QA\n      policy:\n        maxGateAttempts: 9\n',
    );

    const config = loadConfig(root);

    expect(config.workflows["tickets"]).toMatchObject({
      workflow: "@amykit/workflow-ticket-to-qa",
      settings: { qaStatusName: "In QA", policy: { maxGateAttempts: 9 } },
    });
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
      '# what the team reviews in\nworkflows:\n  tickets:\n    workflow: "@amykit/workflow-ticket-to-qa"\n',
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

describe("what `amy add` does by default", () => {
  it("follows the config's `add` with no flag, and a flag overrides it either way", () => {
    expect(addModeFor(DEFAULT_CONFIG, {})).toBe("package");
    expect(addModeFor({ add: "fork" }, {})).toBe("fork");
    expect(addModeFor({ add: "fork" }, { package: true })).toBe("package");
    expect(addModeFor({ add: "package" }, { fork: true })).toBe("fork");
  });

  it("reads `add` and `forks` from config.yaml", () => {
    const home = fs.mkdtempSync(path.join(os.tmpdir(), "amy-add-mode-"));
    try {
      fs.writeFileSync(path.join(home, "config.yaml"), "add: fork\nforks: ~/forks\n");
      expect(addModeFor(loadConfig(home), {})).toBe("fork");
      expect(loadConfig(home).forks).toBe("~/forks");
    } finally {
      fs.rmSync(home, { recursive: true, force: true });
    }
  });

  it("refuses a mode it does not know, naming the key, whatever the flags say", () => {
    expect(() => addModeFor({ add: "copy" }, {})).toThrow("`add` in the config is `copy`, and it is `fork` or `package`");
    expect(() => addModeFor({ add: "copy" }, { fork: true })).toThrow("`add` in the config is `copy`");
    expect(() => addModeFor(DEFAULT_CONFIG, { fork: true, package: true })).toThrow("`--fork` and `--package` ask for opposite things");
  });
});

describe("the chat block", () => {
  it("charges the chat only for a boolean true, and refuses anything else by name", async () => {
    const { configuredChatProblems, loadConfigFrom } = await import("../src/config.js");
    expect(loadConfigFrom("/state", "chat:\n  budget: true\n").chat.budget).toBe(true);
    const quoted = loadConfigFrom("/state", 'chat:\n  budget: "false"\n');
    expect(quoted.chat.budget).toBe(false);
    expect(configuredChatProblems(quoted)).toEqual(["`chat.budget` must be true or false"]);
    expect(configuredChatProblems(loadConfigFrom("/state", "chat: yes\n"))).toEqual(["`chat` must be a mapping"]);
    expect(configuredChatProblems(loadConfigFrom("/state", "retentionDays: 7\n"))).toEqual([]);
  });
});
