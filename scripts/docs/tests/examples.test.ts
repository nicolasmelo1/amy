import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { ROOT } from "../lib/repo.js";
import { fenceProblems, fenceTypeErrors, isCheckedPage, pagesInScope, said } from "../prose.js";

const pages = Object.fromEntries(
  pagesInScope()
    .filter(isCheckedPage)
    .map((file) => [file, fs.readFileSync(path.join(ROOT, file), "utf8")]),
);

/** Every code block a guide or a concept page shows compiles against the core as it is. */
describe("the code on the guide and concept pages", () => {
  it("has guide and concept pages to check", () => {
    expect(Object.keys(pages).some((file) => file.startsWith("docs/guides/"))).toBe(true);
    expect(Object.keys(pages).some((file) => file.startsWith("docs/concepts/"))).toBe(true);
  });

  it("typechecks, every ts block on every page", async () => {
    expect((await fenceTypeErrors(pages)).map(said)).toEqual([]);
  }, 120_000);

  it("is a ts block on every page that teaches code, opted out only by the named marker", () => {
    expect(Object.entries(pages).flatMap(([file, text]) => fenceProblems(file, text)).map(said)).toEqual([]);
  });
});

describe("a page that stops showing its code", () => {
  const page = "# Write a plugin\n\nProse.\n\n```ts\nconst one: number = 1;\n```\n";
  const file = "docs/guides/write-a-plugin.md";

  it("passes as it is", () => {
    expect(fenceProblems(file, page)).toEqual([]);
  });

  it("fails with its ts fences removed, naming the page", () => {
    const [finding] = fenceProblems(file, "# Write a plugin\n\nProse.\n");
    expect(finding?.file).toBe(file);
    expect(finding?.detail).toMatch(/yields no checked ts block/);
  });

  it("fails with a fence relabelled, whatever it is relabelled to", () => {
    for (const label of ["js", "typescript", "tsx"]) {
      expect(fenceProblems(file, page.replace("```ts", `\`\`\`${label}`)).map((one) => one.file)).toContain(file);
    }
    expect(fenceProblems(file, page.replace("```ts", "```")).map((one) => one.detail).join()).toMatch(/unlabelled/);
  });

  it("fails with a block skipped any way but the named marker", () => {
    expect(fenceProblems(file, page.replace("```ts", "```ts skip")).map((one) => one.detail).join()).toMatch(/not how a block opts out/);
    expect(fenceProblems(file, page.replace("const", "// @ts-nocheck\nconst")).map((one) => one.detail).join()).toMatch(/silenced/);
    expect(fenceProblems(file, page.replace("```ts", "<!-- skip -->\n```ts"))).toEqual([]);
  });

  it("with only an untyped block, yields nothing and fails", () => {
    const untyped = page.replace("```ts", "<!-- amy:untyped a fragment of a larger file -->\n```ts");
    expect(fenceProblems(file, untyped).map((one) => one.detail).join()).toMatch(/yields no checked ts block/);
  });

  it("reports a block that does not compile at its own line", async () => {
    const broken = { [file]: "# Write a plugin\n\n```ts\nconst one: number = \"one\";\n```\n" };
    const [finding] = await fenceTypeErrors(broken);
    expect(finding?.file).toBe(file);
    expect(finding?.line).toBe(4);
  }, 120_000);

  it("resolves a named block's import of another named block on the same page", async () => {
    const two = {
      [file]: [
        "# Write a plugin",
        "",
        "<!-- amy:file index.ts -->",
        "```ts",
        'import { decide } from "./decide.ts";',
        "export const used: number = decide;",
        "```",
        "",
        "<!-- amy:file decide.ts -->",
        "```ts",
        "export const decide = 1;",
        "```",
        "",
      ].join("\n"),
    };
    expect((await fenceTypeErrors(two)).map(said)).toEqual([]);
  }, 120_000);
});
