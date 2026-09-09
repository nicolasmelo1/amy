import { describe, it, expect } from "vitest";
import { fakeTracker } from "@amykit/test-fixtures";
import { trackerChannel } from "../src/ticketChannel.js";

const announcement = {
  text: "ACME-1 needs an answer before I can start.",
  workId: "ACME-1",
  state: "CLARIFYING",
};

describe("trackerChannel", () => {
  it("puts the announcement on the ticket", async () => {
    const tracker = fakeTracker();

    await trackerChannel(tracker).deliver(announcement);

    expect(tracker.comment).toHaveBeenCalledWith("ACME-1", expect.stringContaining(announcement.text));
  });

  /**
   * amy authenticates with a key issued to a person, so a comment it leaves is
   * authored by that person. The raw text went up with nothing to mark it and
   * a colleague replied to a retry notice asking what it meant.
   */
  it("says a machine wrote it, on the first line", async () => {
    const tracker = fakeTracker();

    await trackerChannel(tracker).deliver(announcement);

    const body = (tracker.comment as unknown as { mock: { calls: string[][] } }).mock.calls[0]![1]!;
    expect(body.split("\n")[0]).toBe("amy:");
    expect(body).toContain("not typed by hand");
  });
});
