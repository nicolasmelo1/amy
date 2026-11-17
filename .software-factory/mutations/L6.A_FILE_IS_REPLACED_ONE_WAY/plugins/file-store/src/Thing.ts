import fs from "node:fs";

/** A write staged at the name every writer shares: the mutation this fixture proves. */
export function save(file: string, body: string): void {
  fs.writeFileSync(`${file}.tmp`, body, "utf-8");
  fs.renameSync(`${file}.tmp`, file);
}
