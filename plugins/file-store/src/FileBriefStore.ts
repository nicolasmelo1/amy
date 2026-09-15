import fs from "node:fs";
import path from "node:path";
import { BriefId, BriefQuestion, BriefRecord, BriefStore } from "@amykit/core";

/**
 * Briefs on disk, one JSON file per brief under a directory the host chose.
 *
 * The layout is this adapter's own and nobody else's business: the CLI
 * resolves the port and reads the brief through it, so no caller ever needs
 * to know where the files live. A write goes to a sibling and is renamed
 * into place, so a crash mid-write cannot leave a half-written brief that
 * parses as something it is not.
 */
export class FileBriefStore implements BriefStore {
  constructor(private readonly root: string) {
    fs.mkdirSync(this.root, { recursive: true });
  }

  async get(id: BriefId): Promise<BriefRecord | null> {
    const file = this.file(id);
    if (!fs.existsSync(file)) return null;
    return JSON.parse(fs.readFileSync(file, "utf-8")) as BriefRecord;
  }

  async write(input: {
    id: BriefId;
    sections: { name: string; body: string }[];
    explains: string[];
    at: string;
  }): Promise<BriefRecord> {
    const existing = await this.get(input.id);

    const record: BriefRecord = {
      id: input.id,
      sections: input.sections,
      questions: existing?.questions ?? [],
      explains: input.explains,
      createdAt: existing?.createdAt ?? input.at,
      updatedAt: input.at,
      revision: (existing?.revision ?? 0) + 1,
    };

    this.save(record);
    return record;
  }

  async appendQuestion(input: {
    id: BriefId;
    question: BriefQuestion;
    at: string;
  }): Promise<BriefRecord> {
    const existing = await this.get(input.id);
    if (!existing) {
      throw new Error(`there is no brief \`${input.id}\` to append a question to`);
    }

    const record: BriefRecord = {
      ...existing,
      questions: [...existing.questions, input.question],
      updatedAt: input.at,
    };

    this.save(record);
    return record;
  }

  async retired(
    explainsAreTerminal: (workId: string) => boolean,
    retentionCutoffMs: number,
    now: Date,
  ): Promise<BriefId[]> {
    const retired: BriefId[] = [];

    for (const id of this.ids()) {
      const record = await this.get(id);
      if (!record) continue;

      // One open child retains the whole brief, checked before the age, so
      // a brief whose work just finished still lives until it is old.
      if (!record.explains.every(explainsAreTerminal)) continue;

      if (now.getTime() - new Date(record.updatedAt).getTime() < retentionCutoffMs) continue;

      retired.push(id);
    }

    return retired;
  }

  async remove(id: BriefId): Promise<void> {
    const file = this.file(id);
    if (fs.existsSync(file)) fs.rmSync(file);
  }

  /** Written to a sibling and renamed, so a brief is never half-written. */
  private save(record: BriefRecord): void {
    const file = this.file(record.id);
    const temporary = `${file}.tmp`;
    fs.writeFileSync(temporary, `${JSON.stringify(record, null, 2)}\n`, "utf-8");
    fs.renameSync(temporary, file);
  }

  private ids(): BriefId[] {
    return fs
      .readdirSync(this.root)
      .filter((name) => name.endsWith(".json"))
      .map((name) => name.slice(0, -".json".length));
  }

  private file(id: BriefId): string {
    // A brief id with a path separator in it would write outside the store,
    // so it is refused rather than escaped.
    if (id.includes("/") || id.includes(path.sep)) {
      throw new Error(`a brief id cannot contain a path separator: \`${id}\``);
    }
    return path.join(this.root, `${id}.json`);
  }
}