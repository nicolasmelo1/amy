import { describe, expect, it } from "vitest";
import { readDiagram } from "@amykit/core";
import { renderText, type Node } from "@amykit/ui";
import { loadConformance, loadFrame } from "@amykit/ui-conformance";
import { START, WORK_DIAGRAM, WORLD, scene } from "../src/world.js";

/** The `StateMachine` the canvas draws for one open record. */
function machineOf(id: string): Node {
  const drawn = scene(loadFrame(), { ...START, open: id }, loadConformance());
  const canvas = Object.values(drawn.regions).find((region) => region.holds["machine"] !== undefined);
  const node = canvas?.holds["machine"];
  if (node === undefined) throw new Error(`no machine is drawn for ${id}`);
  return node;
}

describe("every view of a workflow is drawn from its diagram, when it has one", () => {
  it("carries the diagram, and the states and arrows the core reads out of it, for a workflow with one", () => {
    const diagram = readDiagram(WORK_DIAGRAM);

    for (const record of WORLD.records.filter((each) => each.profile === "work")) {
      const node = machineOf(record.id);
      expect(node.type).toBe("StateMachine");
      expect(node.props.diagram).toBe(WORK_DIAGRAM);
      expect([...(node.props.states as string[])].sort()).toEqual([...diagram.states].sort());
      expect(node.props.transitions).toEqual(diagram.transitions.map(({ from, to }) => ({ from, to })));
    }
  });

  it("carries the states alone, with no diagram and no arrows, for a workflow without one", () => {
    for (const record of WORLD.records.filter((each) => each.profile === "personal")) {
      const node = machineOf(record.id);
      expect(node.props.diagram).toBeUndefined();
      expect(node.props.transitions).toBeUndefined();
      expect(node.props.states).toContain(record.state);
    }
  });

  it("is drawn in characters from the parsed states and arrows, never from the Mermaid text", () => {
    const text = renderText(machineOf("AMY-102"));

    expect(text.split("\n")[0]).toContain("[ESCALATED]");
    expect(text).toContain("IMPLEMENTING → ESCALATED");
    expect(text).not.toContain("stateDiagram-v2");
  });
});
