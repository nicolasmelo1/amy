import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { FileNotes } from "../src/FileNotes.js";

const NOW = new Date("2026-09-04T20:00:00.000Z");

describe("notes on disk", () => {
  let root: string;
  let notes: FileNotes;

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), "amy-notes-"));
    notes = new FileNotes(root, { defaultRepo: "acme/widgets" });
  });

  afterEach(() => fs.rmSync(root, { recursive: true, force: true }));

  it("gives back what was written down", () => {
    const written = notes.write(
      { repo: "acme/widgets", text: "the gate output is truncated", source: "ada" },
      NOW,
    );

    expect(notes.get(written.id)).toEqual({
      id: written.id,
      repo: "acme/widgets",
      text: "the gate output is truncated",
      source: "ada",
      writtenAt: "2026-09-04T20:00:00.000Z",
    });
  });

  it("survives a restart, because the directory is the record", () => {
    const written = notes.write({ repo: "acme/widgets", text: "friction", source: "ada" }, NOW);

    expect(new FileNotes(root, { defaultRepo: "" }).get(written.id)).toMatchObject({
      text: "friction",
    });
  });

  it("keeps two notes written in the same millisecond apart", () => {
    const first = notes.write({ repo: "acme/widgets", text: "one", source: "ada" }, NOW);
    const second = notes.write({ repo: "acme/widgets", text: "two", source: "ada" }, NOW);

    expect(first.id).not.toBe(second.id);
    expect(notes.all().map((note) => note.text)).toEqual(["one", "two"]);
  });

  it("hands them back in a stable order, so a queue has one without an index", () => {
    notes.write({ repo: "acme/widgets", text: "one", source: "ada" }, NOW);
    notes.write(
      { repo: "acme/widgets", text: "two", source: "ada" },
      new Date("2026-09-04T21:00:00.000Z"),
    );

    const ids = notes.all().map((note) => note.id);
    expect([...ids].sort()).toEqual(ids);
  });

  it("has nothing to say about a note nobody wrote", () => {
    expect(notes.get("note-nobody-wrote")).toBeNull();
  });
});

describe("a note somebody wrote by hand", () => {
  let root: string;
  let notes: FileNotes;

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), "amy-notes-"));
    notes = new FileNotes(root, { defaultRepo: "acme/widgets" });
  });

  afterEach(() => fs.rmSync(root, { recursive: true, force: true }));

  /** What an editor, a hook or a shell one-liner would leave behind. */
  function drop(name: string, contents: string): void {
    fs.writeFileSync(path.join(root, name), contents, "utf-8");
  }

  it("is picked up alongside the ones the machine wrote", () => {
    notes.write({ repo: "acme/widgets", text: "mine", source: "amy" }, NOW);
    drop("by-hand.md", "the relay retries a harness that is out of quota\n");

    expect(notes.all().map((note) => note.text).sort()).toEqual([
      "mine",
      "the relay retries a harness that is out of quota",
    ]);
  });

  it("takes its id from the file name, so it can be found again", () => {
    drop("by-hand.md", "friction\n");

    expect(notes.get("by-hand")).toMatchObject({ id: "by-hand", text: "friction" });
  });

  it("reads the header when there is one", () => {
    drop(
      "by-hand.md",
      ["---", "repo: acme/other", "source: a hook", "written: 2026-01-01T00:00:00.000Z", "---", "", "friction", ""].join("\n"),
    );

    expect(notes.get("by-hand")).toEqual({
      id: "by-hand",
      repo: "acme/other",
      source: "a hook",
      writtenAt: "2026-01-01T00:00:00.000Z",
      text: "friction",
    });
  });

  it("falls back to the configured repository when the note does not name one", () => {
    // Asking for the repository every time is the kind of ceremony that stops
    // people writing notes at all.
    drop("by-hand.md", "friction\n");

    expect(notes.get("by-hand")?.repo).toBe("acme/widgets");
  });

  it("dates it by when the file appeared, rather than by when it was read", () => {
    drop("by-hand.md", "friction\n");
    const appeared = fs.statSync(path.join(root, "by-hand.md")).mtime.toISOString();

    expect(notes.get("by-hand")?.writtenAt).toBe(appeared);
  });

  it("ignores anything that is not a note", () => {
    drop("README.txt", "not a note");
    fs.mkdirSync(path.join(root, "a-directory"));

    expect(notes.all()).toEqual([]);
  });

  it("keeps a header that never closes as body rather than losing the note", () => {
    drop("by-hand.md", "---\nrepo: acme/other\nfriction\n");

    expect(notes.get("by-hand")?.text).toContain("friction");
  });
});
