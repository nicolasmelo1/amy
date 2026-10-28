import { describe, expect, it } from "vitest";
import { element, PRIMITIVES, validate, type Node } from "../src/index.js";
import { jsx } from "../src/jsx-runtime.js";

describe("the vocabulary is closed", () => {
  it("refuses a primitive outside it, naming it", () => {
    expect(() => element("Marquee")).toThrow(/"Marquee" is not a primitive/);
  });

  it("says what the vocabulary is when it refuses", () => {
    expect(() => element("Marquee")).toThrow(PRIMITIVES.join(", "));
  });

  it("refuses one that arrived as data, naming it and where it was", () => {
    const tree = { type: "Stack", props: {}, children: ["fine", { type: "Marquee", props: {}, children: [] }] };

    expect(() => validate(tree)).toThrow(/root\/1: "Marquee" is not a primitive/);
  });

  it("refuses a property the primitive does not declare", () => {
    expect(() => element("Text", { colour: "red" })).toThrow("Text has no property `colour`");
  });

  it("refuses a value that is not the property's type", () => {
    expect(() => element("Stack", { gap: "wide" })).toThrow("Stack.gap is not of type count");
    expect(() => element("Text", { tone: "loud" })).toThrow("Text.tone is not of type tone");
  });

  it("refuses a primitive missing what it needs", () => {
    expect(() => element("Link", {}, ["docs"])).toThrow("Link needs `href`");
  });

  it("refuses children where a primitive holds none, and nodes where it holds text", () => {
    expect(() => element("Table", { columns: [], rows: [] }, ["x"])).toThrow("Table holds nothing");
    expect(() => element("Text", {}, [element("Badge", {}, ["x"])])).toThrow("Text holds text only");
  });

  it("refuses a tab that is not a section", () => {
    expect(() => element("Tabs", {}, [element("Text", {}, ["x"])])).toThrow("Tabs holds a Section per tab");
    expect(element("Tabs", {}, [element("Section", { title: "one" })]).children).toHaveLength(1);
  });

  it("flattens nested children and turns a number into text", () => {
    expect(element("Stack", {}, [["a", [2, null]], false, undefined, true]).children).toEqual(["a", "2"]);
  });

  it("leaves out a property set to undefined", () => {
    expect(element("Section", { title: undefined }).props).toEqual({});
  });
});

describe("an intent is data", () => {
  const button = jsx("Button", {
    intent: { action: "poke", args: { workId: "A-1", times: 2, why: null, labels: ["a", "b"], deep: { ok: true } } },
    children: "poke",
  });

  it("round-trips through JSON unchanged", () => {
    const back = JSON.parse(JSON.stringify(button)) as unknown;

    expect(back).toEqual(button);
    expect(validate(back)).toEqual(button);
  });

  it("is refused when it carries a closure", () => {
    expect(() => element("Button", { intent: { action: "poke", args: { run: () => 1 } } }, ["poke"])).toThrow(
      "Button.intent is not a JSON value",
    );
  });

  it("is refused when it names no action", () => {
    expect(() => element("Button", { intent: { args: {} } }, ["poke"])).toThrow("Button.intent is not of type intent");
    expect(() => element("Button", { intent: { action: "poke" } }, ["poke"])).toThrow("Button.intent is not of type intent");
  });
});

describe("a tree that arrived as data", () => {
  const good: Node = element("Stack", {}, [element("Text", {}, ["hello"])]);

  it("is returned as the tree it was", () => {
    expect(validate(JSON.parse(JSON.stringify(good)))).toEqual(good);
  });

  it("is refused when it is not a tree", () => {
    expect(() => validate("hello")).toThrow("root: is text, not a primitive");
    expect(() => validate(null)).toThrow("root: is not a primitive or text");
    expect(() => validate([good])).toThrow("root: is not a primitive or text");
  });

  it("is refused when a node carries something no primitive has", () => {
    expect(() => validate({ ...good, onClick: "x" })).toThrow("root: carries `onClick`, which no primitive has");
  });

  it("is refused when a node has no props or no children", () => {
    expect(() => validate({ type: "Stack", children: [] })).toThrow("Stack has no props object");
    expect(() => validate({ type: "Stack", props: {} })).toThrow("Stack has no children list");
  });

  it("is checked all the way down", () => {
    const deep = { type: "Stack", props: {}, children: [{ type: "Text", props: { tone: 3 }, children: [] }] };

    expect(() => validate(deep)).toThrow("root/0: Text.tone is not of type tone");
  });
});
