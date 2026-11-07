import { defineContract, defineOperation, fail, type OperationContext } from "@amykit/core";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { notes } from "./example/packages/services/src/domains/notes/index.js";
import { invoke } from "./support/invoke.js";

const empty: OperationContext = { port: () => ({ load: () => null, save: () => undefined, all: () => [] }) };

/** A domain error its operation forgot to declare, the mistake this guards. */
class NoteLocked extends Error {}

const lockNote = defineOperation({
  id: "notes.lock-note",
  domain: "notes",
  summary: "Locks a note.",
  description: "Locks a note; maps a domain error to a code it never declared.",
  input: z.object({ id: z.string().describe("the note") }),
  output: z.object({ locked: z.boolean().describe("whether it is locked now") }),
  errors: { "notes.not_found": { description: "no note has that id" } },
  writes: ["store"],
  http: { method: "post", path: "/notes/{id}/lock" },
  examples: [{ summary: "a note", input: { id: "n1" }, output: { locked: true } }],
  async handler() {
    try {
      throw new NoteLocked("already locked");
    } catch (error) {
      if (error instanceof NoteLocked) return fail("notes.locked", error.message);
      throw error;
    }
  },
});

describe("a domain error and the operation that maps it", () => {
  it("comes back as the declared error when the operation declared it", async () => {
    expect(await invoke(defineContract(notes), "notes.read-note", { id: "gone" }, empty)).toMatchObject({ kind: "error", error: { code: "notes.not_found" } });
  });

  it("comes back as internal when no operation declared it", async () => {
    const outcome = await invoke(defineContract([lockNote]), "notes.lock-note", { id: "n1" }, empty);
    expect(outcome).toMatchObject({ kind: "internal", error: { code: "amy.internal" } });
    expect(outcome.kind === "internal" && outcome.error.message).toContain("`notes.locked`, which it does not declare");
  });
});
