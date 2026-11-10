import { createHash, randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";

/** One side of one exchange in a conversation. */
export interface ChatTurn {
  at: string;
  who: "person" | "amy";
  text: string;
}

/** A conversation as it is kept: the place it is in, which one there it is, and every turn. */
export interface Kept {
  place: string;
  /** Which conversation in the place: a chat without threads starts another on `/new`. */
  generation: number;
  /** The harness `/harness` chose; unset, the default answers. */
  harness?: string;
  turns: ChatTurn[];
}

/**
 * Conversations, one file each, under the state directory (S21).
 *
 * Each turn is sent whole, so the harness answering a turn needs nothing of
 * its own memory, and `/harness` can switch it mid-conversation. A thread is
 * one conversation; a chat without threads is one until `/new` (S14).
 */
export class Transcripts {
  constructor(private readonly directory: string) {}

  /** The conversation a place is in now, empty when nothing was said there yet. */
  current(place: string): Kept {
    const generation = this.generationOf(place);
    return readJson<Kept>(this.file(place, generation)) ?? { place, generation, turns: [] };
  }

  /** Starts another conversation in a place, which `current` answers from now on. */
  startAnother(place: string): Kept {
    const generation = this.generationOf(place) + 1;
    writeJson(path.join(this.directory, "places", `${keyOf(place)}.json`), { place, generation });
    return { place, generation, turns: [] };
  }

  save(kept: Kept): void {
    writeJson(this.file(kept.place, kept.generation), kept);
  }

  private generationOf(place: string): number {
    return readJson<{ generation: number }>(path.join(this.directory, "places", `${keyOf(place)}.json`))?.generation ?? 0;
  }

  private file(place: string, generation: number): string {
    return path.join(this.directory, "conversations", `${keyOf(place)}-${generation}.json`);
  }
}

/** A place as one file name on every system. */
function keyOf(place: string): string {
  return createHash("sha256").update(place).digest("hex").slice(0, 32);
}

function readJson<T>(file: string): T | undefined {
  try {
    return JSON.parse(fs.readFileSync(file, "utf-8")) as T;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined;
    throw error;
  }
}

/** Written aside and renamed, so a reader never sees half a conversation. */
function writeJson(file: string, value: unknown): void {
  fs.mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 });
  const partial = path.join(path.dirname(file), `.${randomUUID()}.partial`);
  fs.writeFileSync(partial, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600 });
  fs.renameSync(partial, file);
}
