import fs from "node:fs";
import path from "node:path";
import type { NewTask, Task, Tasks } from "@amy/workflow-errand";

/** The keys the header understands. Anything else is left in the body. */
const REPO = "repo";
const SOURCE = "source";
const ADDED = "added";

export interface FileTasksConfig {
  /**
   * What a task is about when it does not say.
   *
   * Somebody saying a thing in passing is usually saying it about what they
   * are already working on, and asking for the repository every time is the
   * ceremony that stops people saying it at all.
   */
  defaultRepo: string;
}

/**
 * Tasks as a directory of markdown files.
 *
 * The same shape the notes have, and for the same reason: a task has to be
 * writable by `amy btw`, by an editor, or by a shell one-liner. A format only
 * a program can produce would have made this a programmatic interface with a
 * directory in front of it.
 *
 * A separate directory from the notes, because they are opposites. A note is
 * friction that happened; a task is work somebody wants done. One workflow
 * reads each, and mixing them would make both of them guess.
 */
export class FileTasks implements Tasks {
  constructor(
    private readonly root: string,
    private readonly config: FileTasksConfig,
  ) {
    fs.mkdirSync(this.root, { recursive: true });
  }

  add(task: NewTask, now: Date): Task {
    const written = { ...task, id: this.freeId(now), addedAt: now.toISOString() };

    fs.writeFileSync(
      this.file(written.id),
      [
        `---`,
        `${REPO}: ${written.repo}`,
        `${SOURCE}: ${written.source}`,
        `${ADDED}: ${written.addedAt}`,
        `---`,
        ``,
        written.text.trim(),
        ``,
      ].join("\n"),
      "utf-8",
    );

    return written;
  }

  all(): Task[] {
    return fs
      .readdirSync(this.root)
      .filter((name) => name.endsWith(".md"))
      .map((name) => this.read(name.slice(0, -3)))
      .filter((task): task is Task => task !== null)
      .sort((a, b) => a.id.localeCompare(b.id));
  }

  get(id: string): Task | null {
    return this.read(id);
  }

  private read(id: string): Task | null {
    const file = this.file(id);
    if (!fs.existsSync(file)) return null;

    const { header, body } = split(fs.readFileSync(file, "utf-8"));

    return {
      id,
      repo: header[REPO] ?? this.config.defaultRepo,
      text: body.trim(),
      source: header[SOURCE] ?? "somebody at a keyboard",
      // A task written by hand carries no timestamp, and the moment the file
      // appeared is the honest answer rather than the moment it was read.
      addedAt: header[ADDED] ?? fs.statSync(file).mtime.toISOString(),
    };
  }

  /** A sortable id, and a suffix only when two land in one millisecond. */
  private freeId(now: Date): string {
    const stamp = `task-${now.toISOString().replace(/[:.]/g, "").replace("Z", "")}`;

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
