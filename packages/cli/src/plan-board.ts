/** The repository's plan board is a small, pure consistency check. */
interface PlanGate {
  readonly name: string;
  readonly plan: string;
  readonly requiredAssertions: readonly string[];
}

export interface PlanBoardInput {
  readonly gates: readonly PlanGate[];
  /** Paths to markdown files currently present under plans/. */
  readonly planFiles: readonly string[];
  /** Paths linked by the active and parked tables in next-steps.md. */
  readonly listedPlans: readonly string[];
  /** Contents of design notes, keyed by their repository-relative path. */
  readonly designNotes: Readonly<Record<string, string>>;
}

/**
 * Keeps delivered work out of the execution board without letting its proof
 * disappear with the plan that introduced it.
 */
export function checkPlanBoard(input: PlanBoardInput): string[] {
  const problems: string[] = [];
  const listed = new Set(input.listedPlans);

  for (const gate of input.gates) {
    if (gate.plan.startsWith("plans/")) {
      problems.push(`gate ${gate.name} still points at ${gate.plan}`);
      continue;
    }

    const note = input.designNotes[gate.plan];
    if (note === undefined) {
      problems.push(`gate ${gate.name} points at missing design note ${gate.plan}`);
      continue;
    }

    for (const assertion of gate.requiredAssertions) {
      if (!note.includes(assertion)) {
        problems.push(`gate ${gate.name} requires ${assertion}, but ${gate.plan} does not name it`);
      }
    }
  }

  for (const plan of input.planFiles) {
    if (plan === "plans/next-steps.md") continue;
    if (!listed.has(plan)) {
      problems.push(`${plan} is not listed in plans/next-steps.md`);
    }
  }

  return problems;
}
