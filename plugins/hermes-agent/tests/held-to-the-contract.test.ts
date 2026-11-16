import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import * as fixtures from "@amykit/test-fixtures";
import { ScriptedRunner } from "@amykit/test-fixtures";
import { HermesHarness } from "../src/HermesHarness.js";
import { amySkillRoot, checkProfile, prepareProfile } from "../src/profile.js";

type Validator = (args: readonly string[]) => void;

/** The vendored hermes CLI's check, from the shared fixtures. */
const assertValidHermesInvocation = (fixtures as Record<string, unknown>).assertValidHermesInvocation as Validator | undefined;

describe("hermes, held to the CLI it was vendored from", () => {
  it("refuses an invocation the CLI does not take", () => {
    expect(assertValidHermesInvocation).toBeTypeOf("function");
    expect(() => assertValidHermesInvocation!(["-z", "go", "--preload-skill", "amy-groom"])).toThrow();
  });

  it("is invoked only as the CLI takes it, by a skill turn, setup and the doctor", async () => {
    expect(assertValidHermesInvocation).toBeTypeOf("function");
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "amy-hermes-contract-"));
    try {
      const skill = path.join(root, "amy-groom");
      fs.mkdirSync(skill);
      fs.writeFileSync(path.join(skill, "SKILL.md"), "---\nname: amy-groom\ndescription: groom a ticket\n---\n");
      const runner = new ScriptedRunner([{ match: () => true, result: { exitCode: 0, stdout: "" } }]);

      await new HermesHarness(runner, { profile: "amy", model: "gpt-5" }, root).ask("groom it", root, {
        skill: { name: "amy-groom", path: skill },
      });
      await prepareProfile(runner, "amy", amySkillRoot(root));
      await checkProfile(runner, "amy", amySkillRoot(root));

      const invocations = runner.callsTo("hermes").map((call) => call.args);
      expect(invocations.length).toBeGreaterThan(0);
      for (const args of invocations) assertValidHermesInvocation!(args);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });
});
