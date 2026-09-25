import { Plan, WorkRecord, applyPlan, movedBy } from "@amykit/core";
import { Finding } from "./finding.js";
import { describe, replay, sameMove } from "./plans.js";
import { AnyWorkflow, Look, Walk, replayActions } from "./walk.js";

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
 *
 * Both replay the same observation at the same instant on purpose. Holding
 * time still is what separates counting from waiting: a state that gives up on
 * a deadline keeps waiting here and passes, and only one that gives up because
 * the count grew goes red. Moving the clock would let a legitimate timeout
 * read as a wait counted as a try.
 */
export async function ceilings(workflow: AnyWorkflow, walks: readonly Walk[], extraLooks: number): Promise<Finding[]> {
  const findings: Finding[] = [];
  for (const walk of walks) {
    findings.push(...(await waitingStatesHold(workflow, walk, extraLooks)), ...holdsAreNotTries(workflow, walk, extraLooks));
  }
  return findings;
}

/**
 * Holds a waiting state for more looks at the same observation.
 *
 * Each held look is folded the way the walk folds one: the wait's own
 * actions are called and what they produced is applied, so a wait that
 * records something on its way — the moment it started, say — is replayed
 * as itself rather than as a bare count.
 */
async function waitingStatesHold(workflow: AnyWorkflow, walk: Walk, extraLooks: number): Promise<Finding[]> {
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
      const before: WorkRecord = record;
      const outcomes = await replayActions(runtime, waited, before, look.observation, walk.port);
      if (!outcomes) break;
      const folded: WorkRecord | undefined = replay(() =>
        runtime.apply(applyPlan(before, waited, look.at), waited, outcomes, look.observation, look.at, movedBy(before, waited)),
      );
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
    // Compared as moves, not word for word: an escalation whose reason
    // quotes the attempt count is the same decision with a different number
    // in it, and the question here is only whether the decision changed.
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
