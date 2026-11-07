import { NoteNotFound } from "../exceptions.js";
import type { NotesRepository } from "../repositories/notes.js";

/** Reads one note as the store holds it now. */
export class ReadNote {
  constructor(private readonly notes: NotesRepository) {}

  async execute(id: string): Promise<{ id: string; text: string }> {
    const note = await this.notes.read(id);
    if (!note) throw new NoteNotFound(id);
    return { id: note.id, text: note.text };
  }
}
