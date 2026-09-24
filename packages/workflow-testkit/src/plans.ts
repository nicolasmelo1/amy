import { Plan, actionsOf } from "@amykit/core";

/**
 * What a plan does, without why it says it does it.
 *
 * Two plans are the same move when they are the same kind, go to the same
 * state and carry the same actions. The prose differs between looks — "attempt
 * 2", "attempt 3" — and a comparison that read it would call every retry a
 * different decision.
 */
export function sameMove(a: Plan, b: Plan): boolean {
  return shape(a) === shape(b);
}

function shape(plan: Plan): string {
  const to = plan.kind === "advance" ? plan.to : "";
  return `${plan.kind}:${to}:${actionsOf(plan).map((action) => action.type).join(",")}`;
}

/** A plan as a person reads it in a finding. */
export function describe(plan: Plan): string {
  const actions = actionsOf(plan).map((action) => `\`${action.type}\``);
  const carrying = actions.length > 0 ? ` with ${actions.join(", ")}` : "";
  switch (plan.kind) {
    case "advance":
      return `move to \`${plan.to}\`${carrying}`;
    case "act":
      return `act${carrying}`;
    case "wait":
      return `wait${carrying}`;
    case "settled":
      return "settle";
  }
}

/**
 * A decision the kit asks for on its own account, replaying a look.
 *
 * A replay that throws is not what the probe is about — the walk already
 * reports a plan that throws on a look the world really produced — so it is
 * treated as no answer rather than as a finding.
 */
export function replay<T>(body: () => T): T | undefined {
  try {
    return body();
  } catch {
    return undefined;
  }
}
