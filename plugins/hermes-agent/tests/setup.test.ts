import { describe, it, expect } from "vitest";
import { CommandResult } from "@amykit/core";
import { ScriptedRunner } from "@amykit/test-fixtures";
import { PROFILE_SETTINGS, checkProfile, plugin, prepareProfile } from "../src/index.js";

type Script = { match: (command: string, args: readonly string[]) => boolean; result: Partial<CommandResult> };

/** A hermes whose `profile show` answers for whether the profile is there. */
function hermes(present: boolean, overrides: Script[] = []): ScriptedRunner {
  return new ScriptedRunner([
    ...overrides,
    { match: (c, a) => c === "hermes" && a[0] === "profile" && a[1] === "show", result: { exitCode: present ? 0 : 1, stdout: "" } },
    { match: (c) => c === "hermes", result: { exitCode: 0, stdout: "" } },
  ]);
}

/** A hermes whose `config get` answers with what is set in the profile. */

function argvs(runner: ScriptedRunner): string[] {
  return runner.callsTo("hermes").map((call) => call.args.join(" "));
}

describe("the profile amy runs Hermes in", () => {
  it("is cloned from the active profile when it is missing, and has memory, unasked skill writes and the curator turned off", async () => {
    const runner = hermes(false);

    const check = await prepareProfile(runner, "amy");

    expect(check.ok).toBe(true);
    const ran = argvs(runner);
    expect(ran).toContain("profile show amy");
    expect(ran.some((line) => line.startsWith("profile create amy --clone --no-alias"))).toBe(true);
    for (const setting of PROFILE_SETTINGS) expect(ran).toContain(`-p amy config set ${setting.key} ${setting.value}`);
    expect(PROFILE_SETTINGS.map((setting) => `${setting.key}=${setting.value}`)).toEqual([
      "memory.memory_enabled=false",
      "memory.user_profile_enabled=false",
      "skills.write_approval=true",
      "curator.enabled=false",
    ]);
  });

  it("is left alone when it exists", async () => {
    const runner = hermes(true);

    const check = await prepareProfile(runner, "amy");

    expect(check.ok).toBe(true);
    expect(argvs(runner)).toEqual(["profile show amy"]);
  });

  it("reports a create hermes refused, with what hermes said", async () => {
    const runner = hermes(false, [
      { match: (c, a) => c === "hermes" && a[1] === "create", result: { exitCode: 1, stderr: "Profile name invalid" } },
    ]);

    const check = await prepareProfile(runner, "amy");

    expect(check.ok).toBe(false);
    expect(check.detail).toContain("Profile name invalid");
    expect(argvs(runner).some((line) => line.includes("config set"))).toBe(false);
  });

  it("is brought by the plugin as a setup, and the doctor checks it", () => {
    expect(plugin.setup?.map((one) => one.name)).toEqual(["hermes profile"]);
    expect(plugin.checks?.map((one) => one.name)).toEqual(["hermes profile"]);
  });
});

describe("what the doctor says about it", () => {
  it("is red with the command that creates it when it is missing", async () => {
    const check = await checkProfile(hermes(false), "amy");

    expect(check.ok).toBe(false);
    expect(check.detail).toContain("amy init");
    expect(check.detail).toContain("hermes profile create amy --clone");
  });

  it("is green when everything amy turned off is still off", async () => {
    const runner = new ScriptedRunner([
      { match: (c, a) => a[0] === "profile", result: { exitCode: 0, stdout: "" } },
      ...PROFILE_SETTINGS.map((setting) => ({
        match: (c: string, a: readonly string[]) => c === "hermes" && a[3] === "get" && a[4] === setting.key,
        result: { exitCode: 0, stdout: setting.value },
      })),
    ]);

    expect((await checkProfile(runner, "amy")).ok).toBe(true);
  });

  it("is red, naming the command that puts it back, when the profile remembers again", async () => {
    const runner = new ScriptedRunner([
      { match: (c, a) => a[0] === "profile", result: { exitCode: 0, stdout: "" } },
      { match: (c, a) => a[3] === "get" && a[4] === "memory.memory_enabled", result: { exitCode: 0, stdout: "True" } },
      ...PROFILE_SETTINGS.map((setting) => ({
        match: (c: string, a: readonly string[]) => a[3] === "get" && a[4] === setting.key,
        result: { exitCode: 0, stdout: setting.value },
      })),
    ]);

    const check = await checkProfile(runner, "amy");

    expect(check.ok).toBe(false);
    expect(check.detail).toContain("remembers between runs");
    expect(check.detail).toContain("hermes -p amy config set memory.memory_enabled false");
    expect(check.detail).not.toContain("curates");
  });
});

describe("a blank profile", () => {
  it("is refused at boot, since it would run Hermes in the operator's own profile", () => {
    const registry = { contribute: () => {} } as never;
    const ctx = { config: { profile: "  ", model: "", models: [], timeoutMs: 1000 }, runner: hermes(true) } as never;

    expect(() => plugin.register(registry, ctx)).toThrow(/profile.*blank/);
  });
});
