import { Finding } from "./finding.js";
import { AnyWorkflow, Walk } from "./walk.js";

/**
 * Every declared state is reached by some world, and every state that is not
 * terminal is left by some world.
 *
 * Reached means the machine got there itself: from `newRecord`, or by moving.
 * A world that *starts* a record in a state proves nothing about whether the
 * machine can arrive in it, so it does not count.
 */
export function reachability(workflow: AnyWorkflow, walks: readonly Walk[]): Finding[] {
  const seen = tally(workflow, walks);
  const findings: Finding[] = [...declarationProblems(workflow), ...seen.findings];

  for (const state of workflow.states) {
    if (!seen.reached.has(state)) {
      findings.push({ property: "reachability", message: `\`${state}\` is declared, and no world reaches it` });
    } else if (!workflow.terminalStates.includes(state) && seen.planned.has(state) && !seen.left.has(state)) {
      findings.push({
        property: "reachability",
        message: `nothing leaves \`${state}\`: every world that reaches it leaves the work there`,
      });
    }
  }
  return findings;
}

interface Tally {
  readonly reached: Set<string>;
  readonly left: Set<string>;
  readonly planned: Set<string>;
  readonly findings: Finding[];
}

/** Which states the walks arrived in, planned in and moved out of, and which settled where they should not have. */
function tally(workflow: AnyWorkflow, walks: readonly Walk[]): Tally {
  const seen: Tally = { reached: new Set(), left: new Set(), planned: new Set(), findings: [] };
  if (walks.some((walk) => walk.fromTheStart)) seen.reached.add(workflow.initialState);

  for (const look of walks.flatMap((walk) => walk.looks)) {
    const state = look.record.state;
    seen.planned.add(state);
    if (look.plan.kind === "advance") {
      seen.reached.add(look.plan.to);
      if (look.plan.to !== state) seen.left.add(state);
    }
    const terminal = workflow.terminalStates.includes(state);
    if (look.plan.kind === "settled" && !terminal) {
      seen.findings.push({ property: "reachability", message: `\`${state}\` settles, and is not declared terminal` });
    } else if (look.plan.kind !== "settled" && terminal) {
      seen.findings.push({ property: "reachability", message: `\`${state}\` is terminal, and planning it does not settle` });
    }
  }
  return seen;
}

function declarationProblems(workflow: AnyWorkflow): Finding[] {
  const named: [string, readonly string[]][] = [
    ["initialState", [workflow.initialState]],
    ["terminalStates", workflow.terminalStates],
    ["waitingStates", workflow.waitingStates],
  ];

  return named.flatMap(([field, names]) =>
    names
      .filter((name) => !workflow.states.includes(name))
      .map((name): Finding => ({ property: "reachability", message: `\`${name}\` is named in ${field}, and is not one of the states` })),
  );
}
