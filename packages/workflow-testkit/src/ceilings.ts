import { Plan, WorkRecord, applyPlan } from "@amykit/core";
import { Finding } from "./finding.js";
import { describe, replay, sameMove } from "./plans.js";
import { AnyWorkflow, Look, Walk } from "./walk.js";

/**
 * Waiting is not trying.
 *
 * The core counts every look inside a state, waits included, because that is
 * what bounds a retry loop. A state that reads the same count to decide when
 * to give up has to be sure the looks it is counting were tries. Two ways it
 * goes wrong, and one probe each:
 *
 * - a declared waiting state that gives up after enough looks at a world that
 *   never changed: it is counting time as attempts;
 * - a state that held for a while and then got on with it, and would have done
 *   something else had the hold lasted longer: the hold was spent against the
 *   ceiling of the work that followed it. This is the one that escalated a
 *   ticket saying it had tried three times, having tried none.
 */
export function ceilings(workflow: AnyWorkflow, walks: readonly Walk[], extraLooks: number): Finding[] {
  return walks.flatMap((walk) => [
    ...waitingStatesHold(workflow, walk, extraLooks),
    ...holdsAreNotTries(workflow, walk, extraLooks),
  ]);
}

function waitingStatesHold(workflow: AnyWorkflow, walk: Walk, extraLooks: number): Finding[] {
  const runtime = walk.runtime;
  if (!runtime) return [];
  const findings: Finding[] = [];
  const probed = new Set<string>();

  for (const look of walk.looks) {
    const state = look.record.state;
    if (look.plan.kind !== "wait" || !workflow.waitingStates.includes(state) || probed.has(state)) continue;
    probed.add(state);

    let record = look.record;
    let plan: Plan = look.plan;
    for (let count = 1; count <= extraLooks; count += 1) {
      const waited: Plan = plan;
      const folded: WorkRecord | undefined = replay(() => runtime.apply(applyPlan(record, waited, look.at), waited, {}, look.observation, look.at));
      if (!folded) break;
      record = folded;
      const next: Plan | undefined = replay(() => workflow.plan(folded, look.observation, runtime.policy));
      if (!next) break;
      if (next.kind !== "wait") {
        findings.push({
          property: "ceilings",
          message:
            `${walk.world}: \`${state}\` is a waiting state, and after ${count} more look(s) at a world that had not ` +
            `changed it would ${describe(next)}. A look is not a try; give up on time, or on something the world said`,
        });
        break;
      }
      plan = next;
    }
  }
  return findings;
}

function holdsAreNotTries(workflow: AnyWorkflow, walk: Walk, extraLooks: number): Finding[] {
  const runtime = walk.runtime;
  if (!runtime) return [];
  const findings: Finding[] = [];

  for (const look of heldThenMoved(walk.looks)) {
    const state = look.record.state;
    const longer: WorkRecord = {
      ...look.record,
      attempts: { ...look.record.attempts, [state]: (look.record.attempts[state] ?? 0) + extraLooks },
    };
    const instead = replay(() => workflow.plan(longer, look.observation, runtime.policy));
    if (!instead || sameMove(look.plan, instead)) continue;
    findings.push({
      property: "ceilings",
      message:
        `${walk.world}: \`${state}\` held, then went on to ${describe(look.plan)}; had the hold lasted ` +
        `${extraLooks} look(s) longer it would ${describe(instead)} instead. The wait was counted as a try`,
    });
  }
  return findings;
}

/** The first look that did not wait, after one or more that did, without leaving the state in between. */
function heldThenMoved(looks: readonly Look[]): Look[] {
  const found: Look[] = [];
  for (let index = 1; index < looks.length; index += 1) {
    const before = looks[index - 1]!;
    const look = looks[index]!;
    if (before.plan.kind === "wait" && look.plan.kind !== "wait" && before.record.state === look.record.state) {
      found.push(look);
    }
  }
  return found;
}
