import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import fc from "fast-check";
import { describe, expect, it } from "vitest";

const FALSIFIER = "look_loads_then_saves";
const planted = process.env.SF_FALSIFIER === FALSIFIER;

const SOURCE = path.join(process.cwd(), "plugins/file-store/src/FileStore.ts");
const TSX = path.join(process.cwd(), "node_modules", ".bin", "tsx");

/** The mutation the property must reject: `amy look` reading, editing and saving in three steps. */
const plantedLook = `
import fs from "node:fs";
import { FileStore } from ${JSON.stringify(SOURCE)};
const [directory, waitMs] = process.argv.slice(2);
const wait = (ms) => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
while (!fs.existsSync(directory + "/ready")) wait(1);
const store = new FileStore(directory, false);
const record = store.load("W-1");
if (record?.gaveUp) {
  const { gaveUp, ...rest } = record;
  // The gap the lock exists to close: the engine moves the record here.
  wait(Number(waitMs));
  store.save(rest);
}
`;

/** `amy look`, clearing the marker through the store's own lock. */
const realLook = `
import fs from "node:fs";
import { FileStore } from ${JSON.stringify(SOURCE)};
const [directory, waitMs] = process.argv.slice(2);
const wait = (ms) => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
while (!fs.existsSync(directory + "/ready")) wait(1);
const store = new FileStore(directory, false);
store.update("W-1", (record) => {
  if (!record.gaveUp) return undefined;
  const { gaveUp, ...rest } = record;
  wait(Number(waitMs));
  return rest;
});
`;

/** The engine: one move, then another while the look is holding the record. */
const engine = `
import fs from "node:fs";
import { FileStore } from ${JSON.stringify(SOURCE)};
const [directory] = process.argv.slice(2);
const wait = (ms) => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
const store = new FileStore(directory, false);
store.save({ id: "W-1", state: "WORKING", attempts: 1, gaveUp: "ceiling" });
fs.writeFileSync(directory + "/ready", "");
wait(10);
store.save({ id: "W-1", state: "WORKING", attempts: 2, gaveUp: "ceiling" });
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

describe("a record", () => {
  it("look_loads_then_saves", async () => {
    await fc.assert(
      fc.asyncProperty(fc.integer({ min: 10, max: 80 }), async (waitMs) => {
        // Inside the repository, so the scripts resolve `@amykit/core` the
        // way the plugin does; removed before the property returns.
        const directory = fs.mkdtempSync(path.join(process.cwd(), ".tmp-file-store-"));
        try {
          fs.writeFileSync(path.join(directory, "W-1.json"), JSON.stringify({ id: "W-1", state: "WORKING", attempts: 0, gaveUp: "ceiling" }), "utf-8");
          fs.writeFileSync(path.join(directory, "look.ts"), planted ? plantedLook : realLook, "utf-8");
          fs.writeFileSync(path.join(directory, "engine.ts"), engine, "utf-8");

          // The look reads while the engine has one move in, then holds the
          // record while the engine tries to make another. Neither move may
          // be erased by the other.
          const [looked, moved] = await Promise.all([
            run(path.join(directory, "look.ts"), [directory, String(waitMs)]),
            run(path.join(directory, "engine.ts"), [directory]),
          ]);

          expect(looked.stderr).toBe("");
          expect(moved.stderr).toBe("");
          expect(looked.code).toBe(0);
          expect(moved.code).toBe(0);
          const record = JSON.parse(fs.readFileSync(path.join(directory, "W-1.json"), "utf-8")) as { attempts: number };
          // The engine's second move is in the record: the look's write
          // carried the state it read, so a stale one rolled the count back.
          expect(record.attempts).toBe(2);
        } finally {
          fs.rmSync(directory, { recursive: true, force: true });
        }
      }),
      { numRuns: 4 },
    );
  }, 60_000);
});
