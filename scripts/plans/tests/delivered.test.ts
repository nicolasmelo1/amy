import { describe, expect, it } from "vitest";
import { deliveredPromises } from "../delivered.js";
import { describeAdvanced, plansAdvancedBy } from "../advanced.js";

const judge = (note: string, required: string[] = ["gate.it_works"], existing: string[] = ["tests/it.test.ts"]) =>
  deliveredPromises({
    notes: { "docs/design/x.md": note },
    requiredAssertions: new Set(required),
    exists: (file) => existing.includes(file),
  });

describe("a delivered plan", () => {
  it("passes when every criterion is ticked and every proof it cites exists", () => {
    expect(judge([
      "- [x] It works (proof: assertion:gate.it_works)",
      "- [x] It is tested",
      "      (proof: test:tests/it.test.ts)",
    ].join("\n"))).toEqual([]);
  });

  it("reads a declared criterion as a checkbox: done is ticked, proof is its marker", () => {
    expect(judge([
      "---",
      "criteria:",
      "  - { id: A1, statement: it works, proof: \"assertion:gate.it_works\", done: true }",
      "  - { id: A2, statement: it is tested, proof: \"test:tests/gone.test.ts\" }",
      "exit: it works",
      "---",
      "# X",
    ].join("\n"))).toEqual([
      "docs/design/x.md:4 is delivered with a criterion still open — prove it and tick it, or move it to a plan in plans/",
      "docs/design/x.md:4 cites tests/gone.test.ts, which does not exist",
    ]);
  });

  it("refuses a criterion left open, naming the line", () => {
    expect(judge("intro\n\n- [ ] It works (proof: assertion:gate.it_works)")).toEqual([
      "docs/design/x.md:3 is delivered with a criterion still open — prove it and tick it, or move it to a plan in plans/",
    ]);
  });

  it("refuses a proof that was deferred or never specified, even ticked", () => {
    const problems = judge([
      "- [x] Later (proof: deferred:test:tests/it.test.ts)",
      "- [x] Elsewhere (proof: unspecified:somebody else's repository)",
    ].join("\n"));
    expect(problems).toHaveLength(2);
    expect(problems[0]).toContain("cites a deferred proof");
    expect(problems[1]).toContain("cites a unspecified proof");
  });

  it("refuses an assertion no gate requires, and a test that does not exist", () => {
    expect(judge("- [x] A (proof: assertion:gate.nobody_runs_this, and test:tests/gone.test.ts for the rest)")).toEqual([
      "docs/design/x.md:1 cites the assertion gate.nobody_runs_this, and no gate requires it, so nothing proves it",
      "docs/design/x.md:1 cites tests/gone.test.ts, which does not exist",
    ]);
  });

  it("refuses a criterion that names no proof, open or ticked, without borrowing the next one's", () => {
    expect(judge([
      "- [ ] Nobody proved this",
      "- [x] Nor this",
      "- [ ] This one is proven (proof: assertion:gate.it_works)",
    ].join("\n"))).toEqual([
      "docs/design/x.md:1 is delivered with a criterion still open — prove it and tick it, or move it to a plan in plans/",
      "docs/design/x.md:1 names no proof, so nothing says it holds — cite the check that proves it",
      "docs/design/x.md:2 names no proof, so nothing says it holds — cite the check that proves it",
      "docs/design/x.md:3 is delivered with a criterion still open — prove it and tick it, or move it to a plan in plans/",
    ]);
  });

  it("checks every proof a criterion names, not only the first", () => {
    expect(judge([
      "- [x] Both halves (proof: assertion:gate.it_works)",
      "      and the other (proof: deferred:test:tests/later.test.ts)",
    ].join("\n"))).toEqual([
      "docs/design/x.md:1 cites a deferred proof, so it was delivered without one — build it, or move the criterion to a plan in plans/",
    ]);
  });

  it("checks a test at the repository's root like any other path", () => {
    expect(judge("- [x] A (proof: test:missing.test.ts)")).toEqual([
      "docs/design/x.md:1 cites missing.test.ts, which does not exist",
    ]);
  });

  it("reads a proof that cites two things separated by a comma", () => {
    expect(judge("- [x] A (proof: assertion:gate.it_works, and test:tests/it.test.ts for all five)")).toEqual([]);
  });
});

describe("the plans a change advances", () => {
  const gates = [
    { name: "errand", plan: "docs/design/the-errand.md", activation: ["packages/workflow-errand/src/**"] },
    { name: "core", plan: "docs/design/the-core.md", activation: ["packages/core/src/**"] },
  ];

  it("names the plan of every gate whose paths the change touched, and every plan it edited", () => {
    expect(plansAdvancedBy(
      ["packages/workflow-errand/src/actions.ts", "plans/a-new-one.md", "plans/next-steps.md", "README.md"],
      gates,
    )).toEqual([
      { plan: "docs/design/the-errand.md", via: ["errand"] },
      { plan: "plans/a-new-one.md", via: ["edited"] },
    ]);
  });

  it("says so when the change advances nothing", () => {
    expect(describeAdvanced(plansAdvancedBy(["README.md"], gates))).toContain("None");
  });
});
