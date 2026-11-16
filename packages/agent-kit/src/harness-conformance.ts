import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { Harness } from "@amykit/core";

/** What one run was handed, as its own CLI reads what reached it. */
export type Granted = "write" | "read-only" | "nothing";

/**
 * A harness over a seam its test watches. Only the harness's own test knows
 * how its CLI spells writing, so it says what the last run was handed.
 */
export interface HarnessUnderTest {
  readonly harness: Harness;
  granted(): Granted;
}

/**
 * Asks a harness for one writing run and one read-only run, and says what
 * each was handed that it should not have been. Empty when it conforms.
 *
 * A writing run with no way to write answers and changes nothing, which a
 * step reads as done; a read-only run that may write is a discussion that
 * edits the work. Both look like success from outside. A skill turn is the
 * same shape: a harness that did not declare `lendsSkill` and answers one
 * anyway has acted without the method it was addressed to.
 */
export async function harnessConformance(make: () => HarnessUnderTest): Promise<string[]> {
  const findings: string[] = [];
  const writing = await granted(make(), false, findings);
  if (writing !== undefined && writing !== "write") {
    findings.push(`a writing run is handed ${writing === "nothing" ? "no way to write" : "only a way to read"}`);
  }
  const reading = await granted(make(), true, findings);
  if (reading === "write") findings.push("a read-only run is handed a way to write");
  await aSkillTurn(make(), findings);
  return findings;
}

async function granted(probe: HarnessUnderTest, readOnly: boolean, findings: string[]): Promise<Granted | undefined> {
  try {
    // A directory that exists: a harness that spawns its CLI runs it there.
    await probe.harness.ask(readOnly ? "why did it fail?" : "change it", os.tmpdir(), readOnly ? { readOnly } : {});
  } catch (error) {
    findings.push(`a ${readOnly ? "read-only" : "writing"} run threw: ${error instanceof Error ? error.message : String(error)}`);
    return undefined;
  }
  return probe.granted();
}

/**
 * Asks for a turn addressed to a skill, on a harness that says it cannot be
 * handed one.
 *
 * The relay refuses to send `/name` to such a rung, so the only way a harness
 * can see this turn is if a caller went around the relay. Answering it is the
 * failure: the run followed no method and looks completed anyway. Refusing,
 * by a failed run or a throw, is what a harness that declared nothing owes.
 */
async function aSkillTurn(probe: HarnessUnderTest, findings: string[]): Promise<void> {
  if (probe.harness.lendsSkill === true) return;

  const root = fs.mkdtempSync(path.join(os.tmpdir(), "amy-conformance-skill-"));
  const directory = path.join(root, "amy-groom");
  fs.mkdirSync(directory);
  fs.writeFileSync(path.join(directory, "SKILL.md"), "# amy-groom\n");
  try {
    const reply = await probe.harness.ask("change it", os.tmpdir(), { skill: { name: "amy-groom", path: directory } });
    if (reply.run.outcome !== "failed" && reply.run.outcome !== "abandoned") {
      findings.push("a skill turn was answered by a harness that does not lend the skill");
    }
  } catch {
    // A harness that refuses by throwing has refused.
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
}
