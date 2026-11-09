import { describe, expect, it } from "vitest";
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
