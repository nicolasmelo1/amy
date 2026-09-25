import { unrunnable } from "@amykit/core";
import { Finding } from "./finding.js";
import { AnyWorkflow, Walk } from "./walk.js";

/**
 * Every action the runtime declares has something behind it that could run.
 *
 * The walk already calls each action a plan carries, and refuses one the
 * runtime never declared. This is the half a walk cannot see: an action
 * declared for a step no world reached — the last step of the happy path,
 * say — is exactly the one that throws in production.
 */
export function handlers(_workflow: AnyWorkflow, walks: readonly Walk[]): Finding[] {
  const built = walks.filter((walk) => walk.runtime);
  const findings: Finding[] = [];
  const problems = new Map<string, { problem: string; worlds: string[] }>();

  // Every world builds its own runtime, and each is asked: a world whose
  // runtime drops an implementation, and never happens to plan that action,
  // would otherwise pass on the strength of another world's.
  for (const walk of built) {
    for (const [name, implementation] of Object.entries(walk.runtime!.actions)) {
      const problem = unrunnable(name, implementation, walk.port);
      if (!problem) continue;
      const seen = problems.get(problem) ?? { problem, worlds: [] };
      seen.worlds.push(walk.world);
      problems.set(problem, seen);
    }
  }

  for (const { problem, worlds } of problems.values()) {
    const whose = worlds.length === built.length ? "" : ` (in ${worlds.join(", ")})`;
    findings.push({ property: "handlers", message: `${problem}${whose}` });
  }
  return findings;
}
