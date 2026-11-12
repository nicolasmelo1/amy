import os from "node:os";
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
 * edits the work. Both look like success from outside.
 */
export async function harnessConformance(make: () => HarnessUnderTest): Promise<string[]> {
  const findings: string[] = [];
  const writing = await granted(make(), false, findings);
  if (writing !== undefined && writing !== "write") {
    findings.push(`a writing run is handed ${writing === "nothing" ? "no way to write" : "only a way to read"}`);
  }
  const reading = await granted(make(), true, findings);
  if (reading === "write") findings.push("a read-only run is handed a way to write");
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
