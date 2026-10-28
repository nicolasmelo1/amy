import { describe, expect, it } from "vitest";
import { diff, element, isJson, patch, renderText, sameJson, validate, type Child, type Json } from "../src/index.js";

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

describe("what was checked is what is kept", () => {
  it("keeps the value a getter gave the check, not what it answers next", () => {
    let reads = 0;
    const args = {
      get workId() {
        reads += 1;
        return reads === 1 ? "A-1" : Number.NaN;
      },
    };
    const button = element("Button", { intent: { action: "poke", args } }, ["poke"]);

    expect(JSON.parse(JSON.stringify(button))).toEqual(button);
    expect((button.props.intent as { args: { workId: string } }).args.workId).toBe("A-1");
  });

  it("is not changed by a mutation of what it was built from", () => {
    const columns = [{ width: 4 }];
    const table = element("Table", { columns, rows: [] });
    columns[0] = { width: -1 };

    expect(table.props.columns).toEqual([{ width: 4 }]);
  });

  it("cannot be changed after it was checked, so the cache that trusts it stays right", () => {
    const tree = validate({ type: "Stack", props: { gap: 1 }, children: [{ type: "Text", props: {}, children: ["hi"] }] });

    expect(Object.isFrozen(tree)).toBe(true);
    expect(Object.isFrozen(tree.props)).toBe(true);
    expect(Object.isFrozen(tree.children)).toBe(true);
    expect(Object.isFrozen(tree.children[0])).toBe(true);
    expect(() => (tree.children as Child[]).push(element("Badge", {}, ["x"]))).toThrow(TypeError);
  });

  it("keeps a key named __proto__ as a key", () => {
    const parsed = JSON.parse('{"__proto__":{"a":1}}') as Json;
    const button = element("Button", { intent: { action: "poke", args: parsed } }, ["poke"]);

    expect(JSON.stringify(button.props.intent)).toBe('{"action":"poke","args":{"__proto__":{"a":1}}}');
  });
});

describe("what a table accepts is what it draws", () => {
  it("refuses a row with a cell outside every column, rather than dropping it", () => {
    expect(() => element("Table", { columns: [{}], rows: [["a", "b"]] })).toThrow("Table row 0 has 2 cells for 1 columns");
    expect(() => validate({ type: "Table", props: { columns: [], rows: [["a"]] }, children: [] })).toThrow(
      "root: Table row 0 has 1 cells for 0 columns",
    );
  });

  it("still accepts a row that leaves its last cells blank", () => {
    expect(renderText(element("Table", { columns: [{ width: 2 }, {}], rows: [["a"]] }))).toBe("a  ");
  });
});

describe("what cannot be a tree is refused, not recursed into", () => {
  it("refuses a node that holds itself", () => {
    const loop = { type: "Stack", props: {}, children: [] as unknown[] };
    loop.children.push(loop);

    expect(() => validate(loop)).toThrow("root/0: holds itself, which no tree can");
    expect(() => element("Section", {}, [loop as never])).toThrow("Section/0/0: holds itself, which no tree can");
  });

  it("still accepts one node shared by two branches", () => {
    const shared = { type: "Text", props: {}, children: ["hi"] };

    expect(validate({ type: "Stack", props: {}, children: [shared, shared] }).children).toHaveLength(2);
  });
});

describe("a patch for a place the tree does not have is refused, not skipped", () => {
  const tree = element("Stack", {}, [element("Text", {}, ["a"])]);

  it.each([
    [{ op: "remove", path: [], index: 1 }, "no child 1 to remove under Stack"],
    [{ op: "remove", path: [], index: -1 }, "no child -1 to remove under Stack"],
    [{ op: "insert", path: [], index: 2, node: "x" }, "no place 2 to insert under Stack"],
    [{ op: "insert", path: [], index: 0.5, node: "x" }, "no place 0.5 to insert under Stack"],
    [{ op: "replace", path: [-1], node: "x" }, "no child -1 under Stack"],
    [{ op: "props", path: [1.5], props: {} }, "no child 1.5 under Stack"],
  ] as const)("%j", (change, said) => {
    expect(() => patch(tree, [change])).toThrow(said);
  });

  it("still appends at the end", () => {
    expect(patch(tree, [{ op: "insert", path: [], index: 1, node: "b" }])).toEqual(element("Stack", {}, [element("Text", {}, ["a"]), "b"]));
  });
});
