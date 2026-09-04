import { AgentRun, EventLog } from "@amy/core";
import { Rung } from "./ladder.js";

export interface HandoffLog {
  log?: EventLog;
  now?: () => Date;
}

/**
 * What the next harness is told about the one before it.
 *
 * The working tree is left exactly as the harness that gave up left it, so
 * the next one is told it is picking up half-done work. Resetting would throw
 * away whatever was already right, and on a long piece of work that is
 * expensive enough to risk hitting the same quota again.
 */
export function handoffNote(from: Rung, run: AgentRun): string {
  const because =
    run.outcome === "rate-limited"
      ? `ran out of quota partway through`
      : `did not succeed`;

  return [
    `A previous attempt by ${from.harness} (${from.model}) ${because}.`,
    `The working tree is exactly as it left it, so this may be half-done work`,
    `rather than a clean start. Continue it; do not begin again.`,
    ...(run.output ? [``, `What it said:`, ``, run.output] : []),
  ].join("\n");
}

/** Says which rung gave up and which one is being asked next. */
export function recordHandoff(
  deps: HandoffLog,
  workId: string | undefined,
  action: string,
  from: Rung,
  to: Rung,
  run: AgentRun,
): void {
  append(deps, workId, {
    action,
    cause: run.outcome,
    from: { harness: from.harness, model: from.model },
    to: { harness: to.harness, model: to.model },
    // Which axis moved, which is what a report about reliability wants.
    moved: from.harness === to.harness ? "model" : "harness",
  });
}

/**
 * The same event as a harness handoff, because it is the same question with a
 * third axis: `moved` already answers "what changed".
 */
export function recordSkillHandoff(
  deps: HandoffLog,
  workId: string | undefined,
  action: string,
  from: string,
  to: string,
  run: AgentRun,
): void {
  append(deps, workId, {
    action,
    cause: run.outcome,
    from: { skill: from },
    to: { skill: to },
    moved: "skill",
  });
}

function append(deps: HandoffLog, workId: string | undefined, detail: Record<string, unknown>): void {
  deps.log?.append({
    at: (deps.now ?? (() => new Date()))().toISOString(),
    kind: "agent.handoff",
    ...(workId === undefined ? {} : { workId }),
    detail,
  });
}
