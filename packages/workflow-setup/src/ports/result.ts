/**
 * The three ways anything this workflow asks of the host can come out.
 *
 * Success is green and carries what was asked for; a refusal is the host
 * saying no with the reason; an internal error is the host failing. What is
 * deliberately not here is "nothing was set": a config.yaml that cannot be
 * read refuses by name rather than reading as an empty machine, so nothing
 * ever reads green unread.
 */
export type Result<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly kind: "refused"; readonly why: string }
  | { readonly ok: false; readonly kind: "internal"; readonly why: string };

/** A green answer, carrying what was asked for. */
export function ok<T>(value: T): Result<T> {
  return { ok: true, value };
}

/** The host saying no, with the reason it said so. */
export function refused<T>(why: string): Result<T> {
  return { ok: false, kind: "refused", why };
}

/** The host failing, with what failed. */
export function internal<T>(why: string): Result<T> {
  return { ok: false, kind: "internal", why };
}

/** Whether a result is green, narrowed so a decision can read its value. */
export function green<T>(result: Result<T> | undefined): result is { ok: true; value: T } {
  return !!result && result.ok;
}

/** Whether a step came out refused or failed, narrowed so its reason can be read. */
export function failed<T>(result: Result<T> | undefined): result is Extract<Result<T>, { ok: false }> {
  return !!result && !result.ok;
}
