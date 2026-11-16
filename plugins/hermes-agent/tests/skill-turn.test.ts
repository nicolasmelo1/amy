import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { ScriptedRunner } from "@amykit/test-fixtures";
import { HermesHarness } from "../src/HermesHarness.js";

/**
 * How Hermes Agent v0.23.0 resolves `-s <name>`, measured on the installed CLI
 * and its source (agent/prompt_builder.py, agent/skill_utils.py):
 *   - roots by precedence: project > the profile's own `skills` > create_dir >
 *     `skills.external_dirs`; a same-named skill in a higher tier wins, so
 *     amy's root, named through external_dirs, is the lowest;
 *   - `hermes profile create --clone` copies the active profile's skills into
 *     the new profile, so an operator's older copy lands in the local tier;
 *   - `hermes -z ... -s <unknown>` exits 1, prints `Error: unknown_skill` on
 *     stderr and writes no `--usage-file`.
 */

let hermesHome: string;
let amyRoot: string;
let before: string | undefined;

function profileWith(externalDirs: string[]): void {
  const profile = path.join(hermesHome, "profiles", "amy");
  fs.mkdirSync(path.join(profile, "skills"), { recursive: true });
  fs.writeFileSync(
    path.join(profile, "config.yaml"),
    `skills:\n  external_dirs:\n${externalDirs.map((dir) => `    - ${dir}\n`).join("")}`,
  );
}

function skillUnder(root: string, name = "amy-groom"): string {
  const directory = path.join(root, name);
  fs.mkdirSync(directory, { recursive: true });
  fs.writeFileSync(path.join(directory, "SKILL.md"), `---\nname: ${name}\ndescription: groom a ticket\n---\n# ${name}\n`);
  return directory;
}

/** A hermes CLI that answers `config get` from the profile, and a one-shot as `oneShot` says. */
function hermes(oneShot: { exitCode: number; stdout?: string; stderr?: string }, externalDirs: string[]): ScriptedRunner {
  return new ScriptedRunner([
    {
      match: (command, args) => command === "hermes" && args.includes("get") && args.includes("skills.external_dirs"),
      result: { exitCode: 0, stdout: externalDirs.map((dir) => `  - ${dir}`).join("\n") + "\n" },
    },
    { match: (command, args) => command === "hermes" && args.includes("-z"), result: oneShot },
  ]);
}

const oneShots = (runner: ScriptedRunner) => runner.callsTo("hermes").filter((call) => call.args.includes("-z"));

beforeEach(() => {
  before = process.env.HERMES_HOME;
  hermesHome = fs.mkdtempSync(path.join(os.tmpdir(), "amy-hermes-home-"));
  process.env.HERMES_HOME = hermesHome;
  amyRoot = path.join(hermesHome, "..", path.basename(hermesHome) + "-amy-skills");
  fs.mkdirSync(amyRoot);
});

afterEach(() => {
  if (before === undefined) delete process.env.HERMES_HOME;
  else process.env.HERMES_HOME = before;
  fs.rmSync(hermesHome, { recursive: true, force: true });
  fs.rmSync(amyRoot, { recursive: true, force: true });
});

describe("a hermes turn addressed to a skill", () => {
  it("runs with -s when the profile resolves the name to the lent directory", async () => {
    profileWith([amyRoot]);
    const skill = skillUnder(amyRoot);
    const runner = hermes({ exitCode: 0, stdout: "done" }, [amyRoot]);

    await new HermesHarness(runner, { profile: "amy" }, hermesHome).ask("groom it", hermesHome, { skill: { name: "amy-groom", path: skill } });

    const [run] = oneShots(runner);
    expect(run?.args[run.args.indexOf("-s") + 1]).toBe("amy-groom");
  });

  it("fails naming the skill and `amy skills` when hermes reports it unknown", async () => {
    profileWith([amyRoot]);
    const skill = skillUnder(amyRoot);
    const runner = hermes({ exitCode: 1, stdout: "", stderr: "Error: unknown_skill\n" }, [amyRoot]);

    const reply = await new HermesHarness(runner, { profile: "amy" }, hermesHome).ask("groom it", hermesHome, {
      skill: { name: "amy-groom", path: skill },
    });

    expect(reply.run.outcome).toBe("failed");
    expect(reply.run.output).toContain("amy-groom");
    expect(reply.run.output).toContain("amy skills");
  });

  it("is refused before it runs when the profile's own copy of the name would be loaded instead", async () => {
    profileWith([amyRoot]);
    const skill = skillUnder(amyRoot);
    // What `profile create --clone` brought over from the operator's profile.
    skillUnder(path.join(hermesHome, "profiles", "amy", "skills"));
    const runner = hermes({ exitCode: 0, stdout: "done" }, [amyRoot]);

    const reply = await new HermesHarness(runner, { profile: "amy" }, hermesHome).ask("groom it", hermesHome, {
      skill: { name: "amy-groom", path: skill },
    });

    expect(oneShots(runner)).toEqual([]);
    expect(reply.run.outcome).toBe("failed");
    expect(reply.run.output).toContain("amy-groom");
  });

  it("is refused before it runs when the lent directory is in no root the profile reads", async () => {
    profileWith([amyRoot]);
    const elsewhere = fs.mkdtempSync(path.join(os.tmpdir(), "amy-configured-root-"));
    try {
      const skill = skillUnder(elsewhere);
      const runner = hermes({ exitCode: 0, stdout: "done" }, [amyRoot]);

      const reply = await new HermesHarness(runner, { profile: "amy" }, hermesHome).ask("groom it", hermesHome, {
        skill: { name: "amy-groom", path: skill },
      });

      expect(oneShots(runner)).toEqual([]);
      expect(reply.run.outcome).toBe("failed");
      expect(reply.run.output).toContain("amy-groom");
    } finally {
      fs.rmSync(elsewhere, { recursive: true, force: true });
    }
  });
});
