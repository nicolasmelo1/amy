import { describe, expect, it } from "vitest";
import { ScriptedRunner } from "@amykit/test-fixtures";
import { PROFILE_SETTINGS, amySkillRoot, checkProfile, prepareProfile } from "../src/profile.js";

/**
 * Measured on Hermes Agent v0.23.0 in a scratch HERMES_HOME:
 *   - `hermes -p P config set skills.external_dirs '["/a"]'` stores a YAML list;
 *   - `hermes -p P config get skills.external_dirs` prints it as `  - /a`;
 *   - `config set` replaces the list, it does not append to it;
 *   - `profile create --clone` copies the active profile's config.yaml, so a
 *     new profile starts with whatever external_dirs the operator had.
 */
const SKILLS = amySkillRoot("/w/.amy");

/** A hermes whose profile exists or not, and whose `config get` answers from `values`. */
function hermes(present: boolean, values: Record<string, string>): ScriptedRunner {
  return new ScriptedRunner([
    { match: (c, a) => c === "hermes" && a[0] === "profile" && a[1] === "show", result: { exitCode: present ? 0 : 1, stdout: "" } },
    ...Object.entries(values).map(([key, stdout]) => ({
      match: (c: string, a: readonly string[]) => c === "hermes" && a.includes("get") && a.includes(key),
      result: { exitCode: 0, stdout },
    })),
    { match: (c) => c === "hermes", result: { exitCode: 0, stdout: "" } },
  ]);
}

const healthy = Object.fromEntries(PROFILE_SETTINGS.map((setting) => [setting.key, `${setting.value}\n`]));

/** The list the last `config set skills.external_dirs` wrote, as hermes parses it. */
function externalDirsWritten(runner: ScriptedRunner): string[] | undefined {
  const set = runner
    .callsTo("hermes")
    .map((call) => call.args)
    .filter((args) => args.includes("set") && args.includes("skills.external_dirs"))
    .at(-1);
  return set ? (JSON.parse(set.at(-1)!) as string[]) : undefined;
}

describe("amy's skill root in the profile hermes runs in", () => {
  it("is written by setup into a profile that already exists", async () => {
    const runner = hermes(true, { ...healthy, "skills.external_dirs": "[]\n" });

    const check = await prepareProfile(runner, "amy", SKILLS);

    expect(check.ok).toBe(true);
    expect(externalDirsWritten(runner)).toContain(SKILLS);
  });

  it("keeps the directories the profile already named beside it", async () => {
    const runner = hermes(false, { ...healthy, "skills.external_dirs": "  - /team/skills\n" });

    await prepareProfile(runner, "amy", SKILLS);

    expect(externalDirsWritten(runner)).toEqual(expect.arrayContaining(["/team/skills", SKILLS]));
  });

  it("is reported drifted when only a directory whose name starts the same is named", async () => {
    const runner = hermes(true, { ...healthy, "skills.external_dirs": `  - ${SKILLS}-old\n` });

    const check = await checkProfile(runner, "amy", SKILLS);

    expect(check.ok).toBe(false);
    expect(check.detail).toContain("skills.external_dirs");
  });
});
