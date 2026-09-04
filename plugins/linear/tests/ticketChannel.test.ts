import { describe, it, expect } from "vitest";
import { fakeTracker } from "@amy/test-fixtures";
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

    expect(tracker.comment).toHaveBeenCalledWith("ACME-1", announcement.text);
  });
});
