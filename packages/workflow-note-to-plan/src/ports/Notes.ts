/**
 * A piece of friction, written down.
 *
 * It is not a ticket and does not become one. Nothing resolves it against a
 * tracker, which is the whole point: the machine hit something, and the note
 * is the only record that it did.
 */
export interface Note {
  /** Sortable, so the notes have a stable order without an index. */
  id: string;
  /** The repository the friction is about, as `owner/name`. */
  repo: string;
  /** The friction, in the words of whoever wrote it down. */
  text: string;
  /** Who wrote it: a person at a keyboard, or a tick that failed. */
  source: string;
  writtenAt: string;
}

/** A note as it is written, before anything has been decided about it. */
export type NewNote = Omit<Note, "id" | "writtenAt">;

/**
 * Where the notes are kept.
 *
 * Two ways in and one way out. A note may be written by hand, by a hook, or
 * by this machine when one of its own ticks fails; all three write the same
 * record, and `all()` is what a workflow discovers work from.
 */
export interface Notes {
  write(note: NewNote, now: Date): Note;
  all(): Note[];
  get(id: string): Note | null;
}
