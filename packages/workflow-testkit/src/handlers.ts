import { actionsOf } from "@amykit/core";
import { Finding } from "./finding.js";
import { AnyWorkflow, Walk } from "./walk.js";

/**
 * Every action the workflow declares has something behind it, and every
 * action it plans was declared.
 *
 * The walk already calls each action a plan carries. This is the half a walk
 * cannot see: an action declared for a step no world reached — the last step
 * of the happy path, say — is exactly the one that throws in production.
 */
export function handlers(workflow: AnyWorkflow, walks: readonly Walk[]): Finding[] {
  const built = walks.filter((walk) => walk.runtime);
  const declared = new Set(workflow.usesActions);
  const findings: Finding[] = [];

  // Every world builds its own runtime, and each is asked: a world whose
  // runtime drops a handler, and never happens to plan that action, would
  // otherwise pass on the strength of another world's.
  for (const name of workflow.usesActions) {
    const without = built.filter((walk) => typeof walk.runtime!.handlers()[name] !== "function");
    if (without.length === 0) continue;
    const whose = without.length === built.length ? "the runtime" : `the runtime in ${without.map((walk) => walk.world).join(", ")}`;
    findings.push({ property: "handlers", message: `\`${name}\` is declared in usesActions, and ${whose} has no handler for it` });
  }

  for (const walk of walks) {
    for (const look of walk.looks) {
      for (const action of actionsOf(look.plan)) {
        if (declared.has(action.type)) continue;
        findings.push({
          property: "handlers",
          message: `\`${look.record.state}\` plans \`${action.type}\`, which usesActions does not declare`,
        });
      }
    }
  }
  return findings;
}
