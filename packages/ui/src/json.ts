/** A value that survives `JSON.stringify` and `JSON.parse` unchanged. */
export type Json = string | number | boolean | null | readonly Json[] | { readonly [key: string]: Json };

/**
 * Whether a value is JSON, all the way down.
 *
 * Stricter than `JSON.stringify`, which quietly drops a function and turns
 * `NaN` into `null`: either would reach a renderer as something other than
 * what the view said.
 */
export function isJson(value: unknown): value is Json {
  if (value === null || typeof value === "string" || typeof value === "boolean") return true;
  if (typeof value === "number") return Number.isFinite(value);
  if (Array.isArray(value)) return value.every(isJson);
  if (typeof value !== "object") return false;
  const prototype = Object.getPrototypeOf(value) as unknown;
  if (prototype !== Object.prototype && prototype !== null) return false;
  return Object.values(value).every(isJson);
}

/** Whether two JSON values are the same value, key order aside. */
export function sameJson(a: Json, b: Json): boolean {
  if (a === b) return true;
  if (typeof a !== "object" || typeof b !== "object" || a === null || b === null) return false;
  if (Array.isArray(a) || Array.isArray(b)) {
    return Array.isArray(a) && Array.isArray(b) && a.length === b.length && a.every((item, i) => sameJson(item, b[i] as Json));
  }
  const left = a as { readonly [key: string]: Json };
  const right = b as { readonly [key: string]: Json };
  const keys = Object.keys(left);
  return keys.length === Object.keys(right).length && keys.every((key) => key in right && sameJson(left[key] as Json, right[key] as Json));
}
