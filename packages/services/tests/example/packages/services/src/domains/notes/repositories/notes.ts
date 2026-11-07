import type { OperationContext, Store, WorkRecord } from "@amykit/core";

export interface NoteRecord extends WorkRecord {
  readonly text: string;
}

/** The notes domain's one door to the store. */
export class NotesRepository {
  constructor(private readonly store: Store<NoteRecord>) {}

  static from(context: OperationContext): NotesRepository {
    return new NotesRepository(context.port("store") as Store<NoteRecord>);
  }

  async read(id: string): Promise<NoteRecord | null> {
    return await this.store.load(id);
  }
}
