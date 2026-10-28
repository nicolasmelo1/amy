import { describe, expect, it } from "vitest";
import { diff, element, isJson, renderText, sameJson, validate, type Json } from "../src/index.js";

// Each case here is a value the checks once accepted and the wire then
// changed: what a renderer received was not what the view built.
describe("what is accepted is what arrives", () => {
  it("refuses a hole in an array, which would arrive as null", () => {
    expect(isJson(new Array(1))).toBe(false);
    const holed: string[] = [];
    holed[1] = "b";
    expect(isJson(holed)).toBe(false);
    expect(() => element("Log", { lines: new Array(1) })).toThrow("Log.lines is not a JSON value");
  });

  it("refuses a hole in a tree's children, which would arrive as a null child", () => {
    expect(() => validate({ type: "Stack", props: {}, children: new Array(1) })).toThrow("root/0: is not a primitive or text");
  });

  it("refuses props that are not a plain object, which would arrive as something else", () => {
    expect(() => validate({ type: "Stack", props: new Date(0), children: [] })).toThrow("Stack has no props object");
    expect(() => validate({ type: "Stack", props: new Map(), children: [] })).toThrow("Stack has no props object");
    expect(validate({ type: "Stack", props: Object.create(null), children: [] }).type).toBe("Stack");
  });

  it("refuses a gap no renderer can draw", () => {
    for (const gap of [-1, 1.5]) {
      expect(() => element("Stack", { gap })).toThrow("Stack.gap is not of type count");
      expect(() => element("Row", { gap })).toThrow("Row.gap is not of type count");
    }
    expect(renderText(element("Row", { gap: 0 }, ["a", "b"]))).toBe("ab");
  });
});

describe("a change is never mistaken for none", () => {
  it("does not count an inherited key as the other side having it", () => {
    const parsed = JSON.parse('{"__proto__":{}}') as Json;

    expect(sameJson({ workId: "A-1" }, parsed)).toBe(false);
    expect(sameJson(parsed, { workId: "A-1" })).toBe(false);
  });

  it("sends the new intent when only its arguments changed that way", () => {
    const before = element("Button", { intent: { action: "poke", args: { workId: "A-1" } } }, ["poke"]);
    const after = element("Button", { intent: { action: "poke", args: JSON.parse('{"__proto__":{}}') as Json } }, ["poke"]);

    expect(diff(before, after)).toEqual([{ op: "props", path: [], props: after.props }]);
  });
});

describe("what the checks refuse, they refuse by name", () => {
  it("refuses a cycle as not JSON, rather than overflowing the stack", () => {
    const args: Record<string, unknown> = { workId: "A-1" };
    args.self = args;

    expect(isJson(args)).toBe(false);
    expect(() => element("Button", { intent: { action: "poke", args } }, ["poke"])).toThrow("Button.intent is not a JSON value");
  });

  it("still accepts one value shared by two branches", () => {
    const shared = { workId: "A-1" };

    expect(isJson({ a: shared, b: [shared, shared] })).toBe(true);
  });

  it("refuses a value whose serialization hook would send something else", () => {
    const lines = Object.assign(["one"], { toJSON: () => ["two"] });

    expect(isJson(lines)).toBe(false);
    expect(isJson({ toJSON: () => ({}) })).toBe(false);
    expect(() => element("Log", { lines })).toThrow("Log.lines is not a JSON value");
  });

  it("refuses an array carrying keys besides its indexes, which JSON drops", () => {
    expect(isJson(Object.assign(["a"], { extra: "b" }))).toBe(false);
  });

  it.each([["constructor"], ["toString"], ["hasOwnProperty"]])("names %s as a property no primitive has", (key) => {
    expect(() => element("Text", { [key]: "x" })).toThrow(`Text has no property \`${key}\``);
    expect(() => validate({ type: "Text", props: { [key]: "x" }, children: [] })).toThrow(`Text has no property \`${key}\``);
  });
});

describe("a tree the constructor accepts is a tree the receiver accepts", () => {
  it("checks a child built by hand rather than by a tag", () => {
    const button = { type: "Button", props: {}, children: ["poke"] } as const;

    expect(() => element("Stack", {}, [button])).toThrow("Stack/0: Button needs `intent`");
  });

  it("checks a hand-built child all the way down", () => {
    const deep = { type: "Section", props: {}, children: [{ type: "Marquee", props: {}, children: [] }] } as const;

    expect(() => element("Stack", {}, [deep as never])).toThrow('Stack/0/0: "Marquee" is not a primitive');
  });

  it("accepts a child that arrived as data and checks out", () => {
    const parsed = JSON.parse(JSON.stringify(element("Text", {}, ["hi"]))) as never;

    expect(element("Stack", {}, [parsed]).children).toEqual([element("Text", {}, ["hi"])]);
  });
});

describe("what JSON reads is what the checks read", () => {
  it("reads an array's slots, not what its iterator yields", () => {
    const lying = Object.assign([Number.NaN], {
      *[Symbol.iterator]() {
        yield "fine";
      },
    });

    expect(isJson(lying)).toBe(false);
    expect(() => element("Button", { intent: { action: "poke", args: { values: lying } } }, ["poke"])).toThrow(
      "Button.intent is not a JSON value",
    );
  });

  it("refuses props whose hidden toJSON would send something else in their place", () => {
    const props = {};
    Object.defineProperty(props, "toJSON", { value: () => null, enumerable: false });

    expect(() => validate({ type: "Stack", props, children: [] })).toThrow("Stack props are not a JSON value");
  });
});

describe("what a check reads is what JSON sends", () => {
  const hidden = (target: object, key: string, value: unknown) =>
    Object.defineProperty(target, key, { value, enumerable: false });

  it("refuses a required property JSON would not send", () => {
    const props = hidden({}, "href", "https://example.test");

    expect(() => validate({ type: "Link", props, children: ["docs"] })).toThrow("Link props are not a JSON value");
  });

  it("refuses a node whose own fields JSON would not send", () => {
    const node = hidden({ type: "Stack", props: {} }, "children", []);

    expect(() => validate(node)).toThrow("root: carries a property JSON would not send");
  });

  it("refuses a property keyed by a symbol, and a hidden one anywhere in a value", () => {
    expect(isJson({ [Symbol("x")]: 1 })).toBe(false);
    expect(isJson({ args: hidden({}, "workId", "A-1") })).toBe(false);
    expect(isJson(hidden(["a"], "extra", "b"))).toBe(false);
    expect(isJson(["a", "b"])).toBe(true);
  });
});
