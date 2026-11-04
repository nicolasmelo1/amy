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
  /** Each plan's parsed YAML declaration, keyed by its path under plans/. */
  readonly declarations?: Readonly<Record<string, unknown>>;
}

function entries(declaration: unknown, key: string): unknown[] | undefined {
  if (typeof declaration !== "object" || declaration === null) return undefined;
  const value: unknown = (declaration as Record<string, unknown>)[key];
  return Array.isArray(value) && value.length > 0 ? value : undefined;
}

function says(entry: unknown, key: string): boolean {
  if (typeof entry !== "object" || entry === null) return false;
  const value: unknown = (entry as Record<string, unknown>)[key];
  return typeof value === "string" && value.trim() !== "";
}

/**
 * A plan names the failures it does not hold against and answers what it
 * crosses before work starts, so its review has a scope: without them a
 * reviewer finds the failure model one round at a time.
 */
function checkDeclaration(plan: string, declaration: unknown): string[] {
  const problems: string[] = [];
  if (entries(declaration, "crosses") === undefined) {
    problems.push(`${plan} answers no mechanism under crosses`);
  }
  const guarantee = entries(declaration, "guarantee");
  if (guarantee === undefined) {
    problems.push(`${plan} declares no guarantee, so its review has no failure model`);
  } else {
    guarantee.forEach((entry, index) => {
      if (!says(entry, "holds") || !says(entry, "not_against")) {
        problems.push(`${plan} guarantee ${index + 1} needs both holds and not_against`);
      }
    });
  }
  return problems;
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
    if (input.declarations !== undefined) {
      problems.push(...checkDeclaration(plan, input.declarations[plan]));
    }
  }

  return problems;
}
