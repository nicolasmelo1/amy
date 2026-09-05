import { describe, it, expect } from "vitest";
import { Announcement } from "@amykit/core";
import { NewNote, Note, Notes } from "@amykit/workflow-note-to-plan";
import { frictionChannel } from "../src/frictionChannel.js";

const NOW = new Date("2026-09-04T20:00:00.000Z");

function recordingNotes() {
  const written: NewNote[] = [];

  const notes: Notes = {
    all: () => [],
    get: () => null,
    write: (note) => {
      written.push(note);
      return { ...note, id: "note-1", writtenAt: NOW.toISOString() } as Note;
    },
  };

  return { notes, written };
}

function announcement(overrides: Partial<Announcement> = {}): Announcement {
  return {
    text: "PROJ-1 failed 5 times in CHECKED, I have given up",
    workId: "PROJ-1",
    state: "CHECKED",
    ...overrides,
  };
}

describe("friction as a note", () => {
  it("writes one when the machine gives up", async () => {
    const { notes, written } = recordingNotes();

    await frictionChannel(notes, "acme/amy", () => NOW).deliver(
      announcement({ kind: "gave-up" }),
    );

    expect(written).toHaveLength(1);
  });

  it("writes nothing while it is still retrying", async () => {
    // A step that failed once and worked on the second attempt is not
    // friction worth a plan, and filing one for it would bury the ones that
    // are.
    const { notes, written } = recordingNotes();

    await frictionChannel(notes, "acme/amy", () => NOW).deliver(
      announcement({ kind: "failing" }),
    );

    expect(written).toEqual([]);
  });

  it("writes nothing when the work recovers", async () => {
    const { notes, written } = recordingNotes();

    await frictionChannel(notes, "acme/amy", () => NOW).deliver(
      announcement({ kind: "recovered" }),
    );

    expect(written).toEqual([]);
  });

  it("writes nothing for an announcement that is not about trouble at all", async () => {
    const { notes, written } = recordingNotes();

    await frictionChannel(notes, "acme/amy", () => NOW).deliver(announcement());

    expect(written).toEqual([]);
  });

  it("files it against the repository this machine's own failures belong to", async () => {
    const { notes, written } = recordingNotes();

    await frictionChannel(notes, "acme/amy", () => NOW).deliver(
      announcement({ kind: "gave-up" }),
    );

    expect(written[0]?.repo).toBe("acme/amy");
  });

  it("keeps what broke and where, so the note is worth reading later", async () => {
    const { notes, written } = recordingNotes();

    await frictionChannel(notes, "acme/amy", () => NOW).deliver(
      announcement({ kind: "gave-up" }),
    );

    expect(written[0]?.text).toContain("PROJ-1 failed 5 times in CHECKED");
    expect(written[0]?.source).toBe("a tick that failed in CHECKED");
  });
});
