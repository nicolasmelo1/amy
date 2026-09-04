import fs from "node:fs";
import path from "node:path";
import { Store } from "@amy/core";
import { WorkRecord } from "@amy/core";

/** One file per ticket, so a record can be read and edited by hand. */
export class FileStore<R extends WorkRecord = WorkRecord> implements Store<R> {
  constructor(private readonly root: string) {
    fs.mkdirSync(this.root, { recursive: true });
  }

  load(workId: string): R | null {
    const file = this.file(workId);
    if (!fs.existsSync(file)) return null;
    return JSON.parse(fs.readFileSync(file, "utf-8")) as R;
  }

  save(record: R): void {
    // Written to a sibling and renamed, so a crash mid-write cannot leave a
    // half-written record that fails to parse on the next look.
    const file = this.file(record.id);
    const temporary = `${file}.tmp`;
    fs.writeFileSync(temporary, JSON.stringify(record, null, 2), "utf-8");
    fs.renameSync(temporary, file);
  }

  all(): R[] {
    return fs
      .readdirSync(this.root)
      .filter((name) => name.endsWith(".json"))
      .map((name) => JSON.parse(fs.readFileSync(path.join(this.root, name), "utf-8")) as R);
  }

  private file(workId: string): string {
    return path.join(this.root, `${workId}.json`);
  }
}
