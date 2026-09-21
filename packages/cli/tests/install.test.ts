import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { ScriptedRunner, whenArgsInclude } from "@amykit/test-fixtures";
import { ensurePluginsRoot, installIntoPluginsRoot, packageManager } from "../src/install.js";

describe("packageManager", () => {
  it("is `npm` where a shell is not needed to find it", () => {
    expect(packageManager("darwin")).toBe("npm");
    expect(packageManager("linux")).toBe("npm");
  });

  it("is `npm.cmd` on Windows, which is what is actually on the PATH there", () => {
    // `spawn` without a shell cannot find `npm` on Windows. The failure is
    // ENOENT on the one command that exists to make installing easy, and it
    // is invisible on the machine this was written on.
    expect(packageManager("win32")).toBe("npm.cmd");
  });
});

describe("installIntoPluginsRoot", () => {
  let root: string;

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), "amy-install-"));
  });
  afterEach(() => fs.rmSync(root, { recursive: true, force: true }));

  it("installs into amy's own root, which is where amy resolves plugins from", async () => {
    const runner = new ScriptedRunner();

    await installIntoPluginsRoot(runner, root, ["@amykit/plugin-linear", "@amykit/plugin-github"]);

    expect(runner.calls[0]?.args).toEqual([
      "install",
      "--prefix",
      root,
      "--no-audit",
      "--no-fund",
      "--",
      "@amykit/plugin-linear",
      "@amykit/plugin-github",
    ]);
  });

  it("installs every package in one call, so one resolution sees them all", async () => {
    const runner = new ScriptedRunner();

    await installIntoPluginsRoot(runner, root, ["@amykit/plugin-linear", "@amykit/plugin-github"]);

    expect(runner.calls).toHaveLength(1);
  });

  it("allows longer than the runner's default, because a cold cache is not a hang", async () => {
    const runner = new ScriptedRunner();

    await installIntoPluginsRoot(runner, root, ["@amykit/core"]);

    expect(runner.calls[0]?.options?.timeoutMs).toBe(10 * 60 * 1000);
  });

  it("reports the command it ran, so a failure can be retried by hand", async () => {
    const runner = new ScriptedRunner();

    const outcome = await installIntoPluginsRoot(runner, root, ["@amykit/core"]);

    expect(outcome.command).toContain(`install --prefix ${root} --no-audit --no-fund -- @amykit/core`);
  });

  it("keeps both streams, because npm says the interesting part on either", async () => {
    const runner = new ScriptedRunner([
      {
        match: whenArgsInclude("install"),
        result: { ok: false, exitCode: 1, stdout: "added 0 packages", stderr: "404 Not Found" },
      },
    ]);

    const outcome = await installIntoPluginsRoot(runner, root, ["@amykit/plugin-nope"]);

    expect(outcome.ok).toBe(false);
    expect(outcome.output).toContain("added 0 packages");
    expect(outcome.output).toContain("404 Not Found");
  });

  it("says it failed rather than throwing, so the caller can name the next step", async () => {
    const runner = new ScriptedRunner([
      { match: whenArgsInclude("install"), result: { ok: false, exitCode: 1 } },
    ]);

    await expect(installIntoPluginsRoot(runner, root, ["@amykit/core"])).resolves.toMatchObject({ ok: false });
  });
});

describe("a plugin root", () => {
  let root: string;

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), "amy-plugin-root-"));
  });
  afterEach(() => fs.rmSync(root, { recursive: true, force: true }));

  it("becomes a real npm root the first time it is needed", () => {
    ensurePluginsRoot(root);

    expect(JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf-8"))).toMatchObject({
      name: "amy-plugins",
      private: true,
    });
  });

  it("leaves a root that already has a manifest exactly as it was", () => {
    // An existing manifest is npm's state — the dependency list an install
    // wrote. Rewriting it would drop what the last install put there.
    fs.mkdirSync(root, { recursive: true });
    fs.writeFileSync(path.join(root, "package.json"), '{"name":"someone-else"}\n', "utf-8");

    ensurePluginsRoot(root);

    expect(fs.readFileSync(path.join(root, "package.json"), "utf-8")).toBe('{"name":"someone-else"}\n');
  });
});