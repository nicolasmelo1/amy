import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { FileTasks } from "../src/FileTasks.js";

const NOW = new Date("2026-09-05T10:00:00.000Z");

describe("tasks as a directory", () => {
  let root: string;

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), "amy-tasks-"));
  });

  afterEach(() => fs.rmSync(root, { recursive: true, force: true }));

  const tasks = (defaultRepo = "acme/widgets") => new FileTasks(root, { defaultRepo });

  it("writes one it can read back", () => {
    const store = tasks();
    const written = store.add({ repo: "acme/widgets", text: "bump the deps", source: "ada" }, NOW);

    expect(store.get(written.id)).toEqual(written);
  });

  it("takes one written by hand, with no timestamp in it", () => {
    // The whole point of a watched directory: an editor, a hook or a shell
    // one-liner can put work here, and a format only a program can produce
    // would have made this a programmatic interface with a directory in
    // front of it.
    fs.writeFileSync(
      path.join(root, "by-hand.md"),
      "---\nrepo: acme/gadgets\n---\n\nthe flaky test in checkout.spec.ts\n",
      "utf-8",
    );

    expect(tasks().get("by-hand")).toMatchObject({
      id: "by-hand",
      repo: "acme/gadgets",
      text: "the flaky test in checkout.spec.ts",
    });
  });

  it("falls back to the default repository when the file names none", () => {
    fs.writeFileSync(path.join(root, "bare.md"), "just do the thing\n", "utf-8");

    expect(tasks("acme/widgets").get("bare")?.repo).toBe("acme/widgets");
  });

  it("gives two tasks in one millisecond two ids", () => {
    const store = tasks();
    const first = store.add({ repo: "acme/widgets", text: "one", source: "ada" }, NOW);
    const second = store.add({ repo: "acme/widgets", text: "two", source: "ada" }, NOW);

    expect(second.id).not.toBe(first.id);
    expect(store.all()).toHaveLength(2);
  });

  it("returns them in a stable order without an index", () => {
    const store = tasks();
    store.add({ repo: "acme/widgets", text: "one", source: "ada" }, NOW);
    store.add({ repo: "acme/widgets", text: "two", source: "ada" }, new Date(NOW.getTime() + 1000));

    expect(store.all().map((task) => task.text)).toEqual(["one", "two"]);
  });

  it("is nothing for an id that is not there", () => {
    expect(tasks().get("never-written")).toBeNull();
  });

  it("ignores anything that is not a markdown file", () => {
    fs.writeFileSync(path.join(root, "notes.txt"), "not a task", "utf-8");

    expect(tasks().all()).toEqual([]);
  });

  it("makes its directory, so the first task does not need one", () => {
    const directory = path.join(root, "deeper", "still");
    new FileTasks(directory, { defaultRepo: "acme/widgets" });

    expect(fs.existsSync(directory)).toBe(true);
  });
});
