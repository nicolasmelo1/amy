import fs from "node:fs";
import path from "node:path";
import { NewNote, Note, Notes } from "@amy/workflow-note-to-plan";

/** The keys the header understands. Anything else is left in the body. */
const REPO = "repo";
const SOURCE = "source";
const WRITTEN = "written";

export interface FileNotesConfig {
  /**
   * What a note is about when it does not say.
   *
   * A note dropped in by hand is usually about the machine that hit the
   * friction, and asking for the repository every time is the kind of
   * ceremony that stops people writing notes at all.
   */
  defaultRepo: string;
}

/**
 * Notes as a directory of markdown files.
 *
 * Markdown with a three-line header rather than JSON, because the whole point
 * of the watched directory is that a note can be written by an editor, by a
 * hook, or by a shell one-liner. A format only a program can produce would
 * have quietly made this a programmatic interface with a directory in front
 * of it.
 *
 * The file name is the id. That makes a note written by hand indistinguishable
 * from one this machine wrote, which is deliberate: both are friction, and
 * neither is more real than the other.
 */
export class FileNotes implements Notes {
  constructor(
    private readonly root: string,
    private readonly config: FileNotesConfig,
  ) {
    fs.mkdirSync(this.root, { recursive: true });
  }

  write(note: NewNote, now: Date): Note {
    const written = { ...note, id: this.freeId(now), writtenAt: now.toISOString() };

    fs.writeFileSync(
      this.file(written.id),
      [
        `---`,
        `${REPO}: ${written.repo}`,
        `${SOURCE}: ${written.source}`,
        `${WRITTEN}: ${written.writtenAt}`,
        `---`,
        ``,
        written.text.trim(),
        ``,
      ].join("\n"),
      "utf-8",
    );

    return written;
  }

  all(): Note[] {
    return fs
      .readdirSync(this.root)
      .filter((name) => name.endsWith(".md"))
      .map((name) => this.read(name.slice(0, -3)))
      .filter((note): note is Note => note !== null)
      .sort((a, b) => a.id.localeCompare(b.id));
  }

  get(id: string): Note | null {
    return this.read(id);
  }

  private read(id: string): Note | null {
    const file = this.file(id);
    if (!fs.existsSync(file)) return null;

    const { header, body } = split(fs.readFileSync(file, "utf-8"));

    return {
      id,
      repo: header[REPO] ?? this.config.defaultRepo,
      text: body.trim(),
      source: header[SOURCE] ?? "somebody at a keyboard",
      // A note written by hand carries no timestamp, and the moment the file
      // appeared is the honest answer rather than the moment it was read.
      writtenAt: header[WRITTEN] ?? fs.statSync(file).mtime.toISOString(),
    };
  }

  /** A sortable id, and a suffix only when two notes land in one millisecond. */
  private freeId(now: Date): string {
    const stamp = `note-${now.toISOString().replace(/[:.]/g, "").replace("Z", "")}`;

    if (!fs.existsSync(this.file(stamp))) return stamp;
    for (let n = 2; ; n += 1) {
      const candidate = `${stamp}-${n}`;
      if (!fs.existsSync(this.file(candidate))) return candidate;
    }
  }

  private file(id: string): string {
    return path.join(this.root, `${id}.md`);
  }
}

/** The header, and everything after it. A file with no header is all body. */
function split(contents: string): { header: Record<string, string>; body: string } {
  const lines = contents.split("\n");
  if (lines[0]?.trim() !== "---") return { header: {}, body: contents };

  const end = lines.indexOf("---", 1);
  if (end === -1) return { header: {}, body: contents };

  const header: Record<string, string> = {};
  for (const line of lines.slice(1, end)) {
    const colon = line.indexOf(":");
    if (colon === -1) continue;
    header[line.slice(0, colon).trim()] = line.slice(colon + 1).trim();
  }

  return { header, body: lines.slice(end + 1).join("\n") };
}
