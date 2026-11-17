import { randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";

/**
 * A file replaced one way.
 *
 * Every writer stages beside the target under a name of its own and renames
 * it into place: readers see the old file or the new one, never half of
 * either, and two writers never stage under the same name. The name every
 * writer used to share, `<file>.tmp`, made one writer's rename remove what
 * another was about to rename, and the loser threw ENOENT.
 */

/** Writes `content` to `file` as one whole write, replacing what was there. */
export function writeAtomically(file: string, content: string | Uint8Array): void {
  const staged = stagedName(file);
  try {
    const handle = fs.openSync(staged, "wx", 0o600);
    try {
      fs.writeFileSync(handle, content);
      fs.fsyncSync(handle);
    } finally {
      fs.closeSync(handle);
    }
    fs.renameSync(staged, file);
  } catch (error) {
    fs.rmSync(staged, { force: true });
    throw error;
  }
}

/**
 * Creates `file` with `content` only while it does not exist, answering
 * whether this writer created it.
 *
 * The staged file is linked into place, and `link` is the one creation that
 * refuses another writer's file: two processes naming the same id cannot both
 * claim it, and neither overwrites the one that won. Written without `wx`
 * after an `exists` check, the check and the write are two steps with a gap
 * another process fits through.
 */
export function createExclusively(file: string, content: string | Uint8Array): boolean {
  const staged = stagedName(file);
  try {
    fs.writeFileSync(staged, content, { flag: "wx", mode: 0o600 });
    fs.linkSync(staged, file);
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "EEXIST") return false;
    throw error;
  } finally {
    fs.rmSync(staged, { force: true });
  }
}

/** A name only this writer can be holding, beside the file it will become. */
function stagedName(file: string): string {
  return `${file}.${randomUUID()}.tmp`;
}

/**
 * Writes `directory/<stem><extension>`, or the first free `-n` beside it,
 * answering the name it took.
 *
 * The id is chosen by the creation, not before it: a writer that picks a name
 * and then writes it lets the next writer pick the same one.
 */
export function writeUnderAFreeName(directory: string, stem: string, extension: string, body: (name: string) => string | Uint8Array): string {
  for (let n = 1; ; n += 1) {
    const name = n === 1 ? stem : `${stem}-${n}`;
    if (createExclusively(path.join(directory, `${name}${extension}`), body(name))) return name;
  }
}
