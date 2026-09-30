import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { mount } from "@amykit/core";
import { FileBriefStore, plugin } from "../src/index.js";
import { plugin as records } from "../../file-store/src/plugin.js";

const NOW = new Date("2026-09-03T12:00:00.000Z");
const DAY = 24 * 60 * 60 * 1000;

/** Drive real built code in another process, where in-memory serialization cannot help. */
function appendFromAnotherProcess(root: string, prefix: string): Promise<void> {
  const entry = pathToFileURL(path.join(process.cwd(), "plugins/file-brief-store/dist/index.js")).href;
  const program = `
    import { FileBriefStore } from ${JSON.stringify(entry)};
    const store = new FileBriefStore(process.env.AMY_BRIEF_ROOT);
    for (let index = 0; index < 30; index += 1) {
      await store.appendQuestion({
        id: "brief-1",
        question: { workId: process.env.AMY_BRIEF_PREFIX + index, question: "cross-process", at: "2026-09-03T12:00:00.000Z" },
        at: "2026-09-03T12:00:00.000Z",
      });
    }
  `;
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ["--input-type=module", "--eval", program], {
      env: { ...process.env, AMY_BRIEF_ROOT: root, AMY_BRIEF_PREFIX: prefix },
      stdio: "inherit",
    });
    child.once("error", reject);
    child.once("exit", (code) => code === 0 ? resolve() : reject(new Error(`brief writer exited ${code}`)));
  });
}

/** Hold the real kernel lock in another process until the test releases it. */
async function holdLockInAnotherProcess(lock: string, ready: string, release: string): Promise<{ held: Promise<void> }> {
  const program = `
    import fs from "node:fs";
    import { flock } from "fs-ext";
    const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
    const descriptor = fs.openSync(process.env.AMY_LOCK, "a+");
    await new Promise((resolve, reject) => flock(descriptor, "ex", (error) => error ? reject(error) : resolve()));
    fs.writeFileSync(process.env.AMY_READY, "ready");
    while (!fs.existsSync(process.env.AMY_RELEASE)) await wait(1);
    await new Promise((resolve, reject) => flock(descriptor, "un", (error) => error ? reject(error) : resolve()));
    fs.closeSync(descriptor);
  `;
  const child = spawn(process.execPath, ["--input-type=module", "--eval", program], {
    env: { ...process.env, AMY_LOCK: lock, AMY_READY: ready, AMY_RELEASE: release },
    stdio: "inherit",
  });
  const held = new Promise<void>((resolve, reject) => {
    child.once("error", reject);
    child.once("exit", (code) => code === 0 ? resolve() : reject(new Error(`brief lock holder exited ${code}`)));
  });
  // Readiness races the holder's own exit and a deadline: a holder that dies
  // before taking the lock is a failure to report, not a file to wait for.
  try {
    await Promise.race([
      waitForFile(ready, held),
      held.then(() => { throw new Error("brief lock holder exited before it held the lock"); }),
    ]);
  } catch (error: unknown) {
    child.kill();
    await held.catch(() => undefined);
    throw error;
  }
  return { held };
}

async function waitForFile(file: string, until: Promise<unknown>, timeoutMs = 10_000): Promise<void> {
  let settled = false;
  until.then(() => { settled = true; }, () => { settled = true; });
  const deadline = Date.now() + timeoutMs;
  while (!fs.existsSync(file)) {
    if (settled) return;
    if (Date.now() > deadline) throw new Error(`${file} did not appear within ${timeoutMs}ms`);
    await new Promise((resolve) => setTimeout(resolve, 1));
  }
}

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
    expect(fs.readdirSync(root).filter((name) => name.endsWith(".lock"))).toEqual(["brief-1.json.lock"]);
  });

  it("keeps every question when separate processes mutate the shared brief", async () => {
    await seeded(store);

    await Promise.all([appendFromAnotherProcess(root, "first-"), appendFromAnotherProcess(root, "second-")]);

    const brief = await store.get("brief-1");
    expect(brief?.questions).toHaveLength(60);
    expect(new Set(brief?.questions.map((question) => question.workId)).size).toBe(60);
  });

  it("keeps the event loop free while another phase owns a brief lock", async () => {
    await seeded(store);
    const lock = path.join(root, "brief-1.json.lock");
    const ready = path.join(root, "lock-ready");
    const release = path.join(root, "lock-release");
    const holder = await holdLockInAnotherProcess(lock, ready, release);

    const mutation = store.appendQuestion({
      id: "brief-1",
      question: { workId: "BILL-4021", question: "Does contention block the daemon?", at: NOW.toISOString() },
      at: NOW.toISOString(),
    });
    let timerRan = false;
    await new Promise<void>((resolve) => setTimeout(() => { timerRan = true; resolve(); }, 10));
    expect(timerRan).toBe(true);

    fs.writeFileSync(release, "release");
    await Promise.all([holder.held, mutation]);
  });

  it("releases its claim on a brief when the lock cannot even be opened", async () => {
    // The artifact directory disappears under the store, so opening the lock
    // fails before any kernel lock is taken.
    fs.rmSync(root, { recursive: true, force: true });
    await expect(seeded(store)).rejects.toThrow(/ENOENT/);

    // Once the filesystem is back, the next write to that brief proceeds
    // rather than waiting on a claim nobody holds.
    fs.mkdirSync(root, { recursive: true });
    const recovered = await Promise.race([
      seeded(store),
      new Promise<never>((_, reject) => setTimeout(() => reject(new Error("the write waited on a stale claim")), 2_000)),
    ]);
    expect(recovered.revision).toBe(1);
  });

  it("keeps one stable kernel-lock inode without private owner files", async () => {
    await seeded(store);
    await store.write({ id: "brief-1", sections: [], explains: [], at: NOW.toISOString() });

    expect(fs.readdirSync(root).filter((name) => name.includes(".lock"))).toEqual(["brief-1.json.lock"]);
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
    expect(fs.readdirSync(root).filter((name) => name.includes(".lock"))).toEqual(["brief-1.json.lock"]);
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
    expect(fs.readdirSync(root).filter((name) => name.includes(".lock"))).toEqual(["brief-1.json.lock"]);
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