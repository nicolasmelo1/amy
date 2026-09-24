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
  const runtime = walks.find((walk) => walk.runtime)?.runtime;
  if (!runtime) return [];

  const handled = runtime.handlers();
  const declared = new Set(workflow.usesActions);
  const findings: Finding[] = workflow.usesActions
    .filter((name) => typeof handled[name] !== "function")
    .map((name) => ({
      property: "handlers",
      message: `\`${name}\` is declared in usesActions, and the runtime has no handler for it`,
    }));

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
