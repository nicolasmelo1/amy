import { WorkRecord } from "@amykit/core";
import { describe, expect, it } from "vitest";
import { conformance } from "../src/index.js";
import { advance, act, runtimeOf, settled, wait, workflowOf } from "./machines.js";

/** received → done, the smallest lifecycle that settles. */
const straight = workflowOf({
  states: ["received", "done"],
  terminal: ["done"],
  plan: (record) => (record.state === "received" ? advance("done") : settled()),
});

const nothingAround = runtimeOf("received", { observe: () => ({}) });

describe("reachability", () => {
  it("passes a lifecycle whose every state is reached and left", async () => {
    await expect(
      conformance(straight, { runtime: () => nothingAround, worlds: [{ name: "a piece of work" }] }),
    ).resolves.toEqual([]);
  });

  it("fails a state nothing reaches, naming it", async () => {
    const stranded = workflowOf({ ...straightMachine(), states: ["received", "done", "stranded"] });

    const findings = await conformance(stranded, { runtime: () => nothingAround, worlds: [{ name: "a piece of work" }] });

    expect(findings).toContainEqual({ property: "reachability", message: "`stranded` is declared, and no world reaches it" });
  });

  it("fails a state nothing leaves", async () => {
    const parking = workflowOf<{ free: boolean }>({
      states: ["received", "parked", "done"],
      terminal: ["done"],
      waiting: ["parked"],
      plan: (record, observation) => {
        if (record.state === "received") return advance("parked");
        if (record.state === "parked") return observation.free ? advance("done") : wait();
        return settled();
      },
    });
    const stuck = runtimeOf<WorkRecord, { free: boolean }>("received", { observe: () => ({ free: false }) });

    const findings = await conformance(parking, { runtime: () => stuck, worlds: [{ name: "a car nobody collects" }] });

    expect(findings).toContainEqual({
      property: "reachability",
      message: "nothing leaves `parked`: every world that reaches it leaves the work there",
    });
  });

  it("counts a state as left when any one world leaves it", async () => {
    const parking = workflowOf<{ free: boolean }>({
      states: ["received", "parked", "done"],
      terminal: ["done"],
      waiting: ["parked"],
      plan: (record, observation) => {
        if (record.state === "received") return advance("parked");
        if (record.state === "parked") return observation.free ? advance("done") : wait();
        return settled();
      },
    });
    const collected = { free: false };

    const findings = await conformance(parking, {
      runtime: (world) => runtimeOf<WorkRecord, { free: boolean }>("received", { observe: () => (world.name === "collected" ? collected : { free: false }) }),
      worlds: [{ name: "abandoned" }, { name: "collected", meanwhile: [() => { collected.free = true; }] }],
    });

    expect(findings).toEqual([]);
  });

  it("fails a lifecycle that never comes to rest", async () => {
    const spinning = workflowOf({ ...straightMachine(), plan: (record) => (record.state === "received" ? act() : settled()) });

    const findings = await conformance(spinning, { runtime: () => nothingAround, worlds: [{ name: "busy" }], maxLooks: 5 });

    expect(findings).toContainEqual({
      property: "reachability",
      message: "busy: did not come to rest within 5 looks; it was last in `received`",
    });
  });

  it("fails a move to a state the workflow does not declare", async () => {
    const lost = workflowOf({ ...straightMachine(), plan: () => advance("elsewhere") });

    const findings = await conformance(lost, { runtime: () => nothingAround, worlds: [{ name: "lost" }] });

    expect(findings).toContainEqual({
      property: "reachability",
      message: "lost: `received` moves to `elsewhere`, which the workflow does not declare",
    });
  });

  it("fails a terminal state that does not settle, and a settling state that is not terminal", async () => {
    const confused = workflowOf({
      states: ["received", "done"],
      terminal: ["done"],
      plan: (record) => (record.state === "received" ? settled() : wait()),
    });

    const findings = await conformance(confused, { runtime: () => nothingAround, worlds: [{ name: "confused" }] });

    expect(findings).toContainEqual({ property: "reachability", message: "`received` settles, and is not declared terminal" });
    expect(findings).toContainEqual({ property: "reachability", message: "`done` is declared, and no world reaches it" });
  });

  it("does not count a state a world starts in as reached", async () => {
    const findings = await conformance(straight, {
      runtime: () => nothingAround,
      worlds: [{ name: "already done", start: (now) => ({ ...nothingAround.newRecord("x", now), state: "done" }) }],
    });

    expect(findings).toContainEqual({ property: "reachability", message: "`received` is declared, and no world reaches it" });
    expect(findings).toContainEqual({ property: "reachability", message: "`done` is declared, and no world reaches it" });
  });
});

function straightMachine() {
  return {
    states: ["received", "done"],
    terminal: ["done"],
    plan: (record: { state: string }) => (record.state === "received" ? advance("done") : settled()),
  };
}
