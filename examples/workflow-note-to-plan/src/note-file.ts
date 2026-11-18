import fs from "node:fs";
import { writeUnderAFreeName } from "@amykit/core";
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
  const writtenAt = now.toISOString();
  const stamp = `note-${writtenAt.replace(/[:.]/g, "").replace("Z", "")}`;
  // Created, never checked-then-written: two writers at one instant both find
  // the first name free, and the loser would overwrite the winner's note.
  const id = writeUnderAFreeName(directory, stamp, ".md", (name) => noteMarkdown({ ...note, id: name, writtenAt }));
  return { ...note, id, writtenAt };
}

function noteMarkdown(note: Note): string {
  return ["---", `repo: ${note.repo}`, `source: ${note.source}`, `written: ${note.writtenAt}`, "---", "", note.text.trim(), ""].join("\n");
}
