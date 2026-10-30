import { describe, expect, it } from "vitest";
import { parse } from "pele";
import { Diagram, readDiagram } from "../src/index.js";
import { ESCALATING, NOTE_TO_PLAN } from "./diagrams.js";

/**
 * Mermaid publishes no grammar as a specification; its parser is the
 * reference. Pele's parsers are tested against Mermaid's own parser specs and
 * by differential fuzzing, and Pele runs in Node with no DOM, so it is the
 * oracle: every diagram amy's reader accepts must parse under it, as a state
 * diagram, with the same states, transitions and classes.
 */
interface PeleState {
  readonly classes?: readonly string[];
}
interface PeleModel {
  readonly type: string;
  readonly states: ReadonlyMap<string, PeleState>;
  readonly relations: readonly { readonly id1: string; readonly id2: string; readonly relationTitle?: string }[];
}

const AMY_CLASSES = ["waiting", "attention", "anywhere", "returns"] as const;

/** Pele names the start and end pseudo-states of the root document `root_start` and `root_end`. */
function pseudo(id: string): string {
  return id === "root_start" || id === "root_end" ? "[*]" : id;
}

function asPele(text: string) {
  const model = parse(text) as unknown as PeleModel;
  const states = [...model.states.keys()].filter((id) => pseudo(id) !== "[*]");
  const edges = model.relations.map((relation) => ({ from: pseudo(relation.id1), to: pseudo(relation.id2), label: relation.relationTitle ?? "" }));
  const classes = Object.fromEntries(AMY_CLASSES.map((name) => [
    name,
    states.filter((state) => model.states.get(state)?.classes?.includes(name)).sort(),
  ]));
  return { type: model.type, states: [...states].sort(), edges, classes };
}

function asAmy(diagram: Diagram) {
  const edges = [
    { from: "[*]", to: diagram.initial, label: "" },
    ...diagram.transitions.map((edge) => ({ from: edge.from, to: edge.to, label: edge.label ?? "" })),
    ...diagram.terminal.map((state) => ({ from: state, to: "[*]", label: "" })),
  ];
  const classes = Object.fromEntries(AMY_CLASSES.map((name) => [name, [...diagram[name]].sort()]));
  return { states: [...diagram.states].sort(), edges, classes };
}

/** Same edges, in any order. */
function sorted(edges: readonly { from: string; to: string; label: string }[]) {
  return [...edges].sort((a, b) => `${a.from}>${a.to}>${a.label}`.localeCompare(`${b.from}>${b.to}>${b.label}`));
}

const ACCEPTED: readonly [string, string][] = [
  ["the plan's own diagram", NOTE_TO_PLAN],
  ["every class and every line left to the renderer", ESCALATING],
  ["a label carrying an arrow", "stateDiagram-v2\n[*] --> A\nA --> B: only when the moon is full --> C\nB --> [*]\n"],
  ["two arrows between the same states", "stateDiagram-v2\n[*] --> A\nA --> B: once\nA --> B: twice\nB --> A\nB --> [*]\n"],
  ["a state that is both started in and ended in", "stateDiagram-v2\n[*] --> ONLY\nONLY --> [*]\n"],
];

describe("every diagram amy reads, Mermaid reads the same way", () => {
  it.each(ACCEPTED)("%s", (_name, text) => {
    const pele = asPele(text);
    const amy = asAmy(readDiagram(text));

    expect(pele.type).toBe("state");
    expect(pele.states).toEqual(amy.states);
    expect(sorted(pele.edges)).toEqual(sorted(amy.edges));
    expect(pele.classes).toEqual(amy.classes);
  });

  it("what amy refuses by name, Mermaid would still draw — so the refusal says why rather than calling it broken", () => {
    const drawable = [
      "stateDiagram-v2\n[*] --> A\nstate Busy {\n  A --> B\n}\nB --> [*]\n",
      "stateDiagram-v2\n[*] --> A\nstate pick <<choice>>\nA --> pick\npick --> B\nB --> [*]\n",
      "stateDiagram-v2\n[*] --> A\nstate split <<fork>>\nA --> split\nsplit --> B\nB --> [*]\n",
    ];
    for (const text of drawable) {
      expect(asPele(text).type).toBe("state");
      expect(() => readDiagram(text)).toThrow(/is not read/);
    }
  });
});
