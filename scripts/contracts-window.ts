// How long a contract its publisher moved is tolerated, for scripts/contracts.ts.

/** How long a moved contract is a warning rather than a red gate. */
export const STALE_AFTER_DAYS = 30;
const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Whether a moved contract is still inside the window. A manifest written
 * before `vendoredAt` existed has no age, and is held to the old rule: red.
 */
export function withinWindow(vendoredAt: string | undefined, now: Date): { ok: boolean; days: number | undefined } {
  const at = vendoredAt === undefined ? Number.NaN : Date.parse(vendoredAt);
  if (Number.isNaN(at)) return { ok: false, days: undefined };
  const days = Math.floor((now.getTime() - at) / DAY_MS);
  return { ok: days <= STALE_AFTER_DAYS, days };
}
