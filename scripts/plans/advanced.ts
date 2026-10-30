import path from "node:path";

/**
 * Which plans one change advances, read off the paths it touches.
 *
 * Derived rather than declared: every gate in the policy names the paths that
 * activate it and the plan whose criteria it proves, so a change that touches
 * a gate's paths is work on that gate's plan, whatever its title says. A plan
 * file the change edits directly is named too.
 */

export interface GateForPlan {
  readonly name: string;
  readonly plan: string;
  readonly activation: readonly string[];
}

export interface AdvancedPlan {
  readonly plan: string;
  /** The gates whose paths the change touched, or `edited` when the plan file itself changed. */
  readonly via: readonly string[];
}

export function plansAdvancedBy(changed: readonly string[], gates: readonly GateForPlan[]): AdvancedPlan[] {
  const found = new Map<string, Set<string>>();
  const add = (plan: string, via: string) => (found.get(plan) ?? found.set(plan, new Set()).get(plan)!).add(via);

  for (const gate of gates) {
    if (changed.some((file) => gate.activation.some((pattern) => path.matchesGlob(file, pattern)))) {
      add(gate.plan, gate.name);
    }
  }
  for (const file of changed) {
    if ((file.startsWith("plans/") || file.startsWith("docs/design/")) && file.endsWith(".md") && file !== "plans/next-steps.md") {
      add(file, "edited");
    }
  }

  return [...found].sort(([a], [b]) => a.localeCompare(b)).map(([plan, via]) => ({ plan, via: [...via].sort() }));
}

/** The change's plans as the markdown a pull request's checks page shows. */
export function describeAdvanced(advanced: readonly AdvancedPlan[]): string {
  if (advanced.length === 0) return "### Plans this change advances\n\nNone: it touches no gate's paths and no plan.\n";
  const rows = advanced.map(({ plan, via }) => `| [${plan}](${plan}) | ${via.map((name) => `\`${name}\``).join(", ")} |`);
  return ["### Plans this change advances", "", "| Plan | Through |", "| :-- | :-- |", ...rows, ""].join("\n");
}
