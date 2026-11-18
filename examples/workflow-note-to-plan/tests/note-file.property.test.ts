import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import fc from "fast-check";
import { describe, expect, it } from "vitest";

const FALSIFIER = "a_note_written_over_another";
const planted = process.env.SF_FALSIFIER === FALSIFIER;

const SOURCE = path.join(process.cwd(), "examples/workflow-note-to-plan/src/note-file.ts");
const TSX = path.join(process.cwd(), "node_modules", ".bin", "tsx");

/** The mutation the property must reject: an id checked free, then written without `wx`. */
const plantedWriter = `
import fs from "node:fs";
import path from "node:path";
const [directory, who] = process.argv.slice(2);
const wait = (ms) => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
while (!fs.existsSync(directory + "/go")) wait(1);
const id = "note-20261115T120000000";
// The gap between the check and the write, widened so the defect is
// observable: every writer that looked found the same name free.
wait(20);
fs.writeFileSync(path.join(directory, id + ".md"), "---\\nrepo: acme/one\\nsource: test\\nwritten: " + new Date().toISOString() + "\\n---\\n\\nnote " + who + "\\n", "utf-8");
`;

/** The workflow's own writer, created exclusively. */
const realWriter = `
import fs from "node:fs";
import { writeNoteFile } from ${JSON.stringify(SOURCE)};
const [directory, who] = process.argv.slice(2);
const wait = (ms) => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
while (!fs.existsSync(directory + "/go")) wait(1);
writeNoteFile(directory, { repo: "acme/one", source: "test", text: "note " + who }, new Date("2026-11-15T12:00:00.000Z"));
`;

function run(script: string, args: readonly string[]): Promise<{ code: number | null; stderr: string }> {
  return new Promise((resolve) => {
    const child = spawn(TSX, [script, ...args], { stdio: ["ignore", "ignore", "pipe"] });
    let stderr = "";
    child.stderr.on("data", (chunk: Buffer) => {
      stderr += chunk.toString();
    });
    child.on("close", (code) => resolve({ code, stderr }));
  });
}

describe("a note written at one instant", () => {
  it("a_note_written_over_another", async () => {
    await fc.assert(
      fc.asyncProperty(fc.integer({ min: 2, max: 6 }), async (writers) => {
        // Inside the repository, so the script resolves `@amykit/core` the
        // way the example does; removed before the property returns.
        const directory = fs.mkdtempSync(path.join(process.cwd(), ".tmp-notes-"));
        try {
          fs.writeFileSync(path.join(directory, "write.ts"), planted ? plantedWriter : realWriter, "utf-8");
          const running = Array.from({ length: writers }, (_, who) => run(path.join(directory, "write.ts"), [directory, String(who)]));
          // All of them are waiting on the same instant; then they go.
          await new Promise((resolve) => setTimeout(resolve, 400));
          fs.writeFileSync(path.join(directory, "go"), "", "utf-8");
          const finished = await Promise.all(running);

          expect(finished.map((one) => one.stderr)).toEqual(Array.from({ length: writers }, () => ""));
          expect(finished.map((one) => one.code)).toEqual(Array.from({ length: writers }, () => 0));

          // Every note exists, with its own content: nobody's was written over.
          const notes = fs.readdirSync(directory).filter((name) => name.endsWith(".md"));
          expect(notes).toHaveLength(writers);
          const texts = notes.map((name) => fs.readFileSync(path.join(directory, name), "utf-8").trim().split("\n").at(-1));
          expect(texts.sort()).toEqual(Array.from({ length: writers }, (_, who) => `note ${who}`).sort());
        } finally {
          fs.rmSync(directory, { recursive: true, force: true });
        }
      }),
      { numRuns: 3 },
    );
  }, 60_000);
});
