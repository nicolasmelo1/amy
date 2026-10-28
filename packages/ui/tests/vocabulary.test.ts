import { describe, expect, it } from "vitest";
import { catalogue, element, fitsPropType, isJson, PRIMITIVES, PROP_SCHEMAS, sameJson, VOCABULARY, type PropType } from "../src/index.js";

const PROP_TYPES = Object.keys(PROP_SCHEMAS) as PropType[];

/** Values a property must never hold, whatever its type: none of them is JSON. */
const NOT_JSON: readonly unknown[] = [() => "x", Number.NaN, Number.POSITIVE_INFINITY, new Date(0), new Map(), Symbol("x"), 1n, undefined];

describe("the vocabulary maps one to one onto a component catalogue", () => {
  it("declares every primitive, and nothing beyond them", () => {
    expect(Object.keys(VOCABULARY).sort()).toEqual([...PRIMITIVES].sort());
  });

  it("publishes one component per primitive, each named once", () => {
    const names = catalogue().map((component) => component.name);

    expect(names).toEqual([...PRIMITIVES]);
    expect(new Set(names).size).toBe(names.length);
  });

  it("is JSON only: the catalogue survives JSON unchanged", () => {
    const published = catalogue();

    expect(isJson(published)).toBe(true);
    expect(JSON.parse(JSON.stringify(published))).toEqual(published);
  });

  it("describes every property of every primitive by JSON Schema, and closes each one", () => {
    for (const component of catalogue()) {
      const schema = component.props as { type: string; properties: Record<string, unknown>; additionalProperties: boolean };
      expect(schema.type, component.name).toBe("object");
      expect(schema.additionalProperties, component.name).toBe(false);
      expect(Object.keys(schema.properties), component.name).toEqual(Object.keys(VOCABULARY[component.name].props));
    }
  });

  it("names what each primitive requires in its schema", () => {
    const table = catalogue().find((component) => component.name === "Table");

    expect((table?.props as { required: string[] }).required).toEqual(["columns", "rows"]);
  });
});

describe("every property is a JSON value only", () => {
  it.each(PROP_TYPES)("a %s property holds nothing that is not JSON", (type) => {
    for (const value of NOT_JSON) expect(fitsPropType(type, value), String(value)).toBe(false);
  });

  it.each(PRIMITIVES)("%s refuses a function in any of its properties", (name) => {
    for (const key of Object.keys(VOCABULARY[name].props)) {
      expect(() => element(name, { [key]: () => "x" })).toThrow(`${name}.${key} is not a JSON value`);
    }
  });

  it("accepts each shape a structured property declares", () => {
    expect(fitsPropType("columns", [{ label: "id", width: 28 }, { optional: true }])).toBe(true);
    expect(fitsPropType("columns", [{ width: -1 }])).toBe(false);
    expect(fitsPropType("columns", [{ width: 1.5 }])).toBe(false);
    expect(fitsPropType("columns", [{ colour: "red" }])).toBe(false);
    expect(fitsPropType("rows", [["a", "b"], []])).toBe(true);
    expect(fitsPropType("rows", [["a", 1]])).toBe(false);
    expect(fitsPropType("entries", [{ at: "t", label: "x" }])).toBe(true);
    expect(fitsPropType("entries", [{ at: "t" }])).toBe(false);
    expect(fitsPropType("transitions", [{ from: "A", to: "B" }])).toBe(true);
    expect(fitsPropType("transitions", [["A", "B"]])).toBe(false);
    expect(fitsPropType("strings", ["a", 1])).toBe(false);
    expect(fitsPropType("boolean", true)).toBe(true);
  });
});

describe("JSON", () => {
  it("is a plain value all the way down", () => {
    expect(isJson({ a: [1, "b", null, { c: false }] })).toBe(true);
    expect(isJson(Object.create(null))).toBe(true);
    expect(isJson({ a: [() => 1] })).toBe(false);
    expect(isJson(new (class Thing {})())).toBe(false);
  });

  it("compares by value, key order aside", () => {
    expect(sameJson({ a: 1, b: [1, 2] }, { b: [1, 2], a: 1 })).toBe(true);
    expect(sameJson({ a: 1 }, { a: 1, b: 2 })).toBe(false);
    expect(sameJson({ a: 1 }, { b: 1 })).toBe(false);
    expect(sameJson([1], { 0: 1 })).toBe(false);
    expect(sameJson([1, 2], [1, 3])).toBe(false);
    expect(sameJson(null, {})).toBe(false);
  });
});
