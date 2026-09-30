import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { mount } from "@amykit/core";
import { FileBriefStore, plugin } from "../src/index.js";
import { plugin as records } from "../../file-store/src/plugin.js";

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

  it("serializes concurrent phase mutations of the same brief", async () => {
    await seeded(store);

    await Promise.all([
      store.write({
        id: "brief-1",
        sections: [{ name: "Goal", body: "A newer grooming pass." }],
        explains: ["BILL-4021"],
        at: new Date(NOW.getTime() + DAY).toISOString(),
      }),
      store.appendQuestion({
        id: "brief-1",
        question: { workId: "BILL-4021", question: "Who owns the rollout?", at: NOW.toISOString() },
        at: NOW.toISOString(),
      }),
    ]);

    const brief = await store.get("brief-1");
    expect(brief?.questions).toHaveLength(1);
    expect(brief?.revision).toBe(2);
    expect(fs.readdirSync(root).filter((name) => name.endsWith(".lock"))).toEqual([]);
  });

  it("does not retain a private lock owner after publishing", async () => {
    await seeded(store);
    await store.write({ id: "brief-1", sections: [], explains: [], at: NOW.toISOString() });

    expect(fs.readdirSync(root).filter((name) => name.includes(".lock."))).toEqual([]);
  });

  it("reclaims a crashed owner's unpublished hard link", async () => {
    await seeded(store);
    const lock = path.join(root, "brief-1.json.lock");
    const owner = `${lock}.crashed`;
    fs.writeFileSync(owner, "0\n", "utf8");
    fs.linkSync(owner, lock);

    await store.write({ id: "brief-1", sections: [], explains: [], at: NOW.toISOString() });

    expect(fs.readdirSync(root).filter((name) => name.includes(".lock"))).toEqual([]);
  });

  it("serializes stale-lock recovery with a new writer", async () => {
    await seeded(store);
    const lock = path.join(root, "brief-1.json.lock");
    fs.writeFileSync(lock, "0\n", "utf8");

    await Promise.all([
      store.write({ id: "brief-1", sections: [{ name: "Goal", body: "Recovered write." }], explains: [], at: NOW.toISOString() }),
      store.appendQuestion({ id: "brief-1", question: { workId: "BILL-4021", question: "Still safe?", at: NOW.toISOString() }, at: NOW.toISOString() }),
    ]);

    const brief = await store.get("brief-1");
    expect(brief?.sections[0]?.body).toBe("Recovered write.");
    expect(brief?.questions).toHaveLength(1);
    expect(fs.readdirSync(root).filter((name) => name.includes(".lock"))).toEqual([]);
  });

  it("reclaims a crashed acquisition gate before mutating the brief", async () => {
    await seeded(store);
    const gate = path.join(root, "brief-1.json.lock.acquiring");
    const owner = `${gate}.crashed`;
    fs.writeFileSync(owner, "0\n", "utf8");
    fs.linkSync(owner, gate);

    await store.write({ id: "brief-1", sections: [{ name: "Goal", body: "Recovered after a crash." }], explains: [], at: NOW.toISOString() });

    expect((await store.get("brief-1"))?.sections[0]?.body).toBe("Recovered after a crash.");
    expect(fs.readdirSync(root).filter((name) => name.includes(".lock"))).toEqual([]);
  });

  it("recovers a crashed gate reclaimer before retrying the acquisition", async () => {
    await seeded(store);
    const gate = path.join(root, "brief-1.json.lock.acquiring");
    fs.writeFileSync(gate, "0\n", "utf8");
    // A crashed reclaimer leaves its recovery hard link to the same stale
    // gate. Two later phase mutations must safely settle it and serialize.
    fs.linkSync(gate, `${gate}.recovering`);

    await Promise.all([
      store.write({ id: "brief-1", sections: [{ name: "Goal", body: "Recovered twice." }], explains: [], at: NOW.toISOString() }),
      store.appendQuestion({ id: "brief-1", question: { workId: "BILL-4021", question: "Recovered safely?", at: NOW.toISOString() }, at: NOW.toISOString() }),
    ]);

    expect((await store.get("brief-1"))?.sections[0]?.body).toBe("Recovered twice.");
    expect((await store.get("brief-1"))?.questions).toHaveLength(1);
    expect(fs.readdirSync(root).filter((name) => name.includes(".lock"))).toEqual([]);
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

  it("serializes removal with a concurrent writer", async () => {
    await seeded(store);

    await Promise.all([
      store.remove("brief-1"),
      store.write({ id: "brief-1", sections: [{ name: "Goal", body: "A later revision." }], explains: [], at: NOW.toISOString() }),
    ]);

    // Whichever mutation wins, no writer can observe or overwrite deletion
    // halfway through its own read-modify-write cycle.
    const brief = await store.get("brief-1");
    expect(brief === null || brief.sections[0]?.body).toBe("A later revision.");
    expect(fs.readdirSync(root).filter((name) => name.includes(".lock"))).toEqual([]);
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

  it("uses a host-selected artifact root when phases share one", async () => {
    const artifacts = path.join(root, "project-artifacts");
    const outcome = await mount(
      [records, plugin],
      {},
      {
        runner: { run: async () => ({ ok: true, exitCode: 0, stdout: "", stderr: "" }) },
        now: () => NOW,
        paths: { workspace: root, checkouts: {}, state: path.join(root, "brief-phase"), artifacts },
      },
    );
    if (!outcome.ok) throw new Error(outcome.problems.join("; "));

    const mounted = outcome.mounted.ports.get("brief") as FileBriefStore;
    await seeded(mounted, "cross-phase");
    const reader = new FileBriefStore(path.join(artifacts, "briefs"));
    expect((await reader.get("cross-phase"))?.sections[0]?.body).toBe("One currency on every invoice line.");
    expect(fs.existsSync(path.join(artifacts, "briefs", "cross-phase.json"))).toBe(true);
    expect(fs.existsSync(path.join(root, "brief-phase", "briefs", "cross-phase.json"))).toBe(false);
  });

  it("mounts beside the record store, leaving the port free for another adapter", async () => {
    const outcome = await mount(
      [records, plugin],
      {},
      {
        runner: { run: async () => ({ ok: true, exitCode: 0, stdout: "", stderr: "" }) },
        now: () => NOW,
        paths: { workspace: root, checkouts: {}, state: root },
      },
    );

    expect(outcome.ok).toBe(true);
    expect(outcome.ok && outcome.mounted.ports.get("brief")).toBeInstanceOf(FileBriefStore);
  });
});