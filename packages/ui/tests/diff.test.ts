import { describe, expect, it } from "vitest";
import { diff, element, patch, type Child } from "../src/index.js";

const text = (words: string, tone?: "muted") => element("Text", { tone }, [words]);

/** Trees that differ in every way a tree can: text, type, props, and children added, removed and changed. */
const CORPUS: readonly Child[] = [
  "bare text",
  "other text",
  element("Empty", {}, ["nothing open"]),
  element("Stack"),
  element("Stack", {}, [text("one")]),
  element("Stack", {}, [text("one"), text("two")]),
  element("Stack", { gap: 1 }, [text("two"), text("one", "muted")]),
  element("Stack", {}, [text("one"), "loose", element("Row", {}, [text("a"), text("b")])]),
  element("Stack", {}, [element("Row", {}, [text("a")]), text("one")]),
  element("Row", {}, [text("one"), text("two")]),
  element("Section", { title: "work" }, [
    element("Table", { columns: [{ width: 4 }, {}], rows: [["A-1", "DONE"]] }),
    element("List", {}, [text("x"), text("y"), text("z")]),
  ]),
  element("Section", { title: "work" }, [
    element("Table", { columns: [{ width: 4 }, {}], rows: [["A-1", "DONE"], ["A-2", "OPEN"]] }),
    element("List", { ordered: true }, [text("y")]),
  ]),
  element("Tabs", {}, [element("Section", { title: "one" }), element("Section", { title: "two" }, [text("body")])]),
];

describe("diff and patch", () => {
  it("turn the first tree into the second, for every pair in the corpus", () => {
    for (const before of CORPUS) {
      for (const after of CORPUS) {
        expect(patch(before, diff(before, after))).toEqual(after);
      }
    }
  });

  it("send nothing when nothing changed", () => {
    for (const tree of CORPUS) expect(diff(tree, structuredClone(tree))).toEqual([]);
  });

  it("send what changed rather than the window again", () => {
    const before = element("Stack", {}, [text("one"), text("two")]);
    const after = element("Stack", {}, [text("one"), text("two"), text("three")]);

    expect(diff(before, after)).toEqual([{ op: "insert", path: [], index: 2, node: text("three") }]);
    expect(diff(after, before)).toEqual([{ op: "remove", path: [], index: 2 }]);
    expect(diff(text("one"), text("one", "muted"))).toEqual([{ op: "props", path: [], props: { tone: "muted" } }]);
  });

  it("leave the tree they were applied to as it was", () => {
    for (const before of CORPUS) {
      const kept = structuredClone(before);
      for (const after of CORPUS) patch(before, diff(before, after));
      expect(before).toEqual(kept);
    }
  });

  it("survive JSON, which is how a renderer receives them", () => {
    const [before, after] = [CORPUS[7] as Child, CORPUS[11] as Child];
    const sent = JSON.parse(JSON.stringify(diff(before, after))) as ReturnType<typeof diff>;

    expect(patch(before, sent)).toEqual(after);
  });

  it("refuse a patch for a place the tree does not have", () => {
    expect(() => patch("text", [{ op: "remove", path: [0], index: 0 }])).toThrow("text holds no children");
    expect(() => patch(element("Stack"), [{ op: "remove", path: [3], index: 0 }])).toThrow("no child 3 under Stack");
  });
});
