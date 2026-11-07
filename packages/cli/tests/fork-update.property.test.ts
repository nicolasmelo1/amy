import { describe, expect, it } from "vitest";
import fc from "fast-check";
import { MergeLabels, mergeText } from "../src/fork.js";

/** The falsifier this property must reject, planted only when the rule names it. */
const FALSIFIER = "take-upstream-whole";
const planted = process.env.SF_FALSIFIER === FALSIFIER;

/** The merge under test, or the update that simply takes the new version whole. */
const merge = (base: string, ours: string, theirs: string, labels: MergeLabels) =>
  planted ? { text: theirs, conflicted: false } : mergeText(base, ours, theirs, labels);

const LABELS: MergeLabels = { ours: "fork", base: "base", theirs: "upstream" };

/** What happens to one line of the base: kept, replaced, removed, or followed by new lines. */
type Edit = { kind: "keep" } | { kind: "replace"; lines: string[] } | { kind: "delete" } | { kind: "insert"; lines: string[] };

/**
 * A line of source. Drawn from a small vocabulary on purpose: real files
 * repeat `}` and blank lines, and a merge that matches lines by content has
 * to keep a repeated line in the right place.
 */
const line = fc.oneof(
  fc.constantFrom("}", "", "  return value;", "import { a } from \"b\";", "// note"),
  fc.array(fc.stringMatching(/^[a-z]{1,8}$/), { minLength: 1, maxLength: 4 }).map((words) => words.join(" ")),
);

/**
 * A base whose every line is its own. Where an edit sits among identical
 * neighbours is not something the text records — deleting the first of two
 * equal lines and deleting the second leave the same file — so a line merge,
 * git's included, may read it as touching the line the other side changed.
 */
const distinct = fc.uniqueArray(line, { minLength: 3, maxLength: 40 });

const edit = (side: string): fc.Arbitrary<Edit> => fc.oneof(
  fc.array(fc.stringMatching(/^[a-z]{1,6}$/), { minLength: 1, maxLength: 3 }).map((words): Edit => ({ kind: "replace", lines: words.map((word) => `${side} ${word}`) })),
  fc.constant<Edit>({ kind: "delete" }),
  fc.array(fc.stringMatching(/^[a-z]{1,6}$/), { minLength: 1, maxLength: 3 }).map((words): Edit => ({ kind: "insert", lines: words.map((word) => `${side} ${word}`) })),
);

/**
 * A base, and two sets of edits to it that touch different lines: every line
 * one side edits has an untouched line on both sides of it before the other
 * side's next edit, which is what "other lines" means to a line merge. The
 * edited lines are the person's and the upstream's own words, so each side's
 * change is recognisable in the result.
 */
const scenario = (lines: fc.Arbitrary<string[]>) => lines.chain((base) =>
  fc.array(fc.constantFrom<"none" | "ours" | "theirs">("none", "none", "ours", "theirs"), { minLength: base.length, maxLength: base.length })
    .map((owners) => owners.map((owner, index) => {
      const near = (other: string) => owners[index - 1] === other || owners[index + 1] === other;
      if (owner === "ours" && near("theirs")) return "none";
      if (owner === "theirs" && near("ours")) return "none";
      return owner;
    }))
    .chain((owners) => fc.tuple(
      fc.constant(base),
      fc.tuple(...owners.map((owner) => (owner === "none" ? fc.constant<Edit>({ kind: "keep" }) : edit(owner === "ours" ? "mine" : "theirs")))),
      fc.constant(owners),
    )));

function apply(base: readonly string[], edits: readonly Edit[], owners: readonly string[], who: string): string[] {
  return base.flatMap((original, index) => {
    const one = owners[index] === who ? edits[index]! : { kind: "keep" as const };
    if (one.kind === "keep") return [original];
    if (one.kind === "replace") return one.lines;
    if (one.kind === "delete") return [];
    return [original, ...one.lines];
  });
}

/** The base as each side left it, and as both together should: one side's lines as it edited them. */
function sides([base, edits, owners]: [string[], Edit[], string[]]) {
  return {
    base: base.join("\n"),
    ours: apply(base, edits, owners, "ours").join("\n"),
    theirs: apply(base, edits, owners, "theirs").join("\n"),
    both: base.flatMap((original, index) => apply([original], [edits[index]!], [owners[index]!], owners[index]!)).join("\n"),
  };
}

describe("amy update merging a fork", () => {
  it("keeps every edit a person made and takes every upstream change that touches other lines", () => {
    fc.assert(fc.property(scenario(distinct), (drawn) => {
      const { base, ours, theirs, both } = sides(drawn);

      const merged = merge(base, ours, theirs, LABELS);

      expect(merged.conflicted).toBe(false);
      expect(merged.text).toBe(both);
    }));
  });

  it("never loses a line either side wrote, even among repeated lines: it merges exactly, or it stops", () => {
    fc.assert(fc.property(scenario(fc.array(line, { minLength: 3, maxLength: 40 })), (drawn) => {
      const { base, ours, theirs, both } = sides(drawn);

      const merged = merge(base, ours, theirs, LABELS);

      if (!merged.conflicted) expect(merged.text).toBe(both);
    }));
  });
});
