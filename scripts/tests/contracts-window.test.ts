import { describe, expect, it } from "vitest";
import { STALE_AFTER_DAYS, withinWindow } from "../contracts-window.js";

const NOW = new Date("2026-11-11T12:00:00.000Z");
const daysAgo = (days: number) => new Date(NOW.getTime() - days * 24 * 60 * 60 * 1000).toISOString();

describe("the contracts' staleness window", () => {
  it("tolerates a moved contract vendored up to the window's last day", () => {
    expect(withinWindow(daysAgo(0), NOW)).toEqual({ ok: true, days: 0 });
    expect(withinWindow(daysAgo(STALE_AFTER_DAYS), NOW)).toEqual({ ok: true, days: STALE_AFTER_DAYS });
  });

  it("is red the day after the window", () => {
    expect(withinWindow(daysAgo(STALE_AFTER_DAYS + 1), NOW)).toEqual({ ok: false, days: STALE_AFTER_DAYS + 1 });
  });

  it("is red for a manifest with no date or an unreadable one", () => {
    expect(withinWindow(undefined, NOW)).toEqual({ ok: false, days: undefined });
    expect(withinWindow("not a date", NOW)).toEqual({ ok: false, days: undefined });
  });
});
