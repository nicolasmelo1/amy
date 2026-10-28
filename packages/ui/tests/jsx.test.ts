import fs from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { element, renderText } from "../src/index.js";
import { jsx, jsxs } from "../src/jsx-runtime.js";
import { jsxDEV } from "../src/jsx-dev-runtime.js";
import { workView } from "./fixtures/work-view.js";

const work = {
  id: "A-1",
  state: "IMPLEMENTING",
  states: ["DISCOVERED", "IMPLEMENTING", "DONE"],
  waiting: true,
  attempts: [["IMPLEMENTING", 2]] as const,
};

describe("a view written in JSX", () => {
  it("produces a tree of primitives: data, not something mounted", () => {
    expect(workView(work)).toEqual(
      element("Stack", { gap: 1 }, [
        element("Text", { tone: "warning" }, ["A-1", " (waiting)"]),
        element("Section", { title: "lifecycle" }, [
          element("StateMachine", { states: work.states, current: "IMPLEMENTING" }),
          element("Badge", {}, ["1"]),
        ]),
        element("Table", { columns: [{ width: 12 }, {}], rows: [["IMPLEMENTING", "2"]] }),
        element("Button", { intent: { action: "poke", args: { workId: "A-1" } } }, ["poke"]),
      ]),
    );
  });

  it("leaves out what a condition left as a hole", () => {
    const tree = workView({ ...work, waiting: false, attempts: [] });

    expect(tree.children).toHaveLength(3);
    expect(tree.children[0]).toEqual(element("Text", {}, ["A-1"]));
  });

  it("is drawn by the text renderer like any other tree", () => {
    expect(renderText(workView(work))).toBe(
      ["A-1 (waiting)", "", "lifecycle", "DISCOVERED · [IMPLEMENTING] · DONE", "(1)", "", "IMPLEMENTING 2", "", "[poke]"].join("\n"),
    );
  });

  it("is built with no React installed anywhere it could be found", () => {
    const here = path.resolve(import.meta.dirname, "..");
    const manifest = JSON.parse(fs.readFileSync(path.join(here, "package.json"), "utf-8")) as Record<string, unknown>;
    const require = createRequire(path.join(here, "package.json"));

    expect(manifest.dependencies ?? {}).toEqual({});
    expect(manifest.peerDependencies).toBeUndefined();
    // Named through a variable, so nothing reads this file as needing it.
    const renderer = ["re", "act"].join("");
    expect(() => require.resolve(renderer)).toThrow();
  });

  it("is compiled the same way in development and in a release", () => {
    const props = { gap: 1, children: ["a", "b"] };

    expect(jsxs("Stack", props)).toEqual(jsx("Stack", props));
    expect(jsxDEV("Stack", props)).toEqual(jsx("Stack", props));
  });

  it("refuses a lowercase tag by name, because there is no intrinsic element", () => {
    expect(() => jsx("div", {})).toThrow(/"div" is not a primitive/);
  });
});
