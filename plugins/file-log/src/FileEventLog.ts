import fs from "node:fs";
import path from "node:path";
import { Event, EventLog, buildStamp, isEventKind, stampId } from "@amy/core";

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
    private readonly build: string = stampId(buildStamp()),
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
    return fs
      .readFileSync(file, "utf-8")
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

  private fileFor(at: Date): string {
    const day = Number.isNaN(at.getTime()) ? this.now() : at;
    return path.join(this.directory, `${day.toISOString().slice(0, 10)}.jsonl`);
  }
}
