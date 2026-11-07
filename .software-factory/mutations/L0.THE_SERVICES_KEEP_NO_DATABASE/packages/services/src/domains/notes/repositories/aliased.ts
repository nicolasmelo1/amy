import type { Store as NoteStore, WorkRecord } from "@amykit/core";

/** Holds the store under another name, and forgets to await it. */
export class AliasedNotes {
  constructor(private readonly held: NoteStore<WorkRecord>) {}

  async keep(record: WorkRecord): Promise<void> {
    this.held.save(record);
  }
}
