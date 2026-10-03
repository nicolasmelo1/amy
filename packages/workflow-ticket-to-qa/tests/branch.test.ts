import { describe, expect, it } from "vitest";
import { fakeGit, fakeTracker, ticket, ticketWorkerDeps } from "@amykit/test-fixtures";
import { newRecord } from "../src/index.js";

const clock = new Date("2026-10-03T12:00:00.000Z");

describe("a ticket whose tracker derived no branch", () => {
  it("is refused on its first look, naming the field, before any branch is prepared", async () => {
    const git = fakeGit();
    const { runtime } = ticketWorkerDeps({
      tracker: fakeTracker({ get: async () => ({ ...ticket(), branchName: undefined }) }),
      git,
      now: () => clock,
    });

    await expect(runtime.observe(newRecord("PROJ-1239", clock))).rejects.toThrow(/PROJ-1239 has no `branchName`/);
    expect(git.prepareBranch).not.toHaveBeenCalled();
    expect(git.commitAndPush).not.toHaveBeenCalled();
  });
});
