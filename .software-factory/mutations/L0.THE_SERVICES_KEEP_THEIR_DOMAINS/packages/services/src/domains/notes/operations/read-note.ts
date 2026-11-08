import { defineOperation, fail } from "@amykit/core";
import { z } from "zod";
import { NoteNotFound } from "../exceptions.js";
import { NotesRepository } from "../repositories/notes.js";
import { ReadNote } from "../services/read-note.js";

const input = z.object({ id: z.string().describe("the note's id") });
export const output = z.object({ id: z.string().describe("the note's id"), text: z.string().describe("what the note says") });

export const readNote = defineOperation({
  id: "notes.read-note",
  domain: "notes",
  summary: "Reads one note.",
  description: "Answers the note as the store holds it at the moment of asking. Never writes.",
  input,
  output,
  errors: { "notes.not_found": { description: "no note has that id" } },
  writes: [],
  http: { method: "get", path: "/notes/{id}" },
  cli: { words: ["note", "show"], positional: ["id"] },
  examples: [{ summary: "a note that exists", input: { id: "n1" }, output: { id: "n1", text: "buy milk" } }],
  async handler({ id }, context) {
    try {
      return await new ReadNote(NotesRepository.from(context)).execute(id);
    } catch (error) {
      if (error instanceof NoteNotFound) return fail("notes.not_found", error.message);
      throw error;
    }
  },
});
