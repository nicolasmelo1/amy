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
