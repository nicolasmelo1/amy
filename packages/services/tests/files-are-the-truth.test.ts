import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { defineContract, type OperationContext } from "@amykit/core";
import { FileStore } from "@amykit/plugin-file-store";
import { afterEach, describe, expect, it } from "vitest";
import { notes } from "./example/packages/services/src/domains/notes/index.js";
import type { NoteRecord } from "./example/packages/services/src/domains/notes/repositories/notes.js";
import { invoke } from "./support/invoke.js";

const made: string[] = [];
afterEach(() => made.splice(0).forEach((dir) => fs.rmSync(dir, { recursive: true, force: true })));

describe("what the port persists is the truth", () => {
  it("answers a record the daemon rewrote on disk on the next invoke, with no restart and no cache", async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "amy-truth-"));
    made.push(dir);
    // Two stores over one directory: the one the services were handed, and
    // the daemon's, as another process would hold it.
    const handed = new FileStore(dir);
    const daemon = new FileStore<NoteRecord>(dir);
    const note = (text: string): NoteRecord => ({ id: "n1", state: "OPEN", updatedAt: new Date().toISOString(), attempts: {}, history: [], text });
    const context: OperationContext = { port: (name) => (name === "store" ? handed : undefined) };
    const contract = defineContract(notes);

    daemon.save(note("first"));
    expect(await invoke(contract, "notes.read-note", { id: "n1" }, context)).toEqual({ kind: "output", output: { id: "n1", text: "first" } });

    daemon.save(note("rewritten"));
    expect(await invoke(contract, "notes.read-note", { id: "n1" }, context)).toEqual({ kind: "output", output: { id: "n1", text: "rewritten" } });
  });
});
