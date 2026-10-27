import { describe, expect, it } from "vitest";
import { element, renderText, validate, type Child } from "../src/index.js";

const draw = (tree: Child) => renderText(tree);

describe("the text renderer", () => {
  const snapshot = element("Stack", { gap: 1 }, [
    element("Section", { title: "work" }, [
      element("Table", { columns: [{ label: "id", width: 6 }, { label: "state", width: 8 }, { label: "pr", optional: true }], rows: [["A-1", "DONE", "#4"], ["A-2", "OPEN"]] }),
    ]),
    element("Row", {}, [element("Badge", { tone: "warning" }, ["2 waiting"]), element("Button", { intent: { action: "poke", args: {} } }, ["poke"])]),
  ]);

  it("draws the same snapshot as byte-identical text, every time", () => {
    const first = draw(snapshot);

    expect(draw(snapshot)).toBe(first);
    expect(draw(validate(JSON.parse(JSON.stringify(snapshot))))).toBe(first);
    expect(Buffer.from(draw(structuredClone(snapshot)))).toEqual(Buffer.from(first));
  });

  it("draws a stack a line per child, with the gap it asks for between them", () => {
    expect(draw(element("Stack", {}, ["a", "b"]))).toBe("a\nb");
    expect(draw(element("Stack", { gap: 2 }, ["a", "b"]))).toBe("a\n\n\nb");
  });

  it("draws a row on one line, a space apart unless it asks otherwise", () => {
    expect(draw(element("Row", {}, ["a", "b"]))).toBe("a b");
    expect(draw(element("Row", { gap: 3 }, ["a", "b"]))).toBe("a   b");
  });

  it("puts a section's title above what it holds", () => {
    expect(draw(element("Section", { title: "work" }, ["a"]))).toBe("work\na");
    expect(draw(element("Section", {}, ["a"]))).toBe("a");
  });

  it("draws text, badges, buttons and empty states as their words", () => {
    expect(draw(element("Text", {}, ["a", "b"]))).toBe("ab");
    expect(draw(element("Badge", {}, ["new"]))).toBe("(new)");
    expect(draw(element("Button", { intent: { action: "poke", args: {} } }, ["poke"]))).toBe("[poke]");
    expect(draw(element("Empty", {}, ["nothing open"]))).toBe("nothing open");
  });

  it("marks each item of a list, and keeps an item's later lines under its first", () => {
    expect(draw(element("List", {}, ["a", element("Stack", {}, ["b", "c"])]))).toBe("- a\n- b\n  c");
    expect(draw(element("List", { ordered: true }, ["a", "b"]))).toBe("1. a\n2. b");
  });

  describe("a table", () => {
    const columns = [{ width: 4 }, { width: 6 }, { width: 5, optional: true }, { optional: true }];

    it("pads each cell to its column and puts a space between them", () => {
      expect(draw(element("Table", { columns, rows: [["A-1", "OPEN", "api", "#1"]] }))).toBe("A-1  OPEN   api   #1");
    });

    it("ends a row whose optional columns are blank where its required ones do, separator kept", () => {
      expect(draw(element("Table", { columns, rows: [["A-1", "OPEN"]] }))).toBe("A-1  OPEN   ");
      expect(draw(element("Table", { columns, rows: [["A-1", "OPEN", "", "#1"]] }))).toBe("A-1  OPEN         #1");
    });

    it("lets a cell longer than its column push the rest along", () => {
      expect(draw(element("Table", { columns: [{ width: 2 }, {}], rows: [["LONG", "x"]] }))).toBe("LONG x");
    });

    it("draws a header only when a column is labelled", () => {
      expect(draw(element("Table", { columns: [{ label: "id", width: 4 }, { label: "state" }], rows: [["A-1", "OPEN"]] }))).toBe(
        "id   state\nA-1  OPEN",
      );
    });

    it("trims a row that is optional from its first column", () => {
      expect(draw(element("Table", { columns: [{ width: 4, optional: true }], rows: [["a"]] }))).toBe("a");
    });
  });

  it("draws tabs as every tab, a blank line apart, because which one is open is the renderer's", () => {
    const tabs = element("Tabs", {}, [element("Section", { title: "one" }, ["a"]), element("Section", { title: "two" }, ["b"])]);

    expect(draw(tabs)).toBe("one\na\n\ntwo\nb");
  });

  it("draws a link as its words and where it goes", () => {
    expect(draw(element("Link", { href: "https://example.test" }, ["docs"]))).toBe("docs <https://example.test>");
    expect(draw(element("Link", { href: "https://example.test" }))).toBe("https://example.test");
  });

  it("draws an input as its name and what it holds", () => {
    expect(draw(element("Input", { name: "reply", value: "yes" }))).toBe("reply: yes");
    expect(draw(element("Input", { name: "reply", placeholder: "say something" }))).toBe("reply: <say something>");
    expect(draw(element("Input", { name: "reply" }))).toBe("reply:");
  });

  it("draws a timeline an entry per line", () => {
    expect(draw(element("Timeline", { entries: [{ at: "10:00", label: "found" }, { at: "10:05", label: "built" }] }))).toBe(
      "10:00  found\n10:05  built",
    );
  });

  it("draws a state machine as a line, the current state marked", () => {
    expect(draw(element("StateMachine", { states: ["A", "B", "C"], current: "B", transitions: [{ from: "A", to: "B" }] }))).toBe(
      "A → [B] → C",
    );
  });

  it("draws a log, code and a diff as they are", () => {
    expect(draw(element("Log", { lines: ["one", "two"] }))).toBe("one\ntwo");
    expect(draw(element("Code", { language: "ts" }, ["const a = 1;"]))).toBe("const a = 1;");
    expect(draw(element("Diff", {}, ["-a\n+b"]))).toBe("-a\n+b");
  });
});
