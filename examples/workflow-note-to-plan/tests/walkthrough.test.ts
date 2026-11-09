import { describe, it, expect } from "vitest";
import { DEFAULT_POLICY } from "../src/observation.js";
import { Note } from "../src/ports/Notes.js";
import { NoteWorld, walk } from "./mounted.js";

const NOTE: Note = {
  id: "note-1",
  repo: "acme/widgets",
  text: "the gate output is truncated before the agent ever sees it",
  source: "a tick that failed in CHECKED",
  writtenAt: "2026-09-04T19:00:00.000Z",
};

// Walked through the mount, so `PR_OPEN` is the call it is when installed:
// the pull-request workflow takes its own looks inside it, and the note moves
// on only once that workflow has reached an end.
async function walked(world = new NoteWorld(NOTE)) {
  return walk(await world.mounted(), NOTE.id);
}

describe("a note walking to a pull request", () => {
  it("reaches DONE, so no state is a dead end", async () => {
    expect((await walked()).record.state).toBe("DONE");
  });

  it("walks the lifecycle in order, the call's own looks inside PR_OPEN", async () => {
    const { looks } = await walked();

    expect(["NOTED", ...looks.map((look) => look.to)]).toEqual([
      "NOTED",
      "DRAFTED",
      "DRAFTED",
      "CHECKED",
      "CHECKED",
      "PR_OPEN",
      // The called workflow opens it, then finds it, then the note returns.
      "PR_OPEN",
      "PR_OPEN",
      "DONE",
    ]);
  });

  it("makes at most one move per look", async () => {
    const { looks } = await walked();

    for (const look of looks) {
      expect(look.actions.length).toBeLessThanOrEqual(1);
    }
  });

  it("reaches no pull request until the check is green", async () => {
    const { looks } = await walked();

    const opened = looks.findIndex((look) => look.actions.includes("open-pull-request"));
    const checked = looks.findIndex((look) => look.actions.includes("check-plan"));

    expect(checked).toBeGreaterThanOrEqual(0);
    expect(opened).toBeGreaterThan(checked);
  });

  it("touches no tracker on the way, because there is nothing to touch", async () => {
    const { looks } = await walked();

    expect(looks.flatMap((look) => look.actions)).toEqual(["draft-plan", "check-plan", "open-pull-request"]);
  });

  it("opens the pull request by a call, and keeps the number it returned", async () => {
    const world = new NoteWorld(NOTE);
    const { record } = await walked(world);

    expect(record.pullRequestNumber).toBe(12);
    expect(record.calls?.["note-1/PR_OPEN#1"]?.state).toBe("OPENED");
    expect(world.opened).toEqual([{
      repo: "acme/widgets",
      branch: "amy/plan-the-gate-output-is-truncated-before-the-agent",
      body: expect.stringContaining(NOTE.text),
    }]);
  });
});

describe("a draft the repository refuses", () => {
  it("goes back to the agent rather than to a pull request", async () => {
    const world = new NoteWorld(NOTE);
    world.checkPasses = false;

    const { looks } = await walked(world);

    expect(looks.flatMap((look) => look.actions)).not.toContain("open-pull-request");
  });

  it("comes back green once the agent fixes what the check said", async () => {
    const world = new NoteWorld(NOTE);
    world.redChecks = 1;

    const { record, looks } = await walked(world);

    expect(record.state).toBe("DONE");
    expect(looks.flatMap((look) => look.actions).filter((action) => action === "draft-plan")).toHaveLength(2);
  });

  it("stops after the ceiling on attempts, rather than spending forever", async () => {
    const world = new NoteWorld(NOTE);
    world.checkPasses = false;

    expect((await walked(world)).record.state).toBe("DECLINED");
  });
});

describe("a pull request the code host refuses", () => {
  it("hands the note back with the host's reason, said once", async () => {
    const world = new NoteWorld(NOTE);
    world.refusal = "No commits between main and amy/plan-the-gate-output-is-truncated-before-the-agent";

    const { record, looks } = await walked(world);

    expect(record.state).toBe("DECLINED");
    expect(record.calls?.["note-1/PR_OPEN#1"]?.state).toBe("REFUSED");
    expect(looks.map((look) => `${look.from}>${look.to}`)).toContain("PR_OPEN>DECLINED");
    expect(world.said.filter((text) => text.includes("No commits between main"))).toHaveLength(1);
  });
});

describe("a note the machine will not act on", () => {
  it("declines a repository it does not write into, having done nothing", async () => {
    const world = new NoteWorld(NOTE, ["acme/elsewhere"]);

    const { record, looks } = await walked(world);

    expect(record.state).toBe("DECLINED");
    expect(looks.flatMap((look) => look.actions)).toEqual(["announce"]);
  });

  it("holds at the ceiling with nothing drafted", async () => {
    const world = new NoteWorld(NOTE);
    world.others = Array.from({ length: DEFAULT_POLICY.maxOpenPlansPerRepo }, (_, index) => ({
      id: `other-${index}`, state: "PR_OPEN", repo: NOTE.repo, updatedAt: "", attempts: {}, history: [],
    }));

    const { record, looks } = await walked(world);

    expect(record.state).toBe("NOTED");
    expect(looks.flatMap((look) => look.actions)).toEqual(["announce"]);
  });
});
