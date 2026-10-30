import fs from "node:fs";
import path from "node:path";
import { StopSwitch } from "./ports/StopSwitch.js";

/**
 * A stop request is the presence of a file.
 *
 * A file survives a crash, can be written by another process, and can be
 * checked without asking anything to still be running, which are the three
 * things a kill switch needs.
 */
export class FileStopSwitch implements StopSwitch {
  constructor(private readonly file: string) {}

  isRequested(): boolean {
    return fs.existsSync(this.file);
  }

  reason(): string | null {
    if (!this.isRequested()) return null;
    return fs.readFileSync(this.file, "utf-8").trim() || "no reason given";
  }

  request(reason: string): void {
    fs.mkdirSync(path.dirname(this.file), { recursive: true });
    fs.writeFileSync(this.file, `${reason}\n`, "utf-8");
  }

  clear(): void {
    fs.rmSync(this.file, { force: true });
  }

  watch(onRequested: (reason: string) => void): () => void {
    if (this.isRequested()) {
      onRequested(this.reason() ?? "no reason given");
      return () => {};
    }

    const directory = path.dirname(this.file);
    fs.mkdirSync(directory, { recursive: true });

    // Watching the directory rather than the file, because the file does not
    // exist yet and that is the event worth hearing about. The poll is the
    // fallback for a dropped/coalesced filesystem event, which must not leave
    // a running machine blind to its stop request.
    // Once per request, not once per watcher: a cleared file re-arms it, so a
    // pause after a resume still ends the children of a long `amy run`.
    let closed = false;
    let delivered = false;
    const deliver = () => {
      if (closed) return;
      if (!this.isRequested()) {
        delivered = false;
        return;
      }
      if (delivered) return;
      delivered = true;
      onRequested(this.reason() ?? "no reason given");
    };
    const watcher = fs.watch(directory, (_event, name) => {
      if (name === path.basename(this.file)) deliver();
    });
    const poll = setInterval(deliver, 50);

    return () => {
      closed = true;
      clearInterval(poll);
      watcher.close();
    };
  }
}
