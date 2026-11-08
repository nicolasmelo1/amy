import { Assertion, at, same } from "./scenario.js";

/**
 * How one step ended: with an output, failed, or unsupported — a step the
 * run could not evaluate at all, which is not a pass and is not a failure
 * of the work either.
 */
export type StepResult =
  | { readonly status: "done"; readonly output: unknown }
  | { readonly status: "failed"; readonly why: string }
  | { readonly status: "unsupported"; readonly why: string };

/**
 * An assertion's status. `unsupported` is a state of its own: an assertion
 * the harness could not evaluate is the thing most often counted as a pass.
 */
export type AssertionStatus = "passed" | "failed" | "unsupported";

export interface AssertionResult {
  readonly id: string;
  readonly criterion?: string;
  readonly status: AssertionStatus;
  readonly why?: string;
}

/**
 * An output that says it could not settle what it was asked — a UI check
 * neither the trees nor the pixels decided, and no agent could — is
 * unsupported, whatever else it carries.
 */
function unsupportedIn(output: unknown): string | undefined {
  if (typeof output !== "object" || output === null) return undefined;
  const { status, why } = output as { status?: unknown; why?: unknown };
  return status === "unsupported" ? (typeof why === "string" ? why : "the operation could not settle it") : undefined;
}

/** Judges one assertion against what the run's steps produced. */
export function evaluate(assertion: Assertion, results: Readonly<Record<string, StepResult>>): AssertionResult {
  const named = { id: assertion.id, ...(assertion.criterion ? { criterion: assertion.criterion } : {}) };
  const result = Object.hasOwn(results, assertion.step) ? results[assertion.step] : undefined;
  if (!result) return { ...named, status: "unsupported", why: `the step \`${assertion.step}\` never ran, so nothing could evaluate it` };
  if (result.status !== "done") return { ...named, status: result.status, why: `the step \`${assertion.step}\` ${result.status === "failed" ? "failed" : "could not be evaluated"}: ${result.why}` };
  const unsettled = unsupportedIn(result.output);
  if (unsettled !== undefined) return { ...named, status: "unsupported", why: `the step \`${assertion.step}\` could not settle it: ${unsettled}` };
  const found = at(result.output, assertion.path);
  if (!found.found) return { ...named, status: "unsupported", why: `the output of \`${assertion.step}\` carries no \`${assertion.path}\` to evaluate` };
  if (assertion.equals === undefined) return { ...named, status: "passed" };
  return same(found.value, assertion.equals)
    ? { ...named, status: "passed" }
    : { ...named, status: "failed", why: `\`${assertion.path ?? assertion.step}\` is ${JSON.stringify(found.value)}, not ${JSON.stringify(assertion.equals)}` };
}

/** Whether a run's assertions complete the proof: every one passed, none unsupported. */
export function holds(results: readonly AssertionResult[]): boolean {
  return results.length > 0 && results.every((one) => one.status === "passed");
}

/** What blocks completion, one line per assertion, naming it and why. */
export function blocking(results: readonly AssertionResult[]): string[] {
  return results.filter((one) => one.status !== "passed").map((one) => `\`${one.id}\` is ${one.status}: ${one.why ?? "no reason given"}`);
}
