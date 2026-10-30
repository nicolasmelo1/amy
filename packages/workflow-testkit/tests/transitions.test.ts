import { Workflow, readDiagram } from "@amykit/core";
import { describe, expect, it } from "vitest";
import { conformance } from "../src/index.js";
import { advance, runtimeOf, settled } from "./machines.js";

const DIAGRAM = readDiagram(`stateDiagram-v2
    [*] --> received
    received --> working
    working --> done
    received --> declined: not ours
    asked --> working
    done --> [*]
    declined --> [*]
    class asked anywhere
    class asked returns
`);

/** A workflow drawn by the diagram above, whose moves are whatever the test says. */
function drawn(moves: Record<string, string | undefined>): Workflow<unknown, unknown> {
  return {
    name: "drawn",
    states: DIAGRAM.states,
    waitingStates: [],
    initialState: DIAGRAM.initial,
    terminalStates: DIAGRAM.terminal,
    diagram: DIAGRAM,
    plan: (record) => {
      const to = moves[`${record.state}@${record.history.length}`] ?? moves[record.state];
      return to ? advance(to) : settled();
    },
  };
}

const runtime = () => runtimeOf("received", { observe: () => ({}) });
const findingsOf = async (moves: Record<string, string | undefined>, everyEdge = false) =>
  (await conformance(drawn(moves), { runtime, worlds: [{ name: "a piece of work" }], everyEdge })).filter((finding) => finding.property === "transitions");

describe("every move is one the diagram draws", () => {
  it("passes a walk whose every move is an arrow", async () => {
    await expect(findingsOf({ received: "working", working: "done" })).resolves.toEqual([]);
  });

  it("fails a move the diagram does not connect, naming both ends", async () => {
    const findings = await findingsOf({ received: "done" });

    expect(findings).toEqual([{
      property: "transitions",
      message: "a piece of work: `received` moves to `done`, and the diagram draws no arrow from `received` to `done`",
    }]);
  });

  it("connects a move to an `anywhere` state, and one back out of a `returns` state to where the record came from", async () => {
    const findings = await findingsOf({ "received@0": "asked", "asked@1": "received", "received@2": "working", working: "done" });

    expect(findings).toEqual([]);
  });

  it("fails a `returns` state leaving somewhere it did not come from", async () => {
    const findings = await findingsOf({ received: "asked", asked: "done" });

    expect(findings.map((finding) => finding.message)).toEqual([
      "a piece of work: `asked` moves to `done`, and the diagram draws no arrow from `asked` to `done`",
    ]);
  });

  it("lists an arrow no world walks only when every edge is asked for", async () => {
    const walked = { received: "working", working: "done" };

    await expect(findingsOf(walked)).resolves.toEqual([]);
    expect((await findingsOf(walked, true)).map((finding) => finding.message)).toEqual([
      "`received` → `declined` is drawn, and no world walks it",
      "`asked` → `working` is drawn, and no world walks it",
    ]);
  });

  it("holds a workflow without a diagram to nothing", async () => {
    const undrawn = { ...drawn({ received: "done" }), diagram: undefined };

    const findings = await conformance(undrawn, { runtime, worlds: [{ name: "a piece of work" }], everyEdge: true });

    expect(findings.filter((finding) => finding.property === "transitions")).toEqual([]);
  });
});
