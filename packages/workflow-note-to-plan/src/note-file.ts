import fs from "node:fs";
import path from "node:path";
import { NewNote, Note } from "./ports/Notes.js";

/**
 * A note, as the file an editor or a hook would leave.
 *
 * Written here rather than in the store adapter because `amy note` writes one
 * on a machine that will not mount: both callers share one format, and the
 * workflow that reads the directory is the one that owns its vocabulary.
 */
export function writeNoteFile(directory: string, note: NewNote, now: Date): Note {
  fs.mkdirSync(directory, { recursive: true });
  const written: Note = { ...note, id: freeNoteId(directory, now), writtenAt: now.toISOString() };
  fs.writeFileSync(path.join(directory, `${written.id}.md`), noteMarkdown(written), "utf-8");
  return written;
}

function noteMarkdown(note: Note): string {
  return ["---", `repo: ${note.repo}`, `source: ${note.source}`, `written: ${note.writtenAt}`, "---", "", note.text.trim(), ""].join("\n");
}

function freeNoteId(directory: string, now: Date): string {
  const stamp = `note-${now.toISOString().replace(/[:.]/g, "").replace("Z", "")}`;
  const taken = (id: string) => fs.existsSync(path.join(directory, `${id}.md`));
  if (!taken(stamp)) return stamp;
  for (let n = 2; ; n += 1) {
    if (!taken(`${stamp}-${n}`)) return `${stamp}-${n}`;
  }
}
