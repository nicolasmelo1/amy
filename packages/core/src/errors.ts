/** A diagram amy will not read, naming the file and the line that says why. */
export class DiagramError extends Error {
  constructor(
    readonly line: number,
    readonly reason: string,
    source: string,
  ) {
    super(line > 0 ? `${source} line ${line}: ${reason}` : `${source}: ${reason}`);
    this.name = "DiagramError";
  }
}
