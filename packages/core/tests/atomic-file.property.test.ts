import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import fc from "fast-check";
import { describe, expect, it } from "vitest";

const FALSIFIER = "one_temp_name_for_every_writer";
const planted = process.env.SF_FALSIFIER === FALSIFIER;

/** The mutation the property must reject: every writer staging at `<file>.tmp`. */
const plantedWriter = `
import fs from "node:fs";
export function writeAtomically(file, content) {
  fs.writeFileSync(\`\${file}.tmp\`, content, "utf-8");
  fs.renameSync(\`\${file}.tmp\`, file);
}
`;

const realWriter = `
import { writeAtomically } from ${JSON.stringify(path.join(process.cwd(), "packages/core/src/atomic-file.ts"))};
export { writeAtomically };
`;

/** One writer, in a process of its own: between-process loss is the defect. */
const writerScript = `
import { writeAtomically } from "./writer.ts";
const [file, who, rounds] = process.argv.slice(2);
for (let n = 0; n < Number(rounds); n += 1) {
  writeAtomically(file, JSON.stringify({ who, n, pad: "x".repeat(4000) }));
}
`;

const TSX = path.join(process.cwd(), "node_modules", ".bin", "tsx");

interface Finished {
  readonly code: number | null;
  readonly stderr: string;
}

function run(script: string, args: readonly string[]): Promise<Finished> {
  return new Promise((resolve) => {
    const child = spawn(TSX, [script, ...args], { stdio: ["ignore", "ignore", "pipe"] });
    let stderr = "";
    child.stderr.on("data", (chunk: Buffer) => {
      stderr += chunk.toString();
    });
    child.on("close", (code) => resolve({ code, stderr }));
  });
}

describe("writing one file from many processes", () => {
  it("one_temp_name_for_every_writer", async () => {
    await fc.assert(
      fc.asyncProperty(fc.integer({ min: 2, max: 6 }), fc.integer({ min: 1, max: 3 }), async (writers, rounds) => {
        const directory = fs.mkdtempSync(path.join(os.tmpdir(), "amy-atomic-"));
        const file = path.join(directory, "record.json");
        fs.writeFileSync(path.join(directory, "writer.ts"), planted ? plantedWriter : realWriter, "utf-8");
        fs.writeFileSync(path.join(directory, "run.ts"), writerScript, "utf-8");

        // Every writer starts at once, and the file is read while they run:
        // a rename that lands half a record would be caught here.
        const running = Array.from({ length: writers }, (_, who) => run(path.join(directory, "run.ts"), [file, String(who), String(rounds)]));
        let torn = 0;
        for (let look = 0; look < 40; look += 1) {
          if (fs.existsSync(file)) {
            try {
              JSON.parse(fs.readFileSync(file, "utf-8"));
            } catch {
              torn += 1;
            }
          }
          await new Promise((resolve) => setTimeout(resolve, 5));
        }
        const finished = await Promise.all(running);

        // Nobody threw, no read was torn, and the file is one whole write.
        expect(finished.filter((one) => one.code !== 0).map((one) => one.stderr)).toEqual([]);
        expect(torn).toBe(0);
        const written = JSON.parse(fs.readFileSync(file, "utf-8")) as { who: string; n: number };
        expect(Number(written.who)).toBeGreaterThanOrEqual(0);
        expect(written.n).toBeGreaterThanOrEqual(0);
      }),
      { numRuns: 3 },
    );
  }, 60_000);
});
