import { DrawnTransition, WorkRecord, Workflow, cameFrom, connects } from "@amykit/core";
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
    for (const child of callsIn(workflow, walk)) {
      if (!child.workflow.diagram) continue;
      child.record.history.forEach((move, index) => {
        if (connects(child.workflow.diagram!, move.from, move.to, cameFrom(child.record.history.slice(0, index), move.from))) return;
        findings.push({
          property: "transitions",
          message: `${walk.world}: in the call \`${child.at}\`, \`${move.from}\` moves to \`${move.to}\`, and ${child.workflow.name}'s diagram draws no arrow from \`${move.from}\` to \`${move.to}\``,
        });
      });
    }
  }
  if (!everyEdge) return findings;

  const lanes = lanesDrawn(workflow as Workflow, "");
  return [
    ...findings,
    ...drawnNotWalked(workflow, walks).map((edge): Finding => ({
      property: "transitions",
      message: `\`${edge.from}\` → \`${edge.to}\`${lanes.has(edge.from) && edge.label ? ` (\`${edge.label}\`)` : ""} is drawn, and no world walks it`,
    })),
  ];
}

/**
 * The arrows the diagram draws that no walk took: for a workflow still being
 * written, the to-do list. A called workflow's arrows count too, named by the
 * call state they sit in (`REVIEW/READING`), walked when its record moved
 * along them.
 */
function drawnNotWalked(workflow: AnyWorkflow, walks: readonly Walk[]): DrawnTransition[] {
  const root = workflow as Workflow;
  const walked = new Set(
    walks.flatMap((walk) => walk.looks)
      .filter((look) => look.plan.kind === "advance")
      .map((look) => `${look.record.state}\u0000${(look.plan as { to: string }).to}`),
  );
  for (const walk of walks) {
    for (const child of callsIn(workflow, walk)) {
      for (const move of child.record.history) walked.add(`${child.at}/${move.from}\u0000${child.at}/${move.to}`);
    }
    for (const look of walk.looks) for (const edge of laneEdges(root, look.record, "")) walked.add(edge);
  }
  const seen = new Set<string>();
  // Every end of a lane leads to the same join, so the end is what tells one
  // of those arrows from another.
  const lanes = lanesDrawn(root, "");
  return drawn(workflow, "").filter((edge) => {
    const key = lanes.has(edge.from) ? `${edge.from}\u0000${edge.to}\u0000${edge.label ?? ""}` : `${edge.from}\u0000${edge.to}`;
    if (walked.has(key) || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/**
 * The arrows a record waiting in a fork has walked: from the fork into every
 * lane it started, and from each lane that ended into the join.
 */
function laneEdges(workflow: Workflow, record: WorkRecord, prefix: string): string[] {
  const fork = workflow.diagram?.forks[record.state];
  const own = (fork?.lanes ?? []).flatMap((lane) => {
    const call = record.lanes?.[lane]?.call;
    const child = call === undefined ? undefined : record.calls?.[call];
    if (!child) return [];
    const ended = workflow.calls?.[lane]?.terminalStates.includes(child.state);
    return [`${prefix}${record.state}\u0000${prefix}${lane}`, ...(ended ? [`${prefix}${lane}\u0000${prefix}${fork!.join}\u0000${child.state}`] : [])];
  });
  // A callee's own forks, at every depth, named by the call state they sit in.
  const nested = Object.values(record.calls ?? {}).flatMap((child) => {
    const state = /\/([A-Za-z_]\w*)#\d+$/.exec(child.id)?.[1];
    const callee = state ? workflow.calls?.[state] : undefined;
    return state && callee ? laneEdges(callee, child, `${prefix}${state}/`) : [];
  });
  return [...own, ...nested];
}

/** Every lane drawn, at every depth, named as `drawn` names it. */
function lanesDrawn(workflow: Workflow, prefix: string): Set<string> {
  const own = Object.values(workflow.diagram?.forks ?? {}).flatMap((fork) => fork.lanes.map((lane) => `${prefix}${lane}`));
  const nested = Object.entries(workflow.calls ?? {}).flatMap(([state, callee]) => [...lanesDrawn(callee, `${prefix}${state}/`)]);
  return new Set([...own, ...nested]);
}

function drawn(workflow: Workflow, prefix: string): DrawnTransition[] {
  const own = (workflow.diagram?.transitions ?? []).map((edge) => ({ ...edge, from: `${prefix}${edge.from}`, to: `${prefix}${edge.to}` }));
  return [...own, ...Object.entries(workflow.calls ?? {}).flatMap(([state, callee]) => drawn(callee, `${prefix}${state}/`))];
}

interface Called {
  /** The call states it was reached through, as `REVIEW/FIX`. */
  readonly at: string;
  readonly workflow: Workflow;
  readonly record: WorkRecord;
}

/**
 * Every call a walk made, at any depth, each as the longest history any look
 * saw it with: a child keeps its own, so the last look holds every move.
 */
function callsIn(workflow: AnyWorkflow, walk: Walk): Called[] {
  const latest = new Map<string, Called>();
  const visit = (caller: Workflow, record: WorkRecord, prefix: string): void => {
    for (const child of Object.values(record.calls ?? {})) {
      const state = /\/([A-Za-z_]\w*)#\d+$/.exec(child.id)?.[1];
      const callee = state ? caller.calls?.[state] : undefined;
      if (!state || !callee) continue;
      const at = `${prefix}${state}`;
      const known = latest.get(child.id);
      if (!known || known.record.history.length < child.history.length) latest.set(child.id, { at, workflow: callee, record: child });
      visit(callee, child, `${at}/`);
    }
  };
  for (const look of walk.looks) visit(workflow as Workflow, look.record, "");
  return [...latest.values()];
}
