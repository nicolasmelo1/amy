import { actionsOf } from "@amykit/core";
import { Finding } from "./finding.js";
import { AnyWorkflow, Walk } from "./walk.js";

/** The core's action for handing work to a person because the machine gave up. */
const ESCALATE = "escalate";

/**
 * A state the machine gives up into can be got out of, and only by something
 * that happened after it gave up.
 *
 * Two shapes. A giving-up state declared terminal is one nothing can ever get
 * work out of again, however the person answers. And a giving-up state left
 * on the very next look, before the world has moved at all, was left on
 * something that was already there — an answer from the day before, read as
 * the answer to a question asked a second ago — which is the escalation that
 * resumed, escalated and announced on a thirty-second cycle.
 *
 * Whether some world gets the work out at all is reachability's question,
 * asked of every state; this only asks what is particular to giving up.
 */
export function escalation(workflow: AnyWorkflow, walks: readonly Walk[], givesUp: readonly string[]): Finding[] {
  const states = givingUpStates(walks, givesUp);
  const findings: Finding[] = [];

  for (const state of states) {
    if (!workflow.states.includes(state)) {
      findings.push({ property: "escalation", message: `\`${state}\` is named in givesUp, and is not one of the states` });
    } else if (workflow.terminalStates.includes(state)) {
      findings.push({
        property: "escalation",
        message: `\`${state}\` is where the machine gives up, and it is terminal: nothing the person does can get the work out of it`,
      });
    }
  }

  for (const walk of walks) {
    const early = leftBeforeTheWorldMoved(walk, states);
    if (early) findings.push(early);
  }
  return findings;
}

/**
 * The first time this walk gave up and then left again with nothing having
 * happened in between. Only a giving-up the walk itself saw counts: a world
 * that starts in one may well have been answered long ago.
 */
function leftBeforeTheWorldMoved(walk: Walk, states: ReadonlySet<string>): Finding | undefined {
  let gaveUpInto: string | undefined;
  for (const look of walk.looks) {
    const plan = look.plan;
    if (plan.kind !== "advance") continue;
    if (look.record.state === gaveUpInto && !look.worldMoved) {
      return {
        property: "escalation",
        message:
          `${walk.world}: \`${gaveUpInto}\` moved to \`${plan.to}\` straight after giving up, before the world moved. ` +
          `It resumed on something that was already there, not on an answer`,
      };
    }
    gaveUpInto = states.has(plan.to) ? plan.to : undefined;
  }
  return undefined;
}

function givingUpStates(walks: readonly Walk[], givesUp: readonly string[]): Set<string> {
  const states = new Set(givesUp);
  for (const look of walks.flatMap((walk) => walk.looks)) {
    if (look.plan.kind === "advance" && actionsOf(look.plan).some((action) => action.type === ESCALATE)) {
      states.add(look.plan.to);
    }
  }
  return states;
}
