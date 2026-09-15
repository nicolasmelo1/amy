import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { FileBriefStore } from "../src/FileBriefStore.js";

const NOW = new Date("2026-09-03T12:00:00.000Z");
const DAY = 24 * 60 * 60 * 1000;

/** A written brief, in the shape the port's own writers leave behind. */
async function seeded(
  store: FileBriefStore,
  id = "brief-1",
  explains: string[] = ["BILL-4021", "BILL-4022"],
  updatedAt = NOW.toISOString(),
) {
  const brief = await store.write({
    id,
    sections: [
      { name: "Goal", body: "One currency on every invoice line." },
      { name: "Scope", body: "The invoice view only." },
    ],
    explains,
    at: updatedAt,
  });
  return brief;
}

describe("FileBriefStore", () => {
  let root: string;
  let store: FileBriefStore;

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), "amy-briefs-"));
    store = new FileBriefStore(root);
  });

  afterEach(() => {
    fs.rmSync(root, { recursive: true, force: true });
  });

  it("writes a brief that reads back as itself", async () => {
    await seeded(store);

    const brief = await store.get("brief-1");

    expect(brief?.sections).toEqual([
      { name: "Goal", body: "One currency on every invoice line." },
      { name: "Scope", body: "The invoice view only." },
    ]);
    expect(brief?.revision).toBe(1);
    expect(brief?.createdAt).toBe(NOW.toISOString());
  });

  it("replaces the sections on a rewrite and keeps the questions", async () => {
    await seeded(store);
    await store.appendQuestion({
      id: "brief-1",
      question: { workId: "BILL-4021", question: "Which currency for the total?", at: NOW.toISOString() },
      at: NOW.toISOString(),
    });

    const rewritten = await store.write({
      id: "brief-1",
      sections: [{ name: "Goal", body: "One currency, everywhere." }],
      explains: ["BILL-4021", "BILL-4022"],
      at: new Date(NOW.getTime() + DAY).toISOString(),
    });

    expect(rewritten.revision).toBe(2);
    expect(rewritten.sections).toEqual([{ name: "Goal", body: "One currency, everywhere." }]);
    // A revision never loses a question: the append is a separate operation.
    expect(rewritten.questions).toHaveLength(1);
    expect(rewritten.createdAt).toBe(NOW.toISOString());
  });

  it("appends a question without making a revision", async () => {
    await seeded(store);

    const appended = await store.appendQuestion({
      id: "brief-1",
      question: { workId: "BILL-4022", question: "Does the total round?", at: NOW.toISOString() },
      at: NOW.toISOString(),
    });

    expect(appended.revision).toBe(1);
    expect(appended.questions).toEqual([
      { workId: "BILL-4022", question: "Does the total round?", at: NOW.toISOString() },
    ]);
  });

  it("refuses to append to a brief that does not exist", async () => {
    await expect(
      store.appendQuestion({
        id: "no-such-brief",
        question: { workId: "BILL-4021", question: "?", at: NOW.toISOString() },
        at: NOW.toISOString(),
      }),
    ).rejects.toThrow("there is no brief `no-such-brief` to append a question to");
  });

  it("refuses a brief id that would escape the directory", async () => {
    await expect(
      store.write({
        id: "../elsewhere",
        sections: [],
        explains: [],
        at: NOW.toISOString(),
      }),
    ).rejects.toThrow("a brief id cannot contain a path separator");
  });

  it("leaves no half-written file behind when a save is interrupted", async () => {
    await seeded(store);
    const file = path.join(root, "brief-1.json");

    // A leftover `.tmp` sibling from a crash mid-write is never read back:
    // the rename is the commit, and this asserts the read path honours it.
    fs.writeFileSync(`${file}.tmp`, "{ not json", "utf-8");

    const brief = await store.get("brief-1");

    expect(brief?.revision).toBe(1);
    expect(fs.existsSync(`${file}.tmp`)).toBe(true);
  });

  it("retains a brief while any work it explains is open", async () => {
    await seeded(store, "brief-1", ["BILL-4021", "BILL-4022"]);

    const retired = await store.retired(
      (workId) => workId === "BILL-4022", // BILL-4021 is still open
      0,
      new Date(NOW.getTime() + 30 * DAY),
    );

    expect(retired).toEqual([]);
  });

  it("retains a brief whose work is terminal but not old enough", async () => {
    await seeded(store, "brief-1", ["BILL-4021"], new Date(NOW.getTime() - 2 * DAY).toISOString());

    const retired = await store.retired(
      () => true,
      7 * DAY,
      NOW,
    );

    expect(retired).toEqual([]);
  });

  it("retires a brief whose every work id is terminal and old enough", async () => {
    await seeded(store, "brief-1", ["BILL-4021", "BILL-4022"], new Date(NOW.getTime() - 30 * DAY).toISOString());

    const retired = await store.retired(
      () => true,
      7 * DAY,
      NOW,
    );

    expect(retired).toEqual(["brief-1"]);
  });

  it("removes a brief it was told to remove", async () => {
    await seeded(store);

    await store.remove("brief-1");

    expect(await store.get("brief-1")).toBeNull();
  });

  it("reads the current version, not a copy folded in at write time", async () => {
    // The whole point of the port: a reader between two ticks sees revision
    // two, not the revision one it saw yesterday. Read again, read fresh.
    await seeded(store);
    const first = await store.get("brief-1");
    await store.write({
      id: "brief-1",
      sections: [{ name: "Goal", body: "Changed since the first look." }],
      explains: ["BILL-4021"],
      at: new Date(NOW.getTime() + DAY).toISOString(),
    });

    const second = await store.get("brief-1");

    expect(first?.revision).toBe(1);
    expect(second?.revision).toBe(2);
    expect(second?.sections[0]?.body).toBe("Changed since the first look.");
  });
});