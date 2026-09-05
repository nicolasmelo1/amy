import { describe, it, expect } from "vitest";
import { ScriptedRunner, whenArgsInclude } from "@amykit/test-fixtures";
import { installGlobally, packageManager } from "../src/install.js";

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

describe("installGlobally", () => {
  it("installs into the global prefix, where amy resolves plugins from", async () => {
    const runner = new ScriptedRunner();

    await installGlobally(runner, ["@amykit/plugin-linear", "@amykit/plugin-github"]);

    expect(runner.calls[0]?.args).toEqual([
      "install",
      "--global",
      "@amykit/plugin-linear",
      "@amykit/plugin-github",
    ]);
  });

  it("installs every package in one call, so one resolution sees them all", async () => {
    const runner = new ScriptedRunner();

    await installGlobally(runner, ["@amykit/plugin-linear", "@amykit/plugin-github"]);

    expect(runner.calls).toHaveLength(1);
  });

  it("allows longer than the runner's default, because a cold cache is not a hang", async () => {
    const runner = new ScriptedRunner();

    await installGlobally(runner, ["@amykit/core"]);

    expect(runner.calls[0]?.options?.timeoutMs).toBe(10 * 60 * 1000);
  });

  it("reports the command it ran, so a failure can be retried by hand", async () => {
    const runner = new ScriptedRunner();

    const outcome = await installGlobally(runner, ["@amykit/core"]);

    expect(outcome.command).toContain("install --global @amykit/core");
  });

  it("keeps both streams, because npm says the interesting part on either", async () => {
    const runner = new ScriptedRunner([
      {
        match: whenArgsInclude("install"),
        result: { ok: false, exitCode: 1, stdout: "added 0 packages", stderr: "404 Not Found" },
      },
    ]);

    const outcome = await installGlobally(runner, ["@amykit/plugin-nope"]);

    expect(outcome.ok).toBe(false);
    expect(outcome.output).toContain("added 0 packages");
    expect(outcome.output).toContain("404 Not Found");
  });

  it("says it failed rather than throwing, so the caller can name the next step", async () => {
    const runner = new ScriptedRunner([
      { match: whenArgsInclude("install"), result: { ok: false, exitCode: 1 } },
    ]);

    await expect(installGlobally(runner, ["@amykit/core"])).resolves.toMatchObject({ ok: false });
  });
});
