import { DrawnTransition, cameFrom, connects } from "@amykit/core";
import { Finding } from "./finding.js";
import { AnyWorkflow, Walk } from "./walk.js";

/**
 * Every move a world made is one the diagram connects, and — when asked —
 * every arrow it draws is a move some world made.
 *
 * A workflow with no diagram has nothing to be held to, and passes. A move
 * out of a `returns` state is connected when it goes back to where the record
 * came from, and any state that is not terminal may move to an `anywhere`
 * one, because that is what those classes say.
 */
export function transitions(workflow: AnyWorkflow, walks: readonly Walk[], everyEdge: boolean): Finding[] {
  const diagram = workflow.diagram;
  if (!diagram) return [];

  const findings: Finding[] = [];
  for (const walk of walks) {
    for (const { record, plan } of walk.looks) {
      if (plan.kind !== "advance") continue;
      if (connects(diagram, record.state, plan.to, cameFrom(record.history, record.state))) continue;
      findings.push({
        property: "transitions",
        message: `${walk.world}: \`${record.state}\` moves to \`${plan.to}\`, and the diagram draws no arrow from \`${record.state}\` to \`${plan.to}\``,
      });
    }
  }
  if (!everyEdge) return findings;

  return [
    ...findings,
    ...drawnNotWalked(workflow, walks).map((edge): Finding => ({
      property: "transitions",
      message: `\`${edge.from}\` → \`${edge.to}\` is drawn, and no world walks it`,
    })),
  ];
}

/** The arrows the diagram draws that no walk took: for a workflow still being written, the to-do list. */
function drawnNotWalked(workflow: AnyWorkflow, walks: readonly Walk[]): DrawnTransition[] {
  const walked = new Set(
    walks.flatMap((walk) => walk.looks)
      .filter((look) => look.plan.kind === "advance")
      .map((look) => `${look.record.state}\u0000${(look.plan as { to: string }).to}`),
  );
  const seen = new Set<string>();
  return (workflow.diagram?.transitions ?? []).filter((edge) => {
    const key = `${edge.from}\u0000${edge.to}`;
    if (walked.has(key) || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
