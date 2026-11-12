// The proving plugin as 0.7.1 shipped it: a private copy of the core's id shape.

/** The unit a run proves: the work the proving phase was called for, its brief's id. */
export function unitOf(record: { readonly id: string }): string {
  return record.id.split("/")[0]!;
}
