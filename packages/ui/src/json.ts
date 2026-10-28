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
  return jsonCopy(value) !== undefined;
}

/**
 * The value as JSON will send it, read once and frozen — or `undefined` when
 * it is not JSON. A check that reads a value and a send that reads it again
 * can disagree, through a getter or a mutation in between; keeping the copy
 * the check read is what makes what was checked what is sent.
 */
export function jsonCopy(value: unknown): Json | undefined {
  return copyOnPath(value, new Set());
}

/**
 * `path` holds the objects between the root and here, so a cycle is refused
 * rather than recursed into forever, while one value shared by two branches
 * is still JSON.
 */
function copyOnPath(value: unknown, path: Set<object>): Json | undefined {
  if (value === null || typeof value === "string" || typeof value === "boolean") return value;
  if (typeof value === "number") return Number.isFinite(value) ? value : undefined;
  if (typeof value !== "object" || path.has(value)) return undefined;
  // A `toJSON` hook is what `JSON.stringify` sends instead of the value itself.
  if (typeof (value as { toJSON?: unknown }).toJSON === "function") return undefined;
  if (!onlyWhatJsonSends(value)) return undefined;
  path.add(value);
  try {
    if (Array.isArray(value)) return copyArray(value, path);
    return isPlainObject(value) ? copyObject(value, path) : undefined;
  } finally {
    path.delete(value);
  }
}

/**
 * Every indexed slot, read the way `JSON.stringify` reads it — not through
 * the iterator, which may yield something else — and nothing when the array
 * carries keys besides its indexes, which JSON drops. A hole reads as
 * `undefined`, and is refused as one.
 */
function copyArray(value: readonly unknown[], path: Set<object>): Json | undefined {
  if (Object.keys(value).length !== value.length) return undefined;
  const items: Json[] = [];
  for (let i = 0; i < value.length; i++) {
    const item = copyOnPath(value[i], path);
    if (item === undefined) return undefined;
    items.push(item);
  }
  return Object.freeze(items);
}

function copyObject(value: Record<string, unknown>, path: Set<object>): Json | undefined {
  const copy: Record<string, Json> = {};
  for (const key of Object.keys(value)) {
    const item = copyOnPath(value[key], path);
    if (item === undefined) return undefined;
    // Defined rather than assigned, so a key named `__proto__` stays a key.
    Object.defineProperty(copy, key, { value: item, enumerable: true, writable: true, configurable: true });
  }
  return Object.freeze(copy);
}

/**
 * Whether every own property of an object is one `JSON.stringify` sends: a
 * non-enumerable one passes a check that reads it and is gone on arrival.
 * An array's own `length` is the one exception, and is not sent either.
 */
export function onlyWhatJsonSends(value: object): boolean {
  if (Object.getOwnPropertySymbols(value).length > 0) return false;
  const names = Object.getOwnPropertyNames(value).length;
  return names === Object.keys(value).length + (Array.isArray(value) ? 1 : 0);
}

/** Whether a value is an object literal's kind of object, not a date, a map or a class instance. */
export function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value) as unknown;
  return prototype === Object.prototype || prototype === null;
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
  return keys.length === Object.keys(right).length && keys.every((key) => Object.hasOwn(right, key) && sameJson(left[key] as Json, right[key] as Json));
}
