import { describe, expect, it, beforeEach, afterEach, vi } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { ScriptedRunner, whenArgsInclude } from "@amykit/test-fixtures";
import {
  compareVersions,
  firstPartyCopies,
  globalPrefix,
  Held,
  held,
  isRange,
  line,
  manifestOf,
  move,
  oneVersion,
  restore,
  Root,
  roots,
  survey,
  updateRangeOf,
  versionIn,
} from "../src/update.js";
import { readSkills, recordWrite, writeSkills } from "../src/skills-record.js";

/**
 * A package on disk, laid out the way npm lays one out under a root.
 */
function packageAt(
  root: string,
  name: string,
  version: string,
  body: string,
  bin?: Record<string, string>,
): string {
  const directory = path.join(root, "node_modules", ...name.split("/"));
  fs.mkdirSync(directory, { recursive: true });
  fs.writeFileSync(
    path.join(directory, "package.json"),
    `${JSON.stringify({ name, version, type: "module", main: "./index.js", ...(bin ? { bin } : {}) })}\n`,
    "utf-8",
  );
  fs.writeFileSync(path.join(directory, "index.js"), body);
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
    expect(isRange("git")).toBe(true);
    expect(isRange("gitlab-tool")).toBe(true);
    expect(isRange(">=1.0.0 <2.0.0")).toBe(true);

    expect(isRange("file:../registry/workflow-oncall")).toBe(false);
    expect(isRange("https://example.test/workflow.tgz")).toBe(false);
    expect(isRange("git+https://github.com/acme/workflow.git")).toBe(false);
    expect(isRange("/absolute/path/to/pkg")).toBe(false);
    expect(isRange("./relative")).toBe(false);
    expect(isRange("~/home-relative")).toBe(false);
    expect(isRange("~")).toBe(false);
    expect(isRange("git+https://example.test/owner/repo.git")).toBe(false);
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

  /** The URL a CLI's `dist/update.js` resolves from, under one `node_modules`. */
  function cliUnder(modules: string): URL {
    fs.mkdirSync(path.join(modules, "@amykit", "cli", "dist"), { recursive: true });
    return pathToFileURL(path.join(modules, "@amykit", "cli", "dist", "update.js"));
  }

  it("are the plugins root alone when this is a checkout, and npm is never asked", async () => {
    // `packages/cli/src/update.ts` in a checkout: three up is the repository
    // root, whose parent is not a `node_modules`.
    const from = pathToFileURL(path.join(home, "packages", "cli", "src", "update.ts"));
    const runner = new ScriptedRunner();
    expect(await roots(home, runner, from)).toEqual({ plugins: path.join(home, "plugins") });
    expect(runner.calls).toHaveLength(0);
  });

  it("are both when the CLI resolved from an install root, and npm is never asked", async () => {
    const install = path.join(home, "lib", "amy");
    const from = cliUnder(path.join(install, "node_modules"));
    fs.writeFileSync(path.join(install, "package.json"), "{}", "utf-8");
    const runner = new ScriptedRunner();

    expect(await roots(home, runner, from)).toEqual({
      plugins: path.join(home, "plugins"),
      install: { kind: "local", dir: install, modules: path.join(install, "node_modules") },
    });
    expect(runner.calls).toHaveLength(0);
  });

  it("take npm's global prefix as the install root when the CLI lives in it", async () => {
    // `npm install -g` on Unix: `<prefix>/lib/node_modules`, no manifest beside it.
    const prefix = path.join(home, "global");
    const modules = path.join(prefix, "lib", "node_modules");
    const from = cliUnder(modules);
    const runner = new ScriptedRunner([
      { match: whenArgsInclude("root", "--global"), result: { stdout: `${modules}\n` } },
    ]);

    expect(await roots(home, runner, from, "darwin")).toEqual({
      plugins: path.join(home, "plugins"),
      install: { kind: "global", dir: prefix, modules },
    });
    // The global-root question is asked once, and only because no manifest
    // sat beside the CLI.
    expect(runner.callsTo("npm")).toHaveLength(1);
  });

  it("take the prefix from npm's path when the global root is a symlink", async () => {
    // `<prefix>/lib/node_modules` linked to a shared directory elsewhere: the
    // CLI resolves under the target, but npm installs under the prefix.
    const prefix = path.join(home, "global");
    const shared = path.join(home, "shared", "node_modules");
    fs.mkdirSync(shared, { recursive: true });
    fs.mkdirSync(path.join(prefix, "lib"), { recursive: true });
    fs.symlinkSync(shared, path.join(prefix, "lib", "node_modules"));
    const runner = new ScriptedRunner([
      { match: whenArgsInclude("root", "--global"), result: { stdout: `${path.join(prefix, "lib", "node_modules")}\n` } },
    ]);

    const found = await roots(home, runner, cliUnder(shared), "darwin");
    expect(found.install).toMatchObject({ kind: "global", dir: prefix });
  });

  it("are the plugins root alone when the CLI sits in a node_modules that is neither", async () => {
    const modules = path.join(home, "lib", "amy", "node_modules");
    const from = cliUnder(modules);
    const runner = new ScriptedRunner([
      { match: whenArgsInclude("root", "--global"), result: { stdout: `${path.join(home, "elsewhere")}\n` } },
    ]);

    expect(await roots(home, runner, from)).toEqual({ plugins: path.join(home, "plugins") });
  });

  it("are the plugins root alone when npm cannot say where its global root is", async () => {
    const from = cliUnder(path.join(home, "lib", "amy", "node_modules"));
    expect(await roots(home, new ScriptedRunner(), from)).toEqual({ plugins: path.join(home, "plugins") });
  });

  it("know both platforms' global layouts", () => {
    expect(globalPrefix("/usr/local/lib/node_modules", "linux")).toBe("/usr/local");
    expect(globalPrefix("/opt/homebrew/lib/node_modules", "darwin")).toBe("/opt/homebrew");
    // Windows puts `node_modules` straight under the prefix.
    expect(globalPrefix("C:\\Users\\op\\AppData\\Roaming\\npm\\node_modules", "win32")).toBe(
      "C:\\Users\\op\\AppData\\Roaming\\npm",
    );
  });
});

describe("versions compared", () => {
  it("by their numbers, a prerelease before its release", () => {
    expect(compareVersions("0.7.0", "0.6.9")).toBeGreaterThan(0);
    expect(compareVersions("0.10.0", "0.9.0")).toBeGreaterThan(0);
    expect(compareVersions("1.0.0-rc.1", "1.0.0")).toBeLessThan(0);
    expect(compareVersions("1.2.3", "1.2.3")).toBe(0);
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

  it("keeps a registry intent for the installed CLI while its dependency is a bootstrap tarball", async () => {
    const runner = new ScriptedRunner([
      { match: whenArgsInclude("view", "@amykit/cli@latest"), result: { stdout: '"0.5.0"\n' } },
    ]);
    const install = path.join(home, "lib", "amy");
    fs.mkdirSync(install, { recursive: true });
    fs.writeFileSync(
      path.join(install, "package.json"),
      `${JSON.stringify({
        dependencies: { "@amykit/cli": "file:/cache/amykit-cli-0.4.0.tgz" },
        amyUpdateRanges: { "@amykit/cli": "latest" },
      })}\n`,
      "utf-8",
    );
    packageAt(install, "@amykit/cli", "0.4.0", "export {};");

    expect(updateRangeOf(install, "@amykit/cli", "file:/cache/cli.tgz")).toBe("latest");
    const found = await held(runner, home, install);
    expect(found).toContainEqual(expect.objectContaining({ name: "@amykit/cli", range: "latest", want: "0.5.0" }));
  });
});

describe("the release", () => {
  let home: string;

  beforeEach(() => {
    home = fs.mkdtempSync(path.join(os.tmpdir(), "amy-update-release-"));
  });
  afterEach(() => fs.rmSync(home, { recursive: true, force: true }));

  it("moves every first-party package across the minor its caret holds", async () => {
    // What `amy init` leaves: npm saved `^0.5.0`, and on 0.x a caret never
    // reaches 0.6.0 — the range alone would answer 0.5.0 forever.
    const root = rootWith(home, { "@amykit/plugin-file-log": "^0.5.0", "@acme/workflow-young": "^0.1.0" });
    packageAt(root, "@amykit/plugin-file-log", "0.5.0", "export {};");
    packageAt(root, "@acme/workflow-young", "0.1.0", "export {};");
    const runner = new ScriptedRunner([
      { match: whenArgsInclude("view", "@amykit/cli@latest"), result: { stdout: '"0.6.0"\n' } },
      { match: whenArgsInclude("view", "@amykit/plugin-file-log@^0.5.0"), result: { stdout: '"0.5.0"\n' } },
      { match: whenArgsInclude("view", "@acme/workflow-young@^0.1.0"), result: { stdout: '"0.1.0"\n' } },
    ]);

    const { held: found, release } = await survey(runner, home);

    expect(release).toEqual({ version: "0.6.0", intent: "latest" });
    expect(found.find((one) => one.name === "@amykit/plugin-file-log")).toMatchObject({ have: "0.5.0", want: "0.6.0" });
    // A third-party 0.x range is the operator's call, and stays where it is.
    expect(found.find((one) => one.name === "@acme/workflow-young")).toMatchObject({ have: "0.1.0", want: "0.1.0" });
    // The release is asked once, not once per first-party package.
    expect(runner.callsTo("npm").filter((call) => call.args[1] === "@amykit/cli@latest")).toHaveLength(1);
  });

  it("never moves a first-party copy backwards", async () => {
    const root = rootWith(home, { "@amykit/plugin-file-log": "^0.7.0" });
    packageAt(root, "@amykit/plugin-file-log", "0.7.0", "export {};");
    const runner = new ScriptedRunner([
      { match: whenArgsInclude("view", "@amykit/cli@latest"), result: { stdout: '"0.6.0"\n' } },
    ]);

    const { held: found } = await survey(runner, home);
    expect(found[0]).toMatchObject({ have: "0.7.0", want: "0.7.0" });
  });

  it("asks nothing of the registry about a release when no first-party package is held", async () => {
    const root = rootWith(home, { "@acme/workflow-oncall": "^1.0.0" });
    packageAt(root, "@acme/workflow-oncall", "1.0.0", "export {};");
    const runner = new ScriptedRunner([
      { match: whenArgsInclude("view", "@acme/workflow-oncall@^1.0.0"), result: { stdout: '"1.1.0"\n' } },
    ]);

    const { release } = await survey(runner, home);
    expect(release).toBeUndefined();
    expect(runner.callsTo("npm").map((call) => call.args[1])).toEqual(["@acme/workflow-oncall@^1.0.0"]);
  });

  it("is what the operator's intent allows, naming the newer one it holds the machine below", async () => {
    const root = path.join(home, "plugins");
    fs.mkdirSync(root, { recursive: true });
    fs.writeFileSync(
      path.join(root, "package.json"),
      `${JSON.stringify({ dependencies: { "@amykit/plugin-file-log": "^0.5.0" }, amyUpdateRanges: { "@amykit/cli": "0.5.x" } })}\n`,
    );
    packageAt(root, "@amykit/plugin-file-log", "0.5.0", "export {};");
    const runner = new ScriptedRunner([
      { match: whenArgsInclude("view", "@amykit/cli@0.5.x"), result: { stdout: '"0.5.3"\n' } },
      { match: whenArgsInclude("view", "@amykit/cli@latest"), result: { stdout: '"0.6.0"\n' } },
    ]);

    const { held: found, release } = await survey(runner, home);
    expect(release).toEqual({ version: "0.5.3", intent: "0.5.x", newest: "0.6.0" });
    expect(found[0]).toMatchObject({ want: "0.5.3" });
  });

  it("holds the global CLI under the release, with no manifest to read", async () => {
    rootWith(home, {});
    const modules = path.join(home, "global", "lib", "node_modules");
    const cli = path.join(modules, "@amykit", "cli");
    fs.mkdirSync(cli, { recursive: true });
    fs.writeFileSync(path.join(cli, "package.json"), '{"name":"@amykit/cli","version":"0.5.0"}');
    const install: Root = { kind: "global", dir: path.join(home, "global"), modules };
    const runner = new ScriptedRunner([
      { match: whenArgsInclude("view", "@amykit/cli@latest"), result: { stdout: '"0.6.0"\n' } },
    ]);

    const { held: found } = await survey(runner, home, install);
    expect(found).toEqual([{ name: "@amykit/cli", range: "latest", root: "install", have: "0.5.0", want: "0.6.0" }]);
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

  it("fails the move when it cannot put the operator's range back", async () => {
    packageAt(root, "@acme/workflow-oncall", "1.0.0", "export {};");
    const manifest = path.join(root, "package.json");
    fs.chmodSync(manifest, 0o444);

    const outcome = await move(runner, root, "@acme/workflow-oncall", "^1.0.0", "1.1.0");

    fs.chmodSync(manifest, 0o644);
    expect(outcome.ok).toBe(false);
    expect(outcome.output).toContain("could not restore its manifest range");
  });
});

describe("the move into a global prefix", () => {
  it("installs with --global under the prefix, and writes no manifest", async () => {
    const runner = new ScriptedRunner();
    const install: Root = { kind: "global", dir: "/opt/amy", modules: "/opt/amy/lib/node_modules" };

    const outcome = await move(runner, install, "@amykit/cli", undefined, "0.6.0");

    expect(outcome.ok).toBe(true);
    expect(runner.argvFor("npm")).toEqual([
      "install", "--global", "--prefix", "/opt/amy", "--no-audit", "--no-fund", "--", "@amykit/cli@0.6.0",
    ]);
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

  it("restores every recorded target if a later skills write fails", () => {
    const first = path.join(home, "first");
    const second = path.join(home, "second");
    fs.mkdirSync(first, { recursive: true });
    fs.mkdirSync(second, { recursive: true });
    recordWrite(home, { directory: first });
    recordWrite(home, { directory: second });
    fs.mkdirSync(path.join(first, "amy"), { recursive: true });
    fs.writeFileSync(path.join(first, "amy", "SKILL.md"), "# old\n", "utf-8");

    expect(() => writeSkills(
      home,
      (target, skills) => {
        const file = path.join(target, skills[0]![0], "SKILL.md");
        fs.mkdirSync(path.dirname(file), { recursive: true });
        fs.writeFileSync(file, skills[0]![1], "utf-8");
        if (target === second) throw new Error("disk full");
        return [file];
      },
      () => [["amy", "# new\n"]],
      () => undefined,
    )).toThrow("disk full");

    expect(fs.readFileSync(path.join(first, "amy", "SKILL.md"), "utf-8")).toBe("# old\n");
    expect(fs.existsSync(path.join(second, "amy"))).toBe(false);
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

  it("refuses an update while a renamed phase daemon remains live on disk", async () => {
    const { writeDaemon } = await import("../src/daemon.js");
    writeDaemon(path.join(home, "profiles", "renamed-away", "daemon.pid"), {
      pid: process.pid,
      workflow: "renamed-away",
      startedAt: new Date().toISOString(),
    });
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

  it("refuses an unresolved registry range rather than calling it a no-op", async () => {
    const root = rootWith(home, { "@acme/workflow-oncall": "^1.0.0" });
    packageAt(root, "@acme/workflow-oncall", "1.0.0", "export const plugin = {}; ");

    const { updateCommand } = await import("../src/index.js");
    const runner = new ScriptedRunner();
    const code = await updateCommand(home, runner, undefined, false, {
      mountProfiles: async () => ({ ok: true as const }),
      skillsInto: () => [],
    });

    expect(code).toBe(1);
    expect(runner.argvFor("npm").slice(0, 2)).toEqual(["view", "@acme/workflow-oncall@^1.0.0"]);
  });

  it("fails a hung module probe within its bounded deadline", async () => {
    const root = rootWith(home, { "@acme/workflow-oncall": "^1.0.0" });
    packageAt(root, "@acme/workflow-oncall", "1.0.0", "await new Promise(() => {}); export const plugin = {}; ");

    const { moduleProbe } = await import("../src/index.js");
    const outcome = await moduleProbe(root, "@acme/workflow-oncall", true, 25);

    expect(outcome).toMatchObject({ ok: false });
    // Node exits with status 13 for an unsettled top-level await on some
    // platforms before our timer fires; either result is a bounded refusal.
    if (!outcome.ok) expect(outcome.problems.join(" ")).toMatch(/timed out|status 13/);
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
    packageAt(install, "@amykit/cli", "0.4.0", "export const plugin = {};", { amy: "./index.js" });
    // The scripted npm's move changes no files; what the probe runs is the
    // copy on disk — a module that exits 0, so the move stands.
    fs.writeFileSync(path.join(install, "node_modules", "@amykit", "cli", "index.js"), "export const plugin = {};");

    const runner = new ScriptedRunner([
      { match: whenArgsInclude("view", "@amykit/cli@latest"), result: { stdout: '"0.5.0"\n' } },
      { match: whenArgsInclude("install"), result: { stdout: "up to date\n" } },
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

  it("fails the update and rolls the CLI back when the skills rewrite says nothing", async () => {
    const plugins = rootWith(home, {});
    void plugins;
    const install = path.join(home, "lib", "amy");
    fs.mkdirSync(install, { recursive: true });
    fs.writeFileSync(
      path.join(install, "package.json"),
      `${JSON.stringify({ name: "amy-install", private: true, dependencies: { "@amykit/cli": "latest" } })}\n`,
      "utf-8",
    );
    packageAt(install, "@amykit/cli", "0.4.0", "export const plugin = {};", { amy: "./index.js" });
    // The scripted npm's move changes no files; what the probe runs is the
    // copy on disk — a module that exits 0, so the move stands.
    fs.writeFileSync(path.join(install, "node_modules", "@amykit", "cli", "index.js"), "export const plugin = {};");

    const runner = new ScriptedRunner([
      { match: whenArgsInclude("view", "@amykit/cli@latest"), result: { stdout: '"0.5.0"\n' } },
      { match: whenArgsInclude("install", "@amykit/cli@0.5.0"), result: { stdout: "up to date\n" } },
      { match: whenArgsInclude("install", "@amykit/cli@0.4.0"), result: { stdout: "up to date\n" } },
    ]);

    const { updateCommand } = await import("../src/index.js");
    let asked = 0;
    const code = await updateCommand(home, runner, undefined, false, {
      mountProfiles: async () => ({ ok: true as const }),
      skillsInto: () => {
        asked += 1;
        return [];
      },
      installRoot: install,
    });

    // The rewrite is a postcondition of the move: it is refused, the CLI
    // move goes back, and the update is not called done.
    expect(code).toBe(1);
    expect(asked).toBe(1);
    const installs = runner.callsTo("npm").filter((call) => call.args[0] === "install");
    expect(installs.map((call) => call.args.at(-1))).toEqual(["@amykit/cli@0.5.0", "@amykit/cli@0.4.0"]);
  });

  it("probes the moved CLI by running its own bin, and rolls a broken one back", async () => {
    const plugins = rootWith(home, {});
    void plugins;
    const install = path.join(home, "lib", "amy");
    fs.mkdirSync(install, { recursive: true });
    fs.writeFileSync(
      path.join(install, "package.json"),
      `${JSON.stringify({ name: "amy-install", private: true, dependencies: { "@amykit/cli": "latest" } })}\n`,
      "utf-8",
    );
    packageAt(install, "@amykit/cli", "0.4.0", "export const plugin = {};", { amy: "./index.js" });
    // The scripted npm's move changes no files; what the probe runs is the
    // copy on disk — a module that exits failing, a CLI that cannot run.
    fs.writeFileSync(path.join(install, "node_modules", "@amykit", "cli", "index.js"), "process.exit(3);");
    fs.chmodSync(path.join(install, "node_modules", "@amykit", "cli", "index.js"), 0o755);

    const runner = new ScriptedRunner([
      { match: whenArgsInclude("view", "@amykit/cli@latest"), result: { stdout: '"0.5.0"\n' } },
      { match: whenArgsInclude("install"), result: { stdout: "up to date\n" } },
    ]);

    const { updateCommand } = await import("../src/index.js");
    const code = await updateCommand(home, runner, undefined, false, {
      mountProfiles: async () => ({ ok: true as const }),
      skillsInto: () => ["claude: 6 skill(s) rewritten"],
      installRoot: install,
    });

    expect(code).toBe(1);
    const installs = runner.callsTo("npm").filter((call) => call.args[0] === "install");
    expect(installs.map((call) => call.args.at(-1))).toEqual(["@amykit/cli@0.5.0", "@amykit/cli@0.4.0"]);
  });

  it("rolls back the earlier moves when a later package refuses to move", async () => {
    const root = rootWith(home, {
      "@acme/workflow-oncall": "^1.0.0",
      "@acme/workflow-later": "^1.0.0",
    });
    packageAt(root, "@acme/workflow-oncall", "1.0.0", "export const plugin = {};");
    packageAt(root, "@acme/workflow-later", "1.0.0", "export const plugin = {};");

    const runner = new ScriptedRunner([
      { match: whenArgsInclude("view", "@acme/workflow-oncall"), result: { stdout: '"2.0.0"\n' } },
      { match: whenArgsInclude("view", "@acme/workflow-later"), result: { stdout: '"2.0.0"\n' } },
      { match: whenArgsInclude("install", "@acme/workflow-oncall@2.0.0"), result: { stdout: "ok\n" } },
      { match: whenArgsInclude("install", "@acme/workflow-later@2.0.0"), result: { ok: false, exitCode: 1, stderr: "EACCES" } },
      { match: whenArgsInclude("install", "@acme/workflow-oncall@1.0.0"), result: { stdout: "back\n" } },
    ]);

    const { updateCommand } = await import("../src/index.js");
    const code = await updateCommand(home, runner, undefined, false, {
      mountProfiles: async () => ({ ok: true as const }),
      skillsInto: () => [],
    });

    expect(code).toBe(1);
    // The move that landed is undone before the command reports its failure.
    const installs = runner.callsTo("npm").filter((call) => call.args[0] === "install");
    expect(installs.map((call) => call.args.at(-1))).toEqual([
      "@acme/workflow-oncall@2.0.0",
      "@acme/workflow-later@2.0.0",
      "@acme/workflow-oncall@1.0.0",
    ]);
  });

  it("counts an installed-but-unrestorable move as rollback work", async () => {
    const root = rootWith(home, { "@acme/workflow-oncall": "^1.0.0" });
    packageAt(root, "@acme/workflow-oncall", "1.0.0", "export const plugin = {};");

    // The scripted npm answers the move and then destroys the manifest, the
    // way a real install that cannot be read back leaves the root: the
    // restore cannot put the range anywhere, so the move is installed but
    // unrestorable — and the update must roll the package back.
    let destroyed = false;
    const runner = new ScriptedRunner([
      { match: whenArgsInclude("view"), result: { stdout: '"2.0.0"\n' } },
      {
        match: whenArgsInclude("install", "@acme/workflow-oncall@2.0.0"),
        result: {
          ok: true,
          exitCode: 0,
          stdout: "ok\n",
        },
      },
      { match: whenArgsInclude("install", "@acme/workflow-oncall@1.0.0"), result: { stdout: "back\n" } },
    ]);
    const originalRun = runner.run.bind(runner);
    runner.run = async (command, args, options) => {
      const result = await originalRun(command, args, options);
      if (!destroyed && args[0] === "install" && args.at(-1) === "@acme/workflow-oncall@2.0.0") {
        destroyed = true;
        // After npm's install, the restore's read-and-write finds a
        // manifest it cannot put the range back into.
        fs.rmSync(path.join(root, "package.json"));
        fs.writeFileSync(path.join(root, "package.json"), "{ broken");
      }
      return result;
    };

    const { updateCommand } = await import("../src/index.js");
    const code = await updateCommand(home, runner, undefined, false, {
      mountProfiles: async () => ({ ok: true as const }),
      skillsInto: () => [],
    });

    expect(code).toBe(1);
    const installs = runner.callsTo("npm").filter((call) => call.args[0] === "install");
    expect(installs.map((call) => call.args.at(-1))).toEqual([
      "@acme/workflow-oncall@2.0.0",
      "@acme/workflow-oncall@1.0.0",
    ]);
  });

  /** A machine on 0.5.0: its CLI in a global prefix, one first-party plugin at the caret npm saved. */
  function globalMachine(): Root {
    const root = rootWith(home, { "@amykit/plugin-file-log": "^0.5.0" });
    packageAt(root, "@amykit/plugin-file-log", "0.5.0", "export const plugin = {};");
    const modules = path.join(home, "global", "lib", "node_modules");
    packageAt(path.dirname(modules), "@amykit/cli", "0.5.0", "process.exit(0);", { amy: "./index.js" });
    return { kind: "global", dir: path.join(home, "global"), modules };
  }

  function said(spy: { mock: { calls: unknown[][] } }): string {
    return spy.mock.calls.map((call) => call.join(" ")).join("\n");
  }

  it("names the release `--check` would move to, in one line", async () => {
    const install = globalMachine();
    const runner = new ScriptedRunner([
      { match: whenArgsInclude("view", "@amykit/cli@latest"), result: { stdout: '"0.6.0"\n' } },
    ]);
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    try {
      const { updateCommand } = await import("../src/index.js");
      const code = await updateCommand(home, runner, undefined, true, {
        mountProfiles: async () => ({ ok: true as const }),
        skillsInto: () => [],
        installRoot: install,
      });
      expect(code).toBe(0);
      expect(said(log)).toContain("release 0.5.0 -> 0.6.0  (every @amykit/* package, @amykit/cli latest)");
      expect(said(log)).toContain("the CLI's is npm's global prefix");
    } finally {
      log.mockRestore();
    }
  });

  it("names the operator's intent that holds the CLI below the release, not `nothing to move`", async () => {
    const install = globalMachine();
    const manifest = path.join(home, "plugins", "package.json");
    fs.writeFileSync(manifest, `${JSON.stringify({ ...JSON.parse(fs.readFileSync(manifest, "utf-8")), amyUpdateRanges: { "@amykit/cli": "0.5.x" } })}\n`);
    const runner = new ScriptedRunner([
      { match: whenArgsInclude("view", "@amykit/cli@0.5.x"), result: { stdout: '"0.5.0"\n' } },
      { match: whenArgsInclude("view", "@amykit/cli@latest"), result: { stdout: '"0.6.0"\n' } },
    ]);
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    try {
      const { updateCommand } = await import("../src/index.js");
      const code = await updateCommand(home, runner, undefined, true, {
        mountProfiles: async () => ({ ok: true as const }),
        skillsInto: () => [],
        installRoot: install,
      });
      expect(code).toBe(0);
      expect(said(log)).toContain("held below the release by its registry intent 0.5.x: 0.6.0 is published");
      expect(said(log)).not.toContain("nothing to move");
    } finally {
      log.mockRestore();
    }
  });

  it("moves the global CLI and the plugins to the release, and names it in the manifest", async () => {
    const install = globalMachine();
    const runner = new ScriptedRunner([
      { match: whenArgsInclude("view", "@amykit/cli@latest"), result: { stdout: '"0.6.0"\n' } },
      { match: whenArgsInclude("install"), result: { stdout: "ok\n" } },
    ]);
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    try {
      const { updateCommand } = await import("../src/index.js");
      const code = await updateCommand(home, runner, undefined, false, {
        mountProfiles: async () => ({ ok: true as const }),
        skillsInto: () => ["claude: 6 skill(s) rewritten"],
        installRoot: install,
      });
      expect(code).toBe(0);
    } finally {
      log.mockRestore();
    }
    const installs = runner.callsTo("npm").filter((call) => call.args[0] === "install").map((call) => call.args);
    expect(installs).toEqual([
      ["install", "--prefix", path.join(home, "plugins"), "--no-audit", "--no-fund", "--", "@amykit/plugin-file-log@0.6.0"],
      ["install", "--global", "--prefix", install.dir, "--no-audit", "--no-fund", "--", "@amykit/cli@0.6.0"],
    ]);
    // The root names the release it is on, not a caret that never reaches the next.
    expect(manifestOf(path.join(home, "plugins"))["@amykit/plugin-file-log"]).toBe("^0.6.0");
  });

  it("rolls the whole release back, the global CLI included, when a plugin refuses", async () => {
    const install = globalMachine();
    const runner = new ScriptedRunner([
      { match: whenArgsInclude("view", "@amykit/cli@latest"), result: { stdout: '"0.6.0"\n' } },
      { match: whenArgsInclude("install"), result: { stdout: "ok\n" } },
    ]);
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      const { updateCommand } = await import("../src/index.js");
      const code = await updateCommand(home, runner, undefined, false, {
        mountProfiles: async () => ({ ok: false as const, problems: ["oncall: @amykit/plugin-file-log: refused"] }),
        skillsInto: () => [],
        installRoot: install,
      });
      expect(code).toBe(1);
    } finally {
      log.mockRestore();
      error.mockRestore();
    }
    const installs = runner.callsTo("npm").filter((call) => call.args[0] === "install").map((call) => call.args.at(-1));
    expect(installs).toEqual([
      "@amykit/plugin-file-log@0.6.0",
      "@amykit/cli@0.6.0",
      "@amykit/plugin-file-log@0.5.0",
      "@amykit/cli@0.5.0",
    ]);
    // One version on disk: the old one, and the manifest says so.
    expect(manifestOf(path.join(home, "plugins"))["@amykit/plugin-file-log"]).toBe("^0.5.0");
  });

  it("moves the whole release when the name given is one first-party package", async () => {
    const install = globalMachine();
    const runner = new ScriptedRunner([
      { match: whenArgsInclude("view", "@amykit/cli@latest"), result: { stdout: '"0.6.0"\n' } },
      { match: whenArgsInclude("install"), result: { stdout: "ok\n" } },
    ]);
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    try {
      const { updateCommand } = await import("../src/index.js");
      const code = await updateCommand(home, runner, "@amykit/cli", false, {
        mountProfiles: async () => ({ ok: true as const }),
        skillsInto: () => ["claude: 6 skill(s) rewritten"],
        installRoot: install,
      });
      expect(code).toBe(0);
    } finally {
      log.mockRestore();
    }
    const installs = runner.callsTo("npm").filter((call) => call.args[0] === "install").map((call) => call.args.at(-1));
    expect(installs).toEqual(["@amykit/plugin-file-log@0.6.0", "@amykit/cli@0.6.0"]);
  });

  it("rolls the release back when a move leaves a first-party copy past it", async () => {
    const install = globalMachine();
    // What a caret does inside the release's minor: a workflow from elsewhere
    // carries its own core, and npm answered its `^0.6.0` with 0.6.1.
    const root = path.join(home, "plugins");
    packageAt(path.join(root, "node_modules", "@acme", "workflow-oncall"), "@amykit/core", "0.6.1", "export {};");
    const runner = new ScriptedRunner([
      { match: whenArgsInclude("view", "@amykit/cli@latest"), result: { stdout: '"0.6.0"\n' } },
      { match: whenArgsInclude("install"), result: { stdout: "ok\n" } },
    ]);
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      const { updateCommand } = await import("../src/index.js");
      const code = await updateCommand(home, runner, undefined, false, {
        mountProfiles: async () => ({ ok: true as const }),
        skillsInto: () => ["claude: 6 skill(s) rewritten"],
        installRoot: install,
      });
      expect(code).toBe(1);
      expect(said(error)).toContain("@amykit/core@0.6.1");
    } finally {
      log.mockRestore();
      error.mockRestore();
    }
    const installs = runner.callsTo("npm").filter((call) => call.args[0] === "install").map((call) => call.args.at(-1));
    expect(installs).toEqual([
      "@amykit/plugin-file-log@0.6.0",
      "@amykit/cli@0.6.0",
      "@amykit/plugin-file-log@0.5.0",
      "@amykit/cli@0.5.0",
    ]);
  });

  it("names a first-party copy a third-party package holds below the release, and still moves", async () => {
    const install = globalMachine();
    const root = path.join(home, "plugins");
    const workflow = packageAt(root, "@acme/workflow-oncall", "1.0.0", "export {};");
    packageAt(workflow, "@amykit/core", "0.5.0", "export {};");
    const runner = new ScriptedRunner([
      { match: whenArgsInclude("view", "@amykit/cli@latest"), result: { stdout: '"0.6.0"\n' } },
      { match: whenArgsInclude("install"), result: { stdout: "ok\n" } },
    ]);
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    try {
      const { updateCommand } = await import("../src/index.js");
      const code = await updateCommand(home, runner, undefined, false, {
        mountProfiles: async () => ({ ok: true as const }),
        skillsInto: () => ["claude: 6 skill(s) rewritten"],
        installRoot: install,
      });
      expect(code).toBe(0);
      expect(said(log)).toContain("@amykit/core@0.5.0  inside @acme/workflow-oncall");
    } finally {
      log.mockRestore();
    }
  });
});

describe("versions compared by prerelease", () => {
  it("orders successive prereleases, so a prerelease tag moves", () => {
    expect(compareVersions("0.7.0-rc.2", "0.7.0-rc.1")).toBeGreaterThan(0);
    expect(compareVersions("0.7.0-rc.10", "0.7.0-rc.9")).toBeGreaterThan(0);
    expect(compareVersions("1.0.0-alpha", "1.0.0-alpha.1")).toBeLessThan(0);
    expect(compareVersions("1.0.0-alpha.1", "1.0.0-alpha.beta")).toBeLessThan(0);
    expect(compareVersions("1.0.0-beta", "1.0.0-alpha.beta")).toBeGreaterThan(0);
    expect(compareVersions("1.0.0-rc.1+build.2", "1.0.0-rc.1+build.1")).toBe(0);
  });
});

describe("the first-party copies on disk", () => {
  let home: string;

  beforeEach(() => {
    home = fs.mkdtempSync(path.join(os.tmpdir(), "amy-update-copies-"));
  });
  afterEach(() => fs.rmSync(home, { recursive: true, force: true }));

  it("include one nested under a third-party package", () => {
    packageAt(home, "@amykit/core", "0.6.0", "export {};");
    const workflow = packageAt(home, "@acme/workflow-oncall", "1.0.0", "export {};");
    packageAt(workflow, "@amykit/core", "0.5.0", "export {};");
    packageAt(home, "left-pad", "1.0.0", "export {};");

    const copies = firstPartyCopies(path.join(home, "node_modules")).map((copy) => `${copy.name}@${copy.version}`);
    expect(copies.sort()).toEqual(["@amykit/core@0.5.0", "@amykit/core@0.6.0"]);
  });
});

describe("the CLI's registry intent in a local install root", () => {
  let home: string;

  beforeEach(() => {
    home = fs.mkdtempSync(path.join(os.tmpdir(), "amy-update-intent-"));
  });
  afterEach(() => fs.rmSync(home, { recursive: true, force: true }));

  it("is latest when the dependency is a caret npm or a previous update saved", async () => {
    const install = path.join(home, "lib", "amy");
    fs.mkdirSync(install, { recursive: true });
    fs.writeFileSync(
      path.join(install, "package.json"),
      `${JSON.stringify({ name: "amy-install", private: true, dependencies: { "@amykit/cli": "^0.7.0" } })}\n`,
      "utf-8",
    );
    packageAt(install, "@amykit/cli", "0.7.0", "export {};");
    const runner = new ScriptedRunner([
      { match: whenArgsInclude("view", "@amykit/cli@latest"), result: { stdout: '"0.8.0"\n' } },
    ]);

    const { held: found, release } = await survey(runner, home, { kind: "local", dir: install, modules: path.join(install, "node_modules") });

    expect(release).toEqual({ version: "0.8.0", intent: "latest" });
    expect(found.find((one) => one.name === "@amykit/cli")).toMatchObject({ have: "0.7.0", want: "0.8.0" });
  });
});
