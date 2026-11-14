import { describe, expect, it } from "vitest";
import { heldProblems, type Step } from "../held.js";

const plan = (criteria: string, extra = "") => [
  "---",
  "sources:",
  "  - { id: S1, kind: decision, said: \"it should\" }",
  "  - { id: S2, kind: reference, ref: \"plans/other.md\", said: \"the other\" }",
  "touches:",
  "  - src/a.ts",
  `criteria:\n${criteria}`,
  extra,
  "---",
  "# A plan",
  "",
].filter((line) => line !== "").join("\n");

const groomed = plan("  - { id: A1, statement: \"it works\", proof: \"deferred:test:tests/a.test.ts\", sources: [S1] }");
const delivered = plan("  - { id: A1, statement: \"it works\", proof: \"test:tests/a.test.ts\", sources: [S1], done: true }");
const widened = plan("  - { id: A1, statement: \"it works\", proof: \"deferred:test:tests/a.test.ts\", sources: [S1] }", "deviations:\n  - \"src/b.ts: the work outgrew the plan\"");

const step = (id: string, files: string[], plans: Record<string, string | undefined> = {}): Step => ({
  id,
  files,
  plans: new Map(Object.entries(plans)),
});

const judge = (steps: Step[], base: Record<string, string> = {}) => heldProblems({ steps, atBase: (file) => base[file] });

describe("a plan is held to what it said", () => {
  it("lets grooming add a plan in a commit that touches only plans/ and the mechanism catalog", () => {
    const reading = judge([step("c1", ["plans/x.md", "plans/next-steps.md", "docs/mechanisms.yaml"], { "plans/x.md": groomed })]);
    expect(reading.problems).toEqual([]);
    expect(reading.groomed).toEqual(["x.md"]);
  });

  it("lets a commit that touches only delivered notes groom one again, held to the plan rules", () => {
    const reworded = delivered.replace("it works", "it still works");
    const reading = judge(
      [step("c1", ["docs/design/x.md"], { "docs/design/x.md": reworded })],
      { "docs/design/x.md": delivered },
    );
    expect(reading.problems).toEqual([]);
    expect(reading.groomed).toEqual(["x.md"]);
  });

  it("still refuses a delivered note's declaration changed together with code", () => {
    const reworded = delivered.replace("it works", "it still works");
    const { problems } = judge(
      [step("c1", ["docs/design/x.md", "src/a.ts"], { "docs/design/x.md": reworded })],
      { "docs/design/x.md": delivered },
    );
    expect(problems).toEqual([expect.stringMatching(/^c1 changes the declaration of docs\/design\/x\.md together with src\/a\.ts/)]);
  });

  it("refuses a commit that changes a plan's declaration together with code, naming the commit and the plan", () => {
    const { problems } = judge([step("c1", ["plans/x.md", "src/a.ts"], { "plans/x.md": groomed })]);
    expect(problems).toEqual([expect.stringMatching(/^c1 changes the declaration of plans\/x\.md together with src\/a\.ts/)]);
  });

  it("refuses a grooming commit after execution began, and says to groom the plan again", () => {
    const { problems } = judge([
      step("c1", ["plans/x.md"], { "plans/x.md": groomed }),
      step("c2", ["src/a.ts"]),
      step("c3", ["plans/x.md"], { "plans/x.md": widened }),
    ]);
    expect(problems).toEqual([expect.stringMatching(/^c3 changes the declaration of plans\/x\.md after c2 started executing it: .*groom it again from main/)]);
  });

  it("refuses a plan already on main changed while the change executes", () => {
    const { problems } = judge(
      [step("c1", ["src/a.ts"]), step("c2", ["plans/x.md"], { "plans/x.md": widened })],
      { "plans/x.md": groomed },
    );
    expect(problems).toHaveLength(1);
  });

  it("lets delivery move a plan to docs/design, mark it done, drop deferred: and re-point a source at a delivered note", () => {
    const repointed = delivered.replace("plans/other.md", "docs/design/other.md");
    const { problems } = judge([
      step("c1", ["plans/x.md"], { "plans/x.md": groomed }),
      step("c2", ["src/a.ts", "tests/a.test.ts"]),
      step("c3", ["plans/x.md", "docs/design/x.md", "plans/next-steps.md"], { "plans/x.md": undefined, "docs/design/x.md": repointed }),
    ]);
    expect(problems).toEqual([]);
  });

  it("lets a note with no declaration, written before plans had one, change its prose with code", () => {
    const { problems } = judge(
      [step("c1", ["src/a.ts", "docs/design/old.md"], { "docs/design/old.md": "# An old note\n\nMore prose.\n" })],
      { "docs/design/old.md": "# An old note\n" },
    );
    expect(problems).toEqual([]);
  });

  it("still refuses a declaration removed together with code", () => {
    const { problems } = judge(
      [step("c1", ["src/a.ts", "plans/x.md"], { "plans/x.md": "# A plan\n" })],
      { "plans/x.md": groomed },
    );
    expect(problems).toHaveLength(1);
  });

  it("ignores a plan's prose under its declaration", () => {
    const { problems } = judge(
      [step("c1", ["src/a.ts", "plans/x.md"], { "plans/x.md": `${groomed}\nA longer why.\n` })],
      { "plans/x.md": groomed },
    );
    expect(problems).toEqual([]);
  });

  it("judges the working tree as one more step after the last commit", () => {
    const { problems } = judge([
      step("c1", ["plans/x.md"], { "plans/x.md": groomed }),
      step("c2", ["src/a.ts"]),
      step("the working tree", ["plans/x.md", "src/b.ts"], { "plans/x.md": widened }),
    ]);
    expect(problems).toEqual([expect.stringMatching(/^the working tree changes the declaration of plans\/x\.md together with src\/b\.ts/)]);
  });

  it("does not count a plan the change only moved mechanically as groomed", () => {
    const reading = judge(
      [step("c1", ["plans/x.md", "docs/design/x.md"], { "plans/x.md": undefined, "docs/design/x.md": delivered })],
      { "plans/x.md": groomed },
    );
    expect(reading).toEqual({ problems: [], groomed: [] });
  });
});
