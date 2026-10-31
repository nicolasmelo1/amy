import { describe, expect, it } from "vitest";
import { DiagramError, HostServices, advance, call, cameFrom, connects, defineWorkflow, markState, mount, readDiagram, settled, withDiagram } from "../src/index.js";
import { ESCALATING, LANES, NOTE_TO_PLAN } from "./diagrams.js";
import { PLANNER, PlannerRecord, mounted, planner, task, walk } from "./forks.js";

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
    ["a fork written anywhere but a line of its own", "A --> B <<fork>>", /<<fork>>/],
    ["a join written anywhere but a line of its own", "A --> B <<join>>", /<<join>>/],
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
    expect(refusal("stateDiagram-v2\n[*] --> A\nA --> [*]\nclass Z waiting\n").message).toMatch(/line 4: `Z` is named here, and no transition draws it/);
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

  it("reads a label as prose, even one that mentions a refused construct", () => {
    const diagram = readDiagram("stateDiagram-v2\n[*] --> A\nA --> B: avoid <<choice>> and ::: here\nB --> [*]\n");

    expect(diagram.transitions).toEqual([{ from: "A", to: "B", label: "avoid <<choice>> and ::: here" }]);
  });

  it("reads a one-line note with no space after its colon", () => {
    expect(readDiagram("stateDiagram-v2\n[*] --> A\nnote right of A:example\nA --> [*]\n").states).toEqual(["A"]);
  });

  it.each([
    ["a style", "style Z fill:red"],
    ["a note", "note right of Z: never drawn"],
    ["a class amy does not read", "class Z decorative"],
  ])("refuses %s naming a state no arrow draws, so what renders is what mounts", (_name, line) => {
    expect(refusal(`stateDiagram-v2\n[*] --> A\nA --> [*]\n${line}\n`).message).toMatch(/line 4: `Z` is named here, and no transition draws it/);
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

describe("a fork of lanes", () => {
  const HOST: HostServices = {
    runner: { run: async () => ({ ok: true, exitCode: 0, stdout: "", stderr: "" }) },
    now: () => new Date("2026-10-31T12:00:00.000Z"),
    paths: { workspace: "/work", checkouts: {}, state: "/state" },
  };
  const refusal = (text: string): string => {
    try {
      readDiagram(text);
    } catch (error) {
      return (error as Error).message;
    }
    throw new Error("it was read");
  };

  it("reads each fork with the lanes drawn out of it and the join they meet at", () => {
    const diagram = readDiagram(LANES);

    expect(diagram.forks).toEqual({ split: { lanes: ["TASK_A", "TASK_B", "TASK_C"], join: "merge" } });
    expect(diagram.calls).toEqual(["TASK_A", "TASK_B", "TASK_C"]);
    expect(diagram.states).toContain("split");
    expect(diagram.states).toContain("merge");
    // The record waits in the fork and moves to the join: that move is drawn by the lanes.
    expect(connects(diagram, "split", "merge")).toBe(true);
    expect(connects(diagram, "PLANNED", "merge")).toBe(false);
  });

  it("mounts a diagram whose every lane is a call", async () => {
    const outcome = await mount([planner()], {}, HOST);

    expect(outcome.ok).toBe(true);
  });

  it("refuses a lane that is not a call, naming it", () => {
    const text = LANES.replace("class TASK_A, TASK_B, TASK_C call", "class TASK_A, TASK_C call");

    expect(refusal(text)).toMatch(/`TASK_B` is a lane of the fork `split` and not a call/);
  });

  it("refuses a join a lane never reaches", () => {
    const silent = LANES.replace("    TASK_C --> merge: DONE\n    TASK_C --> merge: DECLINED\n", "");
    const astray = LANES.replace("TASK_C --> merge: DECLINED", "TASK_C --> ESCALATED: DECLINED");

    expect(refusal(silent)).toMatch(/`TASK_C` is a lane of `split` and never reaches the join `merge`/);
    expect(refusal(astray)).toMatch(/`TASK_C --> ESCALATED` leaves a lane of `split` for somewhere other than its join `merge`/);
  });

  it("refuses a join no fork's lanes meet at, and a fork of one lane", () => {
    expect(refusal(LANES.replace("state merge <<join>>", "state merge <<join>>\n    state lonely <<join>>").replace("ESCALATED --> [*]", "ESCALATED --> lonely\n    lonely --> INTEGRATED\n    INTEGRATED --> ESCALATED\n    ESCALATED --> [*]")))
      .toMatch(/the join `lonely` is reached by no fork's lanes|reaches the join from outside its fork/);
    expect(refusal("stateDiagram-v2\n    state split <<fork>>\n    state merge <<join>>\n    [*] --> A\n    A --> split\n    split --> L\n    L --> merge: DONE\n    merge --> B\n    B --> [*]\n    class L call\n"))
      .toMatch(/the fork `split` draws 1 lane\(s\)/);
  });

  it("refuses at boot a lane whose callee can end where no edge into the join is named", async () => {
    const outcome = await mount([planner({ callee: task({ ends: "three" }) })], {}, HOST);

    expect(outcome.ok).toBe(false);
    expect(outcome.ok ? "" : outcome.problems.join("; ")).toMatch(/planner → TASK_A: task can end at `STUCK`, and no edge out of `TASK_A` is named `STUCK`/);
  });

  it("refuses a decision written for a fork, which its lanes move", async () => {
    const declared = planner();
    const outcome = await mount([withDiagram(defineWorkflow({
      name: "planner",
      configSchema: {},
      policy: {},
      needs: {},
      calls: { TASK_A: call(task(), { input: () => ({ task: "a" }) }), TASK_B: call(task(), { input: () => ({ task: "b" }) }), TASK_C: call(task(), { input: () => ({ task: "c" }) }) },
      decide: {
        PLANNED: () => advance("split", "planned"),
        split: () => settled("never"),
        merge: () => advance("INTEGRATED", "joined"),
        INTEGRATED: () => settled("integrated"),
        ESCALATED: () => settled("escalated"),
      },
      record: () => ({}),
      observe: async () => ({}),
      actions: {},
    }), PLANNER(["TASK_A", "TASK_B", "TASK_C"]))], {}, HOST);

    expect(declared.name).toBe("workflow-planner");
    expect(outcome.ok ? "" : outcome.problems.join("; ")).toMatch(/`split` is a fork, moved by its lanes; the join is where the decision is/);
  });

  it("hands the join's decision every lane's end and output, keyed by lane", async () => {
    const { workflow, runtime } = await mounted([planner()], HOST);
    const start = { ...runtime.newRecord("PLAN-1", HOST.now()), tasks: ["write", "refuse the docs", "test"] } as PlannerRecord;

    const { record } = await walk(workflow, runtime, start, HOST.now());

    expect(record.state).toBe("ESCALATED");
    expect((record as PlannerRecord).joinedWith).toEqual({
      TASK_A: { call: "PLAN-1/TASK_A#1", end: "DONE", output: { did: "write", looks: 1 } },
      TASK_B: { call: "PLAN-1/TASK_B#1", end: "DECLINED", output: { refused: "refuse the docs" } },
      TASK_C: { call: "PLAN-1/TASK_C#1", end: "DONE", output: { did: "test", looks: 1 } },
    });
    expect(record.history.map((step) => `${step.from}>${step.to}`)).toEqual(["PLANNED>split", "split>merge", "merge>ESCALATED"]);
  });
});
