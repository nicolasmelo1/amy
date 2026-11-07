/** Everything the notes domain can fail with. */
export class NoteNotFound extends Error {
  constructor(readonly id: string) {
    super(`no note \`${id}\``);
    this.name = "NoteNotFound";
  }
}
