import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
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

describe("the chat's skills are the effective ladder", () => {
  it("reads the step from the machine's ladder", async () => {
    const { chatSkills, loadConfigFrom } = await import("../src/config.js");

    expect(chatSkills(loadConfigFrom("/state", "skills:\n  chat: [/amy-groom, amy-workflow]\n"))).toEqual(["amy-groom", "amy-workflow"]);
    expect(chatSkills(loadConfigFrom("/state", "skills:\n  triage: [/logion]\n"))).toEqual([]);
    expect(chatSkills(loadConfigFrom("/state", "retentionDays: 7\n"))).toEqual([]);
  });

  it("lets the relay's own slice win, as mounting does", async () => {
    const { chatSkills, loadConfigFrom } = await import("../src/config.js");
    const config = loadConfigFrom("/state", [
      "skills:",
      "  chat: [/amy-groom]",
      "plugins:",
      "  \"@amykit/plugin-agent-relay\":",
      "    skills:",
      "      chat: [/amy-workflow]",
    ].join("\n"));

    expect(chatSkills(config)).toEqual(["amy-workflow"]);
  });

  it("reads which harnesses' skills are linked, the relay's own slice winning (A10)", async () => {
    const { harnessSkills, loadConfigFrom } = await import("../src/config.js");

    expect(harnessSkills(loadConfigFrom("/state", "harnessSkills:\n  claude: true\n  codex: false\n"))).toEqual({ claude: true, codex: false });
    expect(harnessSkills(loadConfigFrom("/state", [
      "harnessSkills:",
      "  claude: true",
      "plugins:",
      "  \"@amykit/plugin-agent-relay\":",
      "    harnessSkills:",
      "      claude: false",
    ].join("\n")))).toEqual({ claude: false });
    expect(harnessSkills(loadConfigFrom("/state", "workflows: {}\n"))).toEqual({});
  });

  it("keeps a harnessSkills that is not a mapping as it was given, for the mount to refuse (A11)", async () => {
    const { harnessSkills, loadConfigFrom } = await import("../src/config.js");

    expect(harnessSkills(loadConfigFrom("/state", "harnessSkills: true\n"))).toBe(true);
    expect(harnessSkills(loadConfigFrom("/state", "harnessSkills: [claude]\n"))).toEqual(["claude"]);
    expect(harnessSkills(loadConfigFrom("/state", [
      "harnessSkills:",
      "  claude: true",
      "plugins:",
      "  \"@amykit/plugin-agent-relay\":",
      "    harnessSkills: true",
    ].join("\n")))).toBe(true);
  });
});

describe("a profile's own config file", () => {
  let root: string;

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), "amy-config-profile-"));
    fs.mkdirSync(paths(root).base, { recursive: true });
  });

  afterEach(() => {
    fs.rmSync(root, { recursive: true, force: true });
  });


  /** Writes one profile's own file, creating its directory. */
  function profileFile(name: string, text: string): string {
    const file = path.join(paths(root).base, "profiles", name, "config.yaml");
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, text);
    return file;
  }

  it("reads the machine's config with the profile's own over it (A1)", () => {
    fs.writeFileSync(paths(root).config, [
      "notify:",
      "  inbox: true",
      "plugins:",
      "  \"@amykit/plugin-file-worktree\":",
      "    repos: [acme/widgets]",
    ].join("\n"));
    profileFile("work", [
      "notify:",
      "  hermes: \"slack:ops\"",
      "plugins:",
      "  \"@amykit/plugin-file-worktree\":",
      "    workspaceRoot: /work",
    ].join("\n"));

    const config = loadConfig(root, "work");

    // One key from each side of the same mapping, which is the point: the
    // profile's file is laid over the machine's, not swapped for it.
    expect(config.notify).toMatchObject({ inbox: true, hermes: "slack:ops" });
    expect(config.plugins["@amykit/plugin-file-worktree"]).toEqual({
      repos: ["acme/widgets"],
      workspaceRoot: "/work",
    });
  });

  it("reads exactly as today when the profile has no file of its own (A1)", () => {
    fs.writeFileSync(paths(root).config, "retentionDays: 7\n");

    expect(loadConfig(root, "work")).toEqual(loadConfig(root));
  });

  it("replaces a list or a scalar whole rather than merging it (A2)", () => {
    fs.writeFileSync(paths(root).config, [
      "retentionDays: 7",
      "plugins:",
      "  \"@amykit/plugin-linear\":",
      "    teams: [one, two]",
    ].join("\n"));
    profileFile("work", [
      "retentionDays: 9",
      "plugins:",
      "  \"@amykit/plugin-linear\":",
      "    teams: [three]",
    ].join("\n"));

    const config = loadConfig(root, "work");

    expect(config.retentionDays).toBe(9);
    expect(config.plugins["@amykit/plugin-linear"]).toEqual({ teams: ["three"] });
  });

  it.each(["workflows", "defaultWorkflow"])(
    "refuses a profile file naming the machine's `%s`, naming the file and the key (A3)",
    (key) => {
      const file = profileFile("work", `${key}: {}\n`);

      expect(() => loadConfig(root, "work")).toThrow(`\`${key}\` belongs to the machine's config`);
      expect(() => loadConfig(root, "work")).toThrow(file);
    },
  );

  it("never lets one profile's file change what another profile reads (A4)", () => {
    fs.writeFileSync(paths(root).config, [
      "workflows:",
      "  work: { workflow: \"@amykit/workflow-ticket-to-qa\" }",
      "  home: { workflow: \"@amykit/workflow-ticket-to-qa\" }",
    ].join("\n"));
    profileFile("work", [
      "plugins:",
      "  \"@amykit/plugin-linear\":",
      "    workingStatusName: In Progress",
    ].join("\n"));

    expect(loadConfig(root, "home").plugins).toEqual({});
    expect(loadConfig(root, "work").plugins).toEqual({
      "@amykit/plugin-linear": { workingStatusName: "In Progress" },
    });
  });

  it("names a profile file and the line when it does not parse", () => {
    const file = profileFile("work", "notify:\n\tinbox: true\n");

    expect(() => loadConfig(root, "work")).toThrow(`${file}:2`);
  });
});

/** Runs this CLI from source against one state directory, stdout and stderr together. */
function runCli(home: string, args: readonly string[]): string {
  const result = spawnSync(process.execPath, ["--import", "tsx", fileURLToPath(new URL("../src/index.ts", import.meta.url)), ...args], {
    cwd: fileURLToPath(new URL("..", import.meta.url)),
    env: { ...process.env, AMY_HOME: home, AMY_SUPERVISOR: "none", AMY_PROJECT_ENV: "" },
    encoding: "utf-8",
    input: "",
    timeout: 60_000,
  });
  return `${result.stdout}${result.stderr}`;
}

describe("a profile's own file survives every path that reads config", () => {
  let root: string;

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), "amy-config-review-"));
    fs.mkdirSync(paths(root).base, { recursive: true });
  });

  afterEach(() => {
    fs.rmSync(root, { recursive: true, force: true });
  });

  function profileFile(name: string, text: string): string {
    const file = path.join(paths(root).base, "profiles", name, "config.yaml");
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, text);
    return file;
  }

  // A1 and the plan's exit. A chat change is mount-checked from the
  // candidate machine bytes and the restarted loop boots from them
  // (`restartingConfig`, `mount-check --config`): both go through
  // loadConfigFrom, which never lays the profile's file over the bytes, so the
  // first chat restart drops every slice the profile keeps for itself.
  it("lays the profile's own file over config bytes, as loadConfig lays it over config.yaml (A1)", async () => {
    const { loadConfigFrom } = await import("../src/config.js");
    profileFile("work", "plugins:\n  \"@amykit/plugin-slack\":\n    channel: from-profile\n");
    const machine = "workflows:\n  work:\n    workflow: \"@amykit/workflow-ticket-to-qa\"\nplugins:\n  \"@amykit/plugin-linear\":\n    team: from-machine\n";

    const read = (loadConfigFrom as (root: string, text: string, profile?: string) => ReturnType<typeof loadConfig>)(root, machine, "work");

    expect(read.plugins).toEqual({
      "@amykit/plugin-linear": { team: "from-machine" },
      "@amykit/plugin-slack": { channel: "from-profile" },
    });
  });

  it("refuses config bytes for a profile whose own file names a machine key (A3)", async () => {
    const { loadConfigFrom } = await import("../src/config.js");
    const file = profileFile("work", "defaultWorkflow: work\n");
    const machine = "workflows:\n  work:\n    workflow: \"@amykit/workflow-ticket-to-qa\"\n";

    expect(() => (loadConfigFrom as (root: string, text: string, profile?: string) => unknown)(root, machine, "work"))
      .toThrow(file);
  });

  it("the chat restart and mount-check read config bytes for a named profile, never the machine's alone (A1)", () => {
    const source = fs.readFileSync(new URL("../src/index.ts", import.meta.url), "utf-8");
    const calls: string[] = [];
    for (let at = source.indexOf("loadConfigFrom(home,"); at !== -1; at = source.indexOf("loadConfigFrom(home,", at + 1)) {
      let depth = 0;
      let end = at + "loadConfigFrom".length;
      for (; end < source.length; end += 1) {
        if (source[end] === "(") depth += 1;
        if (source[end] === ")" && --depth === 0) break;
      }
      calls.push(source.slice(at, end + 1));
    }
    const topLevelArgs = (call: string) => {
      let depth = 0;
      let commas = 0;
      for (const char of call.slice(call.indexOf("(") + 1, -1)) {
        if ("([{".includes(char)) depth += 1;
        if (")]}".includes(char)) depth -= 1;
        if (char === "," && depth === 0) commas += 1;
      }
      return commas + 1;
    };

    expect(calls.length).toBeGreaterThan(0);
    expect(calls.filter((call) => topLevelArgs(call) < 3)).toEqual([]);
  });

  // A chat change to the machine's file is checked against every profile
  // with --all; a sibling whose own file is refused is that sibling's
  // problem, reported under its name like any other, not a crash of the
  // whole check.
  it("reports a sibling's refused own file under the sibling's name in `mount-check --all` (A3)", () => {
    const machine = [
      "workflows:",
      "  work:",
      "    workflow: \"@amykit/workflow-ticket-to-qa\"",
      "  home:",
      "    workflow: \"@amykit/workflow-ticket-to-qa\"",
      "",
    ].join("\n");
    fs.writeFileSync(paths(root).config, machine);
    const candidate = path.join(root, "candidate.yaml");
    fs.writeFileSync(candidate, machine);
    profileFile("home", "defaultWorkflow: home\n");

    const output = runCli(root, ["--workflow", "work", "mount-check", "--all", "--config", candidate]);

    expect(output).toMatch(/^home: .*`defaultWorkflow`/m);
    expect(output).toMatch(/^work: /m);
  }, 60_000);

  // A1. `queue prune` reads retentionDays from the machine's file alone.
  it("`queue prune` keeps the retention the profile's own file sets (A1)", () => {
    fs.writeFileSync(paths(root).config, "workflows:\n  work:\n    workflow: \"@amykit/workflow-ticket-to-qa\"\n");
    profileFile("work", "retentionDays: 3\n");

    expect(runCli(root, ["--workflow", "work", "queue", "prune"])).toContain("older than 3 day(s)");
  }, 60_000);
});
