import { describe, it, expect, vi } from "vitest";
import { Channel, FanOutNotifier } from "../src/FanOutNotifier.js";

const announcement = {
  text: "ACME-1 needs an answer before I can start.",
  workId: "ACME-1",
  state: "CLARIFYING",
};

function recording(name: string, fail = false): Channel & { delivered: number } {
  const channel = {
    name,
    delivered: 0,
    async deliver() {
      if (fail) throw new Error(`${name} is down`);
      channel.delivered += 1;
    },
  };
  return channel;
}

describe("FanOutNotifier", () => {
  it("sends down every channel", async () => {
    const a = recording("a");
    const b = recording("b");

    await new FanOutNotifier([a, b], () => {}).announce(announcement);

    expect(a.delivered).toBe(1);
    expect(b.delivered).toBe(1);
  });

  it("keeps going when one channel is down", async () => {
    // Losing a notification must never stop a ticket.
    const broken = recording("broken", true);
    const working = recording("working");

    await new FanOutNotifier([broken, working], () => {}).announce(announcement);

    expect(working.delivered).toBe(1);
  });

  it("logs the channel that failed rather than hiding it", async () => {
    const log = vi.fn();

    await new FanOutNotifier([recording("broken", true), recording("ok")], log).announce(
      announcement,
    );

    expect(log).toHaveBeenCalledWith(expect.stringContaining("broken: broken is down"));
  });

  it("throws only when nothing could reach the operator", async () => {
    const notifier = new FanOutNotifier([recording("a", true), recording("b", true)], () => {});

    await expect(notifier.announce(announcement)).rejects.toThrow(
      /every notification channel failed/,
    );
  });

  it("refuses to be configured with no channel at all", async () => {
    await expect(new FanOutNotifier([], () => {}).announce(announcement)).rejects.toThrow(
      /no notification channel is configured/,
    );
  });
});
