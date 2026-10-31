import { describe, expect, it } from "vitest";
import { readDiagram } from "../src/index.js";

describe("a call drawn in the diagram", () => {
  const CALLER = `stateDiagram-v2
    [*] --> WORKING
    WORKING --> REVIEW
    state "review · @acme/workflow-review" as REVIEW
    REVIEW --> DONE: APPROVED
    DONE --> [*]
    class REVIEW call
`;

  it("reads the `call` class beside the other four", () => {
    expect(readDiagram(CALLER).calls).toEqual(["REVIEW"]);
  });

  it("reads a state's description as prose for a reader, never as a binding", () => {
    expect(readDiagram(CALLER).labels).toEqual({ REVIEW: "review · @acme/workflow-review" });
  });

  it("reads a description that mentions a refused construct as prose", () => {
    const diagram = readDiagram("stateDiagram-v2\n[*] --> A\nstate \"check the ::: shorthand and <<choice>>\" as A\nA --> [*]\n");

    expect(diagram.labels).toEqual({ A: "check the ::: shorthand and <<choice>>" });
  });

  it("refuses a description of a state no arrow draws", () => {
    expect(() => readDiagram("stateDiagram-v2\n[*] --> A\nstate \"lost\" as B\nA --> [*]\n")).toThrow("`B` is named here, and no transition draws it");
  });
});
