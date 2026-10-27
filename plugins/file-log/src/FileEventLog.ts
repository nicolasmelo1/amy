import fs from "node:fs";
import path from "node:path";
import { Event, EventLog, isEventKind, stampFrom, stampId } from "@amykit/core";

/**
 * The event log as one JSON Lines file per day.
 *
 * A line per event, appended and never rewritten. One file per day so the
 * directory stays readable and old days can be dropped without touching the
 * current one, and JSON Lines so a crash mid-write costs the last line rather
 * than the file.
 */
export class FileEventLog implements EventLog {
  constructor(
    private readonly directory: string,
    private readonly now: () => Date = () => new Date(),
    private readonly build: string = stampId(stampFrom({})),
  ) {
    fs.mkdirSync(this.directory, { recursive: true });
  }

  append(event: Event): void {
    // Stamped here so no caller has to remember, and only when absent so a
    // line copied in from elsewhere keeps saying who really wrote it.
    const stamped: Event = event.build ? event : { ...event, build: this.build };

    fs.appendFileSync(this.fileFor(new Date(stamped.at)), `${JSON.stringify(stamped)}\n`, "utf-8");
  }

  read(since?: Date): Event[] {
    const cutoff = since?.getTime() ?? 0;

    return this.days()
      .flatMap((file) => this.eventsIn(file))
      .filter((event) => new Date(event.at).getTime() >= cutoff)
      .sort((a, b) => a.at.localeCompare(b.at));
  }

  /**
   * Follows every day file from a byte offset, so a line is delivered once
   * its newline is on disk and never half. The directory is watched rather
   * than the day's file, which is how a new day's file is picked up without
   * resubscribing; a timer drains too, for filesystems that drop events.
   */
  watch(since: Date, onEvent: (event: Event) => void): () => void {
    const cutoff = since.getTime();
    const offsets = new Map<string, number>();
    let stopped = false;

    const deliver = (events: Event[]): void => {
      for (const event of events) {
        if (stopped) return;
        if (new Date(event.at).getTime() >= cutoff) onEvent(event);
      }
    };
    const drain = (): Event[] => this.days().flatMap((file) => this.tail(file, offsets));

    // What is already there arrives sorted, as `read` would hand it over.
    deliver(drain().sort((a, b) => a.at.localeCompare(b.at)));

    const follow = (): void => {
      if (!stopped) deliver(drain());
    };
    const watcher = fs.watch(this.directory, follow);
    const timer = setInterval(follow, WATCH_SAFETY_MS);

    return () => {
      stopped = true;
      watcher.close();
      clearInterval(timer);
    };
  }

  /** The day files, oldest first. The name sorts, so the list does too. */
  private days(): string[] {
    if (!fs.existsSync(this.directory)) return [];

    return fs
      .readdirSync(this.directory)
      .filter((name) => name.endsWith(".jsonl"))
      .sort()
      .map((name) => path.join(this.directory, name));
  }

  private eventsIn(file: string): Event[] {
    return parseLines(fs.readFileSync(file, "utf-8"));
  }

  /**
   * The complete lines appended to a file since its offset, which it moves.
   * Only the bytes past the offset are read, so a long day costs nothing to
   * follow.
   */
  private tail(file: string, offsets: Map<string, number>): Event[] {
    let fd: number;
    try {
      fd = fs.openSync(file, "r");
    } catch {
      // Removed between listing and reading: an old day dropped.
      offsets.delete(file);
      return [];
    }

    try {
      const size = fs.fstatSync(fd).size;
      // A file shorter than its offset was replaced, and is read again whole.
      const known = offsets.get(file) ?? 0;
      const from = known > size ? 0 : known;
      if (size === from) return [];

      const bytes = Buffer.alloc(size - from);
      const read = fs.readSync(fd, bytes, 0, bytes.length, from);
      const end = bytes.subarray(0, read).lastIndexOf(0x0a) + 1;
      if (end === 0) return [];

      offsets.set(file, from + end);
      return parseLines(bytes.subarray(0, end).toString("utf-8"));
    } finally {
      fs.closeSync(fd);
    }
  }

  private fileFor(at: Date): string {
    const day = Number.isNaN(at.getTime()) ? this.now() : at;
    return path.join(this.directory, `${day.toISOString().slice(0, 10)}.jsonl`);
  }
}

/** How often a watch drains even when nothing told it to. */
const WATCH_SAFETY_MS = 500;

function parseLines(text: string): Event[] {
  return text
    .split("\n")
    .filter((line) => line.trim() !== "")
    .flatMap((line) => {
      try {
        const event = JSON.parse(line) as Event;
        // Filtered on the way out and never on the way in, so a newer
        // build's kinds are dropped from this build's aggregates rather
        // than corrupting them. An old binary reading a new log is quiet
        // about the lines it skips, which is the price of that.
        return isEventKind(event.kind) ? [event] : [];
      } catch {
        // A line lost to a crash mid-append costs that line, not the run.
        return [];
      }
    });
}
