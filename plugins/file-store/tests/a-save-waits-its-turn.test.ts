import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import { describe, expect, it } from "vitest";
import { FileStore } from "../src/FileStore.js";

const SOURCE = path.join(process.cwd(), "plugins/file-store/src/FileStore.ts");
const TSX = path.join(process.cwd(), "node_modules", ".bin", "tsx");

/** Another process changing the record, and taking its time about it while it holds the record. */
const slowWriter = `
import fs from "node:fs";
import { FileStore } from ${JSON.stringify(SOURCE)};
const [directory, holdMs] = process.argv.slice(2);
const wait = (ms) => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
const store = new FileStore(directory, false);
store.update("W-1", (record) => {
  fs.writeFileSync(directory + "/holding", "");
  wait(Number(holdMs));
  return { ...record, note: "written by the other process" };
});
`;

describe("a save beside a writer that holds the record", () => {
  it("waits its turn instead of failing, and its move is the one kept", async () => {
    // Inside the repository, so the script resolves `@amykit/core` the way the plugin does.
    const directory = fs.mkdtempSync(path.join(process.cwd(), ".tmp-store-turn-"));
    try {
      const store = new FileStore<{ id: string; state: string; attempts: number }>(directory);
      store.save({ id: "W-1", state: "WORKING", attempts: 0 });
      fs.writeFileSync(path.join(directory, "writer.ts"), slowWriter, "utf-8");

      const child = spawn(TSX, [path.join(directory, "writer.ts"), directory, "2500"], { stdio: ["ignore", "ignore", "pipe"] });
      let stderr = "";
      child.stderr.on("data", (chunk: Buffer) => (stderr += chunk.toString()));
      const exited = new Promise<number | null>((resolve) => child.on("close", resolve));
      const startBy = Date.now() + 15_000;
      while (!fs.existsSync(path.join(directory, "holding")) && Date.now() < startBy) await new Promise((resolve) => setTimeout(resolve, 5));
      expect(stderr).toBe("");
      expect(fs.existsSync(path.join(directory, "holding"))).toBe(true);

      // The engine's move, made while the other process still holds the record.
      expect(() => store.save({ id: "W-1", state: "DONE", attempts: 1 })).not.toThrow();
      expect(await exited).toBe(0);
      expect(JSON.parse(fs.readFileSync(path.join(directory, "W-1.json"), "utf-8"))).toMatchObject({ state: "DONE", attempts: 1 });
    } finally {
      fs.rmSync(directory, { recursive: true, force: true });
    }
  }, 30_000);
});
