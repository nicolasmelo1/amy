/**
 * The marker a deferred implementation carries.
 *
 * A global symbol rather than a module one, so a host that reads a plugin
 * without importing this module — the docs generator does — can still tell a
 * factory from the thing it builds.
 */
const DEFERRED = Symbol.for("amykit.deferred");

/**
 * An implementation the host builds once every plugin has registered.
 *
 * Explicit rather than "any function", because a contribution that is itself
 * a function is a legitimate thing to register.
 */
export interface Deferred<T extends object = object> {
  readonly [DEFERRED]: () => T;
}

/**
 * Registers `build` instead of what it returns.
 *
 * The host calls it once per mount, after every plugin has registered and
 * before any `ready`, so it may read any port or contribution regardless of
 * the order plugins are listed in. Whoever reads it receives the built object.
 */
export function deferred<T extends object>(build: () => T): Deferred<T> {
  return Object.freeze({ [DEFERRED]: build });
}

export function isDeferred(value: unknown): value is Deferred {
  return typeof value === "object" && value !== null && typeof (value as Record<symbol, unknown>)[DEFERRED] === "function";
}

/** The factory behind a deferred implementation. */
export function factoryOf<T extends object>(value: Deferred<T>): () => T {
  return value[DEFERRED];
}
