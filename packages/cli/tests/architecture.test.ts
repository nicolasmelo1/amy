import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";

/** Every .ts file under a directory, recursively, as { file, text }. */
function sources(root: string): { file: string; text: string }[] {
  return readdirSync(root, { withFileTypes: true }).flatMap((entry) => {
    const file = path.join(root, entry.name);
    if (entry.isDirectory()) return sources(file);
    if (entry.isFile() && entry.name.endsWith(".ts") && !entry.name.endsWith(".d.ts")) {
      return [{ file, text: readFileSync(file, "utf-8") }];
    }
    return [];
  });
}

describe("the CLI's imports", () => {
  // What made the shim: `policy:` was the ticket workflow's type the host
  // kept, `plans:` and `errands:` were two more, and every one of them came
  // in through an import of a workflow package from the CLI. A workflow that
  // is not installed on this machine would not even compile here, and a type
  // the CLI owns is a vocabulary it translates. The line holds for anything a
  // workflow package would be reached by — not only for the types that left.
  it("imports no workflow package, for a type or anything else", () => {
    const reach = sources(path.join(import.meta.dirname, "..", "src"))
      .filter(({ text }) => /from\s+["'].*@amykit\/workflow-/m.test(text))
      .map(({ file, text }) => {
        const line = text.split("\n").findIndex((one) => /from\s+["'].*@amykit\/workflow-/.test(one)) + 1;
        return `${file}:${line}`;
      });

    expect(reach).toEqual([]);
  });

  // The imports rule runs over the CLI's sources wherever this test is asked
  // to: a second CLI that grows an import would be caught by the same file
  // when the suite that carries it runs.
  it("reads its own package's sources", () => {
    expect(sources(path.join(import.meta.dirname, "..", "src")).length).toBeGreaterThan(20);
  });
});