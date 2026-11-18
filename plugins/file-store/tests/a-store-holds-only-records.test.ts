import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { FileStore } from "../src/FileStore.js";

/**
 * The records directory is what `amy workflow list` counts and what a person
 * reads by hand. Whatever a writer needed to get its turn, it does not stay
 * there once every writer is done.
 */
describe("a store's directory", () => {
  it("holds only its records after a writer took over from one that died holding a record", () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), "amy-store-only-records-"));
    try {
      const store = new FileStore<{ id: string; state: string; attempts: number }>(directory);
      store.save({ id: "W-1", state: "WORKING", attempts: 0 });
      // A writer that died while it held W-1: its process is gone.
      fs.writeFileSync(path.join(directory, "W-1.json.lock"), `${JSON.stringify({ pid: 2_147_483_646, stamp: "2147483646:gone" })}\n`);

      store.save({ id: "W-1", state: "DONE", attempts: 1 });

      expect(fs.readdirSync(directory).sort()).toEqual(["W-1.json"]);
    } finally {
      fs.rmSync(directory, { recursive: true, force: true });
    }
  });

});
