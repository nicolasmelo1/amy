import { describe, expect, it } from "vitest";
import { DiagramError, cameFrom, connects, markState, readDiagram } from "../src/index.js";
import { ESCALATING, NOTE_TO_PLAN } from "./diagrams.js";

describe("the subset amy reads", () => {
  it("reads the initial, terminal and waiting states and every transition", () => {
    const diagram = readDiagram(NOTE_TO_PLAN);

    expect(diagram.initial).toBe("NOTED");
    expect(diagram.states).toEqual(["NOTED", "DECLINED", "DRAFTED", "CHECKED", "PR_OPEN", "DONE"]);
    expect(diagram.terminal).toEqual(["DECLINED", "DONE"]);
    expect(diagram.waiting).toEqual(["NOTED"]);
    expect(diagram.transitions).toEqual([
      { from: "NOTED", to: "DECLINED", label: "not a repository I write into" },
      { from: "NOTED", to: "DRAFTED" },
      { from: "DRAFTED", to: "CHECKED" },
      { from: "DRAFTED", to: "DECLINED", label: "no draft in the attempts allowed" },
      { from: "CHECKED", to: "DRAFTED", label: "check is red" },
      { from: "CHECKED", to: "PR_OPEN" },
      { from: "PR_OPEN", to: "DONE" },
    ]);
    expect(diagram.text).toBe(NOTE_TO_PLAN);
  });

  it("reads the attention, anywhere and returns classes, and leaves every other line to the renderer", () => {
    const diagram = readDiagram(ESCALATING);

    expect(diagram.initial).toBe("WORKING");
    expect(diagram.waiting).toEqual(["REVIEW"]);
    expect(diagram.attention).toEqual(["REVIEW", "ASKED"]);
    expect(diagram.anywhere).toEqual(["ASKED"]);
    expect(diagram.returns).toEqual(["ASKED"]);
    expect(diagram.transitions[0]).toEqual({ from: "WORKING", to: "REVIEW", label: "a pull request exists" });
  });

  it("does not interpret a label", () => {
    const diagram = readDiagram("stateDiagram-v2\n[*] --> A\nA --> B: only when the moon is full --> C\nB --> [*]\n");

    expect(diagram.transitions).toEqual([{ from: "A", to: "B", label: "only when the moon is full --> C" }]);
  });
});

describe("what amy refuses, by name and line", () => {
  const refusal = (text: string): DiagramError => {
    try {
      readDiagram(text);
    } catch (error) {
      if (error instanceof DiagramError) return error;
      throw error;
    }
    throw new Error("it was read");
  };
  const around = (line: string) => `stateDiagram-v2\n[*] --> A\nA --> B\n${line}\nB --> [*]\n`;

  it.each([
    ["a composite state", "state Busy {", /composite state/],
    ["the end of a composite state", "}", /composite state/],
    ["a choice", "state pick <<choice>>", /<<choice>>/],
    ["a fork", "state split <<fork>>", /<<fork>>/],
    ["a join", "state merge <<join>>", /<<join>>/],
    ["a concurrent region", "--", /concurrent region/],
    ["the class shorthand", "A --> C:::waiting", /:::/],
    ["a line outside the subset", "A : a description", /is not a line amy reads/],
    ["an arrow Mermaid does not draw", "A -> B", /is not a line amy reads/],
  ])("refuses %s on the line it is written", (_name, line, reason) => {
    const error = refusal(around(line));

    expect(error.line).toBe(4);
    expect(error.message).toMatch(reason);
    expect(error.message).toMatch(/^workflow\.mmd line 4: /);
  });

  it("refuses a file that is not a state diagram", () => {
    expect(refusal("flowchart LR\nA --> B\n").message).toMatch(/line 1: the first line is `flowchart LR`/);
    expect(refusal("\n\n").message).toMatch(/it is empty/);
  });

  it("refuses a diagram with no initial state, or two", () => {
    expect(refusal("stateDiagram-v2\nA --> B\nB --> [*]\n").message).toMatch(/no `\[\*\] --> STATE` names the initial state/);
    expect(refusal("stateDiagram-v2\n[*] --> A\n[*] --> B\nA --> [*]\n").message).toMatch(/`\[\*\]` leads to `A` and `B`/);
  });

  it("refuses a diagram where no work ends", () => {
    expect(refusal("stateDiagram-v2\n[*] --> A\nA --> B\n").message).toMatch(/no `STATE --> \[\*\]`/);
  });

  it("refuses a class on a state nothing draws, and `[*] --> [*]`", () => {
    expect(refusal("stateDiagram-v2\n[*] --> A\nA --> [*]\nclass Z waiting\n").message).toMatch(/line 4: `Z` is given a class/);
    expect(refusal("stateDiagram-v2\n[*] --> [*]\n").message).toMatch(/line 2: `\[\*\] --> \[\*\]` draws no state/);
  });

  it("refuses a note or a description block that is never closed, at the line that opened it", () => {
    expect(refusal("stateDiagram-v2\n[*] --> A\nA --> [*]\nnote right of A\n  never closed\n").message).toMatch(/line 4: a `note` is never closed/);
    expect(refusal("stateDiagram-v2\n[*] --> A\naccDescr {\nA --> [*]\n").message).toMatch(/line 3: an `accDescr \{` is never closed/);
  });

  it("reads prose that mentions a refused construct as prose", () => {
    const diagram = readDiagram("stateDiagram-v2\n%% do not use <<choice>> here\n[*] --> A\nnote right of A: avoid the ::: shorthand\nA --> [*]\n");

    expect(diagram.states).toEqual(["A"]);
  });

  it("names the file it was told the diagram came from", () => {
    expect(() => readDiagram("stateDiagram-v2\n--\n", "/w/oncall/workflow.mmd")).toThrow(/^\/w\/oncall\/workflow\.mmd line 2: /);
  });
});

describe("what the diagram connects", () => {
  const plan = readDiagram(NOTE_TO_PLAN);
  const escalating = readDiagram(ESCALATING);

  it("connects what it draws, and nothing else", () => {
    expect(connects(plan, "CHECKED", "DRAFTED")).toBe(true);
    expect(connects(plan, "DRAFTED", "PR_OPEN")).toBe(false);
  });

  it("connects every state that is not terminal to an `anywhere` state", () => {
    expect(connects(escalating, "WORKING", "ASKED")).toBe(true);
    expect(connects(escalating, "DONE", "ASKED")).toBe(false);
  });

  it("connects a `returns` state to where the record came from, and only there", () => {
    expect(connects(escalating, "ASKED", "WORKING", "WORKING")).toBe(true);
    expect(connects(escalating, "ASKED", "DONE", "WORKING")).toBe(false);
  });

  it("reads where a record came from out of its history", () => {
    const history = [{ from: "WORKING", to: "ASKED" }, { from: "ASKED", to: "WORKING" }, { from: "WORKING", to: "REVIEW" }, { from: "REVIEW", to: "ASKED" }];

    expect(cameFrom(history, "ASKED")).toBe("REVIEW");
    expect(cameFrom(history, "DONE")).toBeUndefined();
  });

  it("marks a record's state with two ordinary lines, and refuses a state it does not draw", () => {
    const marked = markState(plan, "CHECKED");

    expect(marked.startsWith(NOTE_TO_PLAN.trimEnd())).toBe(true);
    expect(marked.endsWith("    class CHECKED current\n")).toBe(true);
    expect(readDiagram(marked).states).toEqual(plan.states);
    expect(() => markState(plan, "LOST")).toThrow(/draws no `LOST`/);
  });
});
