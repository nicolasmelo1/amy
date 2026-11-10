import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { ROOT } from "../lib/repo.js";
import { exampleOpeningIn, limitIn, said } from "../prose.js";
import { spliceReference } from "../render/readme.js";

const OPEN = "<!-- amy:generated reference -->";
const CLOSE = "<!-- amy:end reference -->";

/** An example's README is prose somebody wrote, around one block the generator owns. */
describe("an example's README keeps its prose", () => {
  it("rewrites only what sits between the markers", () => {
    const before = `# errand\n\nWritten by hand.\n\n${OPEN}\nold table\n${CLOSE}\n\nAlso by hand.\n`;

    expect(spliceReference(before, "examples/workflow-errand/README.md", "new table")).toBe(
      `# errand\n\nWritten by hand.\n\n${OPEN}\n\nnew table\n\n${CLOSE}\n\nAlso by hand.\n`,
    );
  });

  it("refuses a README with no block, naming it", () => {
    expect(() => spliceReference("# errand\n\nOnly prose.\n", "examples/workflow-errand/README.md", "table")).toThrow(
      /examples\/workflow-errand\/README\.md.*amy:generated reference/,
    );
  });

  it("refuses a block that never closes, rather than losing what follows it", () => {
    const before = `# errand\n\n${OPEN}\nold table\n\n## Written after the block\n`;

    expect(() => spliceReference(before, "examples/workflow-errand/README.md", "table")).toThrow(/never closes it/);
  });
});

const examples = fs
  .readdirSync(path.join(ROOT, "examples"))
  .map((entry) => `examples/${entry}/README.md`)
  .filter((file) => fs.existsSync(path.join(ROOT, file)));

describe("an example's introduction", () => {
  it("opens with one sentence saying what it does, and stays under its limit, on every example", () => {
    expect(examples.length).toBeGreaterThan(0);
    const found = examples.flatMap((file) => {
      const text = fs.readFileSync(path.join(ROOT, file), "utf8");
      return [...exampleOpeningIn(file, text), ...limitIn(file, text)];
    });
    expect(found.map(said)).toEqual([]);
  });

  it("fails when it opens with two sentences, a table or a heading", () => {
    const file = "examples/workflow-errand/README.md";
    expect(exampleOpeningIn(file, `# errand\n\nIt runs errands.\n\n${OPEN}\n${CLOSE}\n`)).toEqual([]);
    expect(exampleOpeningIn(file, `# errand\n\nIt runs errands. It is small.\n`)).toHaveLength(1);
    expect(exampleOpeningIn(file, `# errand\n\n| a | b |\n`)).toHaveLength(1);
    expect(exampleOpeningIn(file, `# errand\n\n## Why\n`)).toHaveLength(1);
  });

  it("fails over its limit, naming the size and the limit", () => {
    const [finding] = limitIn("examples/workflow-errand/README.md", `# errand\n\n${"word ".repeat(400)}.\n\n${OPEN}\n${CLOSE}\n`);
    expect(finding?.detail).toMatch(/over the example limit of 1500/);
  });
});
