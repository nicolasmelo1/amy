import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { DeniedTerm, findPrivateReferences, PrivateRefsInput } from "../src/private-refs.js";

// The terms this repository actually forbids are never written here. A test
// that spells them out puts them back in the tree the check exists to keep
// them out of — and would be reported by the check on its next run. The rule
// is general, so a term nobody is hiding proves it just as well.
const digest = (value: string): string => createHash("sha256").update(value).digest("hex");
const deny = (term: string): DeniedTerm => ({ length: term.length, sha256: digest(term) });

function input(overrides: Partial<PrivateRefsInput> = {}): PrivateRefsInput {
  return { files: {}, denied: [deny("acme")], digest, ...overrides };
}

describe("findPrivateReferences", () => {
  it("passes a tree that names nothing forbidden", () => {
    const found = findPrivateReferences(
      input({ files: { "README.md": "a machine that walks a ticket to QA" } }),
    );

    expect(found).toEqual([]);
  });

  it("finds a term standing on its own, at its line", () => {
    const found = findPrivateReferences(
      input({ files: { "docs/note.md": "first line\nwritten for Acme after a defect" } }),
    );

    expect(found).toEqual([{ file: "docs/note.md", line: 2, word: "acme" }]);
  });

  it("finds a term glued into a longer identifier", () => {
    const found = findPrivateReferences(
      input({ files: { "src/deps.ts": "export interface AcmeDeps {}" } }),
    );

    expect(found).toEqual([{ file: "src/deps.ts", line: 1, word: "acmedeps" }]);
  });

  it("finds a term a separator broke apart", () => {
    const found = findPrivateReferences(
      input({ files: { "plans/a.md": "`ACME-7716` reached a real ticket" } }),
    );

    expect(found).toEqual([{ file: "plans/a.md", line: 1, word: "acme" }]);
  });

  it("finds a term inside a longer private name", () => {
    const found = findPrivateReferences(
      input({ files: { "package.json": '"acmecorp-frontend"' } }),
    );

    expect(found).toEqual([{ file: "package.json", line: 1, word: "acmecorp" }]);
  });

  it("reports every occurrence, so one fix does not hide the next", () => {
    const found = findPrivateReferences(
      input({ files: { "a.md": "acme\nnothing\nacme again", "b.md": "acme" } }),
    );

    expect(found).toEqual([
      { file: "a.md", line: 1, word: "acme" },
      { file: "a.md", line: 3, word: "acme" },
      { file: "b.md", line: 1, word: "acme" },
    ]);
  });

  it("judges terms of several lengths against the same word", () => {
    const found = findPrivateReferences(
      input({
        denied: [deny("acme"), deny("northwind")],
        files: { "a.md": "the northwind board" },
      }),
    );

    expect(found).toEqual([{ file: "a.md", line: 1, word: "northwind" }]);
  });

  it("is blind to case, because a leak does not care how it was typed", () => {
    const found = findPrivateReferences(input({ files: { "a.md": "AcMe" } }));

    expect(found).toEqual([{ file: "a.md", line: 1, word: "acme" }]);
  });

  it("does not report a word that merely shares letters with a term", () => {
    const found = findPrivateReferences(input({ files: { "a.md": "came acre mace" } }));

    expect(found).toEqual([]);
  });

  it("finds nothing when no term is denied, and says so by returning nothing", () => {
    const found = findPrivateReferences(input({ denied: [], files: { "a.md": "acme" } }));

    expect(found).toEqual([]);
  });

  it("asks for one digest per distinct word, however often the word repeats", () => {
    const asked: string[] = [];
    const counting = (value: string): string => {
      asked.push(value);
      return digest(value);
    };

    findPrivateReferences(
      input({ digest: counting, files: { "a.md": "ticket ticket ticket ticket" } }),
    );

    expect(new Set(asked).size).toBe(asked.length);
  });
});
