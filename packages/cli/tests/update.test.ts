import { describe, expect, it, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { ScriptedRunner, whenArgsInclude } from "@amykit/test-fixtures";
import {
  Held,
  held,
  isRange,
  line,
  manifestOf,
  move,
  oneVersion,
  restore,
  roots,
  versionIn,
} from "../src/update.js";
import { readSkills, recordWrite, writeSkills } from "../src/skills-record.js";

/**
 * A package on disk, laid out the way npm lays one out under a root.
 */
function packageAt(root: string, name: string, version: string, body: string): string {
  const directory = path.join(root, "node_modules", ...name.split("/"));
  fs.mkdirSync(directory, { recursive: true });
  fs.writeFileSync(
    path.join(directory, "package.json"),
    `${JSON.stringify({ name, version, type: "module", main: "./index.js" })}\n`,
    "utf-8",
  );
  fs.writeFileSync(path.join(directory, "index.js"), body, "utf-8");
  return directory;
}

/** A private npm root holding one package, the way `ensurePluginsRoot` writes one. */
function rootWith(home: string, dependencies: Record<string, string>): string {
  const root = path.join(home, "plugins");
  fs.mkdirSync(root, { recursive: true });
  fs.writeFileSync(
    path.join(root, "package.json"),
    `${JSON.stringify({ name: "amy-plugins", private: true, dependencies })}\n`,
    "utf-8",
  );
  return root;
}

describe("what a manifest range is", () => {
  it("moves a bare name, a semver range and latest, and pins everything else", () => {
    expect(isRange("@acme/workflow-oncall")).toBe(true);
    expect(isRange("workflow-oncall")).toBe(true);
    expect(isRange("^1.0.0")).toBe(true);
    expect(isRange("latest")).toBe(true);
    expect(isRange("~2.1.0")).toBe(true);

    expect(isRange("file:../registry/workflow-oncall")).toBe(false);
    expect(isRange("https://example.test/workflow.tgz")).toBe(false);
    expect(isRange("git+https://github.com/acme/workflow.git")).toBe(false);
    expect(isRange("/absolute/path/to/pkg")).toBe(false);
    expect(isRange("./relative")).toBe(false);
    expect(isRange("~/home-relative")).toBe(false);
  });
});

describe("what npm view answered", () => {
  it("is the one version when npm said one", () => {
    expect(oneVersion('"2.0.0"\n')).toBe("2.0.0");
  });

  it("is the newest of the several a wide range matched", () => {
    expect(oneVersion('["1.0.0", "1.5.0", "2.0.0"]')).toBe("2.0.0");
  });

  it("is nothing when npm said nothing a version could be read from", () => {
    expect(oneVersion("")).toBeUndefined();
    expect(oneVersion("not json")).toBeUndefined();
    expect(oneVersion('{"error": "not found"}')).toBeUndefined();
  });
});

describe("the roots this machine keeps", () => {
  let home: string;

  beforeEach(() => {
    home = fs.mkdtempSync(path.join(os.tmpdir(), "amy-update-"));
  });
  afterEach(() => fs.rmSync(home, { recursive: true, force: true }));

  it("are the plugins root alone when this is a checkout", () => {
    // `packages/cli/src/update.ts` in a checkout: three up is the repository
    // root, whose parent is not a `node_modules`.
    const from = pathToFileURL(path.join(home, "packages", "cli", "src", "update.ts"));
    expect(roots(home, from)).toEqual({ plugins: path.join(home, "plugins") });
  });

  it("are both when the CLI resolved from an install root", () => {
    const install = path.join(home, "lib", "amy");
    const from = pathToFileURL(
      path.join(install, "node_modules", "@amykit", "cli", "dist", "update.js"),
    );
    fs.mkdirSync(path.join(install, "node_modules", "@amykit", "cli", "dist"), { recursive: true });
    fs.writeFileSync(path.join(install, "package.json"), "{}", "utf-8");

    expect(roots(home, from)).toEqual({ plugins: path.join(home, "plugins"), install });
  });

  it("are the plugins root alone when the package beside the root has no manifest", () => {
    const install = path.join(home, "lib", "amy");
    const from = pathToFileURL(
      path.join(install, "node_modules", "@amykit", "cli", "dist", "update.js"),
    );
    fs.mkdirSync(path.join(install, "node_modules", "@amykit", "cli", "dist"), { recursive: true });

    expect(roots(home, from)).toEqual({ plugins: path.join(home, "plugins") });
  });
});

describe("what the roots hold", () => {
  let home: string;

  beforeEach(() => {
    home = fs.mkdtempSync(path.join(os.tmpdir(), "amy-update-held-"));
  });
  afterEach(() => fs.rmSync(home, { recursive: true, force: true }));

  it("names every package, its version, and what the range now points at", async () => {
    const runner = new ScriptedRunner([
      { match: whenArgsInclude("view", "@acme/workflow-oncall@^1.0.0"), result: { stdout: '"2.0.0"\n' } },
    ]);
    const root = rootWith(home, {
      "@acme/workflow-oncall": "^1.0.0",
      "@acme/plugin-extra": "file:../somewhere",
    });
    packageAt(root, "@acme/workflow-oncall", "1.0.0", "export {};");
    packageAt(root, "@acme/plugin-extra", "0.3.0", "export {};");

    const found = await held(runner, home);

    const oncall = found.find((one) => one.name === "@acme/workflow-oncall");
    expect(oncall).toMatchObject({ have: "1.0.0", want: "2.0.0", root: "plugins", range: "^1.0.0" });

    // A pin is held without a target: nothing about a `file:` spec can move,
    // and saying "unknown" would read as a registry question that failed.
    const pinned = found.find((one) => one.name === "@acme/plugin-extra");
    expect(pinned).toMatchObject({ have: "0.3.0", want: undefined });
  });

  it("leaves the target unset when npm could not be asked", async () => {
    const root = rootWith(home, { "@acme/workflow-oncall": "^1.0.0" });
    packageAt(root, "@acme/workflow-oncall", "1.0.0", "export {};");

    // No script answers `npm view`, so the runner reports failure.
    const found = await held(new ScriptedRunner(), home);
    expect(found[0]?.want).toBeUndefined();
  });

  it("reads the install root too, which is where the CLI itself is held", async () => {
    const runner = new ScriptedRunner([
      { match: whenArgsInclude("view", "@amykit/cli@latest"), result: { stdout: '"0.5.0"\n' } },
    ]);
    const root = rootWith(home, { "@acme/workflow-oncall": "^1.0.0" });
    packageAt(root, "@acme/workflow-oncall", "1.0.0", "export {};");

    const install = path.join(home, "lib", "amy");
    fs.mkdirSync(install, { recursive: true });
    fs.writeFileSync(
      path.join(install, "package.json"),
      `${JSON.stringify({ name: "amy-install", private: true, dependencies: { "@amykit/cli": "latest" } })}\n`,
      "utf-8",
    );
    packageAt(install, "@amykit/cli", "0.4.0", "export {};");

    const found = await held(runner, home, install);
    expect(found.find((one) => one.name === "@amykit/cli")).toMatchObject({
      have: "0.4.0",
      want: "0.5.0",
      root: "install",
    });
  });
});

describe("one line of the report", () => {
  it("names the move a range would make", () => {
    const one: Held = {
      name: "@acme/workflow-oncall",
      range: "^1.0.0",
      root: "plugins",
      have: "1.0.0",
      want: "2.0.0",
    };
    expect(line(one)).toBe(
      "@acme/workflow-oncall  1.0.0 -> 2.0.0  (plugins, ^1.0.0)",
    );
  });

  it("says pinned rather than unknown, for a spec that cannot move", () => {
    const one: Held = {
      name: "@acme/plugin-extra",
      range: "file:../somewhere",
      root: "plugins",
      have: "0.3.0",
    };
    expect(line(one)).toBe(
      "@acme/plugin-extra  0.3.0  (plugins, pinned: file:../somewhere)",
    );
  });

  it("says unknown when the range could not be asked", () => {
    const one: Held = {
      name: "@acme/workflow-oncall",
      range: "^1.0.0",
      root: "plugins",
      have: "1.0.0",
      want: undefined,
    };
    expect(line(one)).toContain("-> unknown");
  });
});

describe("the move", () => {
  let home: string;
  let root: string;
  let runner: ScriptedRunner;

  beforeEach(() => {
    home = fs.mkdtempSync(path.join(os.tmpdir(), "amy-update-move-"));
    root = rootWith(home, { "@acme/workflow-oncall": "^1.0.0" });
    runner = new ScriptedRunner();
  });
  afterEach(() => fs.rmSync(home, { recursive: true, force: true }));

  it("installs the exact version the range pointed at, not the range", async () => {
    packageAt(root, "@acme/workflow-oncall", "1.0.0", "export {};");

    const outcome = await move(runner, root, "@acme/workflow-oncall", "^1.0.0", "1.1.0");

    expect(outcome.ok).toBe(true);
    expect(runner.argvFor("npm").slice(0, -1)).toEqual([
      "install",
      "--prefix",
      root,
      "--no-audit",
      "--no-fund",
      "--",
    ]);
    // The version, not the range: npm is free to answer a range with what
    // already satisfies it, which on a machine holding the old version is
    // the old version — a no-op that reads as success.
    expect(runner.argvFor("npm").at(-1)).toBe("@acme/workflow-oncall@1.1.0");
    expect(manifestOf(root)["@acme/workflow-oncall"]).toBe("^1.0.0");
  });

  it("restores the manifest entry a move away rewrote", async () => {
    packageAt(root, "@acme/workflow-oncall", "1.0.0", "export {};");

    await move(runner, root, "@acme/workflow-oncall", "^1.0.0", "1.1.0");

    // npm rewrites the entry to the exact thing it installed; the move puts
    // the operator's range back, so the next `update --check` reads the
    // same intention this one did.
    expect(manifestOf(root)["@acme/workflow-oncall"]).toBe("^1.0.0");
  });

  it("reports a failed install rather than moving the manifest", async () => {
    packageAt(root, "@acme/workflow-oncall", "1.0.0", "export {};");
    const failing = new ScriptedRunner([
      { match: whenArgsInclude("install"), result: { ok: false, exitCode: 1, stderr: "no such version" } },
    ]);

    const outcome = await move(failing, root, "@acme/workflow-oncall", "^1.0.0", "1.1.0");

    expect(outcome.ok).toBe(false);
    expect(outcome.output).toContain("no such version");
    expect(manifestOf(root)["@acme/workflow-oncall"]).toBe("^1.0.0");
  });
});

describe("the rollback", () => {
  let home: string;
  let root: string;
  let runner: ScriptedRunner;

  beforeEach(() => {
    home = fs.mkdtempSync(path.join(os.tmpdir(), "amy-update-rollback-"));
    root = rootWith(home, { "@acme/workflow-oncall": "^1.0.0" });
    runner = new ScriptedRunner();
  });
  afterEach(() => fs.rmSync(home, { recursive: true, force: true }));

  it("installs the exact version that was on disk, and puts the range back", async () => {
    packageAt(root, "@acme/workflow-oncall", "1.0.0", "export {};");

    const outcome = await restore(runner, root, "@acme/workflow-oncall", "1.0.0");

    expect(outcome.ok).toBe(true);
    expect(runner.argvFor("npm").at(-1)).toBe("@acme/workflow-oncall@1.0.0");
    expect(manifestOf(root)["@acme/workflow-oncall"]).toBe("^1.0.0");
  });
});

describe("the version on disk", () => {
  let home: string;

  beforeEach(() => {
    home = fs.mkdtempSync(path.join(os.tmpdir(), "amy-update-version-"));
  });
  afterEach(() => fs.rmSync(home, { recursive: true, force: true }));

  it("is read off the copy in the root, and nothing when there is none", () => {
    const root = rootWith(home, {});
    packageAt(root, "@acme/workflow-oncall", "1.0.0", "export {};");

    expect(versionIn(root, "@acme/workflow-oncall")).toBe("1.0.0");
    expect(versionIn(root, "@acme/plugin-nowhere")).toBeUndefined();
  });
});

describe("the skills record", () => {
  let home: string;

  beforeEach(() => {
    home = fs.mkdtempSync(path.join(os.tmpdir(), "amy-update-skills-"));
  });
  afterEach(() => fs.rmSync(home, { recursive: true, force: true }));

  it("is empty on a machine amy skills never ran on", () => {
    expect(readSkills(home)).toEqual({ harnesses: [], directories: [] });
  });

  it("records each harness the skills were written into, once, in order", () => {
    recordWrite(home, { harness: "claude" });
    recordWrite(home, { harness: "hermes" });
    recordWrite(home, { harness: "claude" });

    expect(readSkills(home)).toEqual({ harnesses: ["claude", "hermes"], directories: [] });
  });

  it("records a directory `--dir` named beside the harnesses", () => {
    recordWrite(home, { directory: path.join(home, "somewhere") });

    expect(readSkills(home).directories).toEqual([path.join(home, "somewhere")]);
  });

  it("rewrites into every recorded harness and directory, and nowhere else", () => {
    const into = path.join(home, "harness", "skills");
    fs.mkdirSync(into, { recursive: true });
    recordWrite(home, { harness: "claude" });
    recordWrite(home, { directory: path.join(home, "mine") });
    fs.mkdirSync(path.join(home, "mine"), { recursive: true });

    const wrote = writeSkills(
      home,
      (target: string, skills: readonly [string, string][]) => {
        fs.mkdirSync(path.join(target, skills[0]![0]), { recursive: true });
        fs.writeFileSync(path.join(target, skills[0]![0], "SKILL.md"), skills[0]![1], "utf-8");
        return [path.join(target, skills[0]![0], "SKILL.md")];
      },
      () => [["amy", "# the new version\n"]],
      (name: string) => (name === "claude" ? into : undefined),
    );

    expect(wrote).toHaveLength(2);
    expect(fs.readFileSync(path.join(into, "amy", "SKILL.md"), "utf-8")).toBe("# the new version\n");
    expect(fs.readFileSync(path.join(home, "mine", "amy", "SKILL.md"), "utf-8")).toBe("# the new version\n");

    // A harness the record never named is not written to now, even when it
    // is installed on the machine.
    const never = path.join(home, "harness", "hermes-skills");
    expect(fs.existsSync(never)).toBe(false);
  });

  it("skips a recorded directory that is gone, rather than recreating it", () => {
    recordWrite(home, { directory: path.join(home, "deleted") });

    const wrote = writeSkills(
      home,
      (target: string, skills: readonly [string, string][]) => [path.join(target, skills[0]![0])],
      () => [["amy", "# body\n"]],
      () => undefined,
    );

    expect(wrote).toEqual([]);
  });
});

describe("the running loop", () => {
  let home: string;

  beforeEach(() => {
    home = fs.mkdtempSync(path.join(os.tmpdir(), "amy-update-live-"));
  });
  afterEach(() => fs.rmSync(home, { recursive: true, force: true }));

  it("refuses the update, naming the pid", async () => {
    const { writeDaemon } = await import("../src/daemon.js");
    writeDaemon(path.join(home, "daemon.pid"), {
      pid: process.pid,
      workflow: "oncall",
      startedAt: new Date().toISOString(),
    });

    // The refusal is the first thing that happens, before anything is read:
    // the runner is one whose every call would fail, and the move never
    // reaches it.
    const runner = new ScriptedRunner([
      { match: () => true, result: { ok: false, exitCode: 1, stderr: "must not be reached" } },
    ]);
    const { updateCommand } = await import("../src/index.js");
    const code = await updateCommand(home, runner, undefined, true, {
      mountProfiles: async () => ({ ok: true as const }),
      skillsInto: () => [],
    });

    expect(code).toBe(1);
    expect(runner.calls).toHaveLength(0);
  });

  it("moves nothing while `--check` only names what would move", async () => {
    rootWith(home, { "@acme/workflow-oncall": "^1.0.0" });
    const runner = new ScriptedRunner([
      { match: whenArgsInclude("view"), result: { stdout: '"2.0.0"\n' } },
      { match: whenArgsInclude("install"), result: { ok: false, exitCode: 1, stderr: "must not install" } },
    ]);

    const { updateCommand } = await import("../src/index.js");
    const code = await updateCommand(home, runner, undefined, true, {
      mountProfiles: async () => ({ ok: true as const }),
      skillsInto: () => [],
    });

    expect(code).toBe(0);
    // `npm view` was asked; `npm install` never ran.
    expect(runner.callsTo("npm").every((call) => call.args[0] === "view")).toBe(true);
  });

  it("rolls back a version the profiles will not boot on", async () => {
    const root = rootWith(home, { "@acme/workflow-oncall": "^1.0.0" });
    packageAt(root, "@acme/workflow-oncall", "1.0.0", "export const plugin = { name: '@acme/workflow-oncall', version: '1.0.0', register() {} };");

    const runner = new ScriptedRunner([
      { match: whenArgsInclude("view"), result: { stdout: '"2.0.0"\n' } },
    ]);

    const { updateCommand } = await import("../src/index.js");
    const code = await updateCommand(home, runner, undefined, false, {
      mountProfiles: async () => ({
        ok: false as const,
        problems: ["oncall: action `triage`: needs the `agent` port, which nothing mounted"],
      }),
      skillsInto: () => [],
    });

    expect(code).toBe(1);
    // The move installed the range; the rollback installed the version that
    // was on disk — `1.0.0` — and both carried the package name.
    const installs = runner.callsTo("npm").filter((call) => call.args[0] === "install");
    expect(installs.map((call) => call.args.at(-1))).toEqual([
      "@acme/workflow-oncall@2.0.0",
      "@acme/workflow-oncall@1.0.0",
    ]);
    // The manifest keeps the range the operator wrote, not the version npm
    // was asked for on the way back.
    expect(manifestOf(root)["@acme/workflow-oncall"]).toBe("^1.0.0");
  });

  it("refuses a name neither root holds", async () => {
    rootWith(home, {});
    const { updateCommand } = await import("../src/index.js");

    const code = await updateCommand(
      home,
      new ScriptedRunner(),
      "@acme/workflow-nowhere",
      false,
      { mountProfiles: async () => ({ ok: true as const }), skillsInto: () => [] },
    );

    expect(code).toBe(1);
  });

  it("rewrites the skills through the new CLI when the CLI itself moved", async () => {
    // The CLI lives in the install root on a real machine, so this drives
    // the same shape: the plugins root holds nothing but its own manifest
    // and the install root holds the CLI at a range npm can move.
    const plugins = rootWith(home, {});
    void plugins;
    const install = path.join(home, "lib", "amy");
    fs.mkdirSync(install, { recursive: true });
    fs.writeFileSync(
      path.join(install, "package.json"),
      `${JSON.stringify({ name: "amy-install", private: true, dependencies: { "@amykit/cli": "latest" } })}\n`,
      "utf-8",
    );
    packageAt(install, "@amykit/cli", "0.4.0", "export const plugin = {};");

    const runner = new ScriptedRunner([
      { match: whenArgsInclude("view", "@amykit/cli@latest"), result: { stdout: '"0.5.0"\n' } },
    ]);

    const { updateCommand } = await import("../src/index.js");
    let asked = 0;
    const code = await updateCommand(home, runner, undefined, false, {
      mountProfiles: async () => ({ ok: true as const }),
      skillsInto: () => {
        asked += 1;
        return ["claude: 6 skill(s) rewritten"];
      },
      installRoot: install,
    });

    expect(code).toBe(0);
    expect(asked).toBe(1);
  });
});