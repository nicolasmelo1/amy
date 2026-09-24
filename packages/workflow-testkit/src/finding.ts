/**
 * The machine-shaped half of a workflow, one property at a time.
 *
 * None of them is domain knowledge, which is why one kit can check every
 * workflow anybody will write. `walk` is the precondition for the other five:
 * a world the runtime cannot even be driven through proves nothing else.
 */
export const PROPERTIES = {
  walk: "every world can be walked",
  reachability: "every state is reachable, and every state has a way out",
  handlers: "every action it plans has a handler that survives being called",
  ceilings: "a wait does not spend the ceiling that decides when to give up",
  folds: "an empty collection concludes nothing",
  escalation: "giving up has a way out, and only one",
} as const;

export type Property = keyof typeof PROPERTIES;

export interface Finding {
  readonly property: Property;
  /** Names the state, the action or the world, whichever the author has to go and look at. */
  readonly message: string;
}

/** The same finding from two worlds is one finding. */
export function distinct(findings: readonly Finding[]): Finding[] {
  const seen = new Set<string>();
  return findings.filter((finding) => {
    const key = `${finding.property}\u0000${finding.message}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function message(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
