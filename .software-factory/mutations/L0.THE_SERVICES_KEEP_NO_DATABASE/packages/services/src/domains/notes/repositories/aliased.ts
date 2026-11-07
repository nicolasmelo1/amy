import type { OperationContext, Store as NoteStore, WorkRecord } from "@amykit/core";

/** Holds the store under another name, and forgets to await it. */
export class AliasedNotes {
  constructor(private readonly held: NoteStore<WorkRecord>) {}

  async keep(record: WorkRecord): Promise<void> {
    this.held.save(record);
  }

  static async keepFrom(context: OperationContext, record: WorkRecord): Promise<void> {
    const local: NoteStore<WorkRecord> = context.port("store") as NoteStore<WorkRecord>;
    local.save(record);
  }
}
