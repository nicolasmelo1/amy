import { WorkRecord, acceptsAction } from "@amykit/core";
import { describe, expect, it } from "vitest";
import { conformance } from "../src/index.js";
import { advance, runtimeOf, settled, workflowOf } from "./machines.js";

const handingOff = workflowOf({
  states: ["approved", "done"],
  terminal: ["done"],
  plan: (record) => (record.state === "approved" ? advance("done", "hand-off-to-qa") : settled()),
});

const quiet = workflowOf({
  states: ["received", "done"],
  terminal: ["done"],
  plan: (record) => (record.state === "received" ? advance("done") : settled()),
});

describe("handlers", () => {
  it("fails an action declared with nothing behind it, naming it", async () => {
    const findings = await conformance(quiet, {
      runtime: () => runtimeOf("received", { observe: () => ({}), actions: { page: undefined } }),
      worlds: [{ name: "quiet" }],
    });

    expect(findings).toEqual([
      {
        property: "handlers",
        message: "action `page` is declared with no implementation — give it a handler, or a port and a method",
      },
    ]);
  });

  it("fails an action planned at the last step that the runtime never declared", async () => {
    const findings = await conformance(handingOff, {
      runtime: () => runtimeOf("approved", { observe: () => ({}) }),
      worlds: [{ name: "the happy path" }],
    });

    expect(findings).toContainEqual({
      property: "handlers",
      message: "the happy path: `approved` plans `hand-off-to-qa`, which the runtime never declares in its actions",
    });
  });

  it("reports an undeclared action before running the declared one ahead of it", async () => {
    const ran: string[] = [];
    const findings = await conformance(
      workflowOf({
        states: ["approved", "done"],
        terminal: ["done"],
        plan: (record) => (record.state === "approved" ? advance("done", "announce", "hand-off-to-qa") : settled()),
      }),
      {
        runtime: () => runtimeOf("approved", { observe: () => ({}), actions: { announce: async () => void ran.push("announce") } }),
        worlds: [{ name: "the happy path" }],
      },
    );

    expect(findings).toContainEqual({
      property: "handlers",
      message: "the happy path: `approved` plans `hand-off-to-qa`, which the runtime never declares in its actions",
    });
    expect(ran).toEqual([]);
  });

  it("fails a handler that throws on the observation the runtime really built", async () => {
    // The observation moved `threads` under `pullRequest`; the handler still
    // reads it where it used to be. A stub that ignored its argument would
    // have gone green here.
    const addressing = workflowOf<{ pullRequest: { threads: string[] } }>({
      states: ["fixing", "done"],
      terminal: ["done"],
      plan: (record) => (record.state === "fixing" ? advance("done", "address-threads") : settled()),
    });

    const findings = await conformance(addressing, {
      runtime: () =>
        runtimeOf<WorkRecord, { pullRequest: { threads: string[] } }>("fixing", {
          observe: () => ({ pullRequest: { threads: ["T1"] } }),
          actions: {
            "address-threads": async (_action, ctx) => {
              (ctx.observation as unknown as { threads: string[] }).threads.map((id) => id);
            },
          },
        }),
      worlds: [{ name: "a review with one thread" }],
    });

    const thrown = findings.filter((finding) => finding.property === "handlers");
    expect(thrown).toHaveLength(1);
    expect(thrown[0]!.message).toMatch(/^a review with one thread: `address-threads` threw when `fixing` called it — .*map/);
  });

  it("passes when every declared action is handled and survives", async () => {
    const findings = await conformance(handingOff, {
      runtime: () => runtimeOf("approved", { observe: () => ({}), actions: { "hand-off-to-qa": async () => {} } }),
      worlds: [{ name: "the happy path" }],
    });

    expect(findings).toEqual([]);
  });

  it("calls a port-and-method action on the port the world hands over", async () => {
    const calls: unknown[] = [];
    const findings = await conformance(handingOff, {
      runtime: () =>
        runtimeOf("approved", { observe: () => ({}), actions: { "hand-off-to-qa": { port: "tracker", method: "setStatus" } } }),
      ports: () => ({ tracker: { setStatus: acceptsAction(async (action) => void calls.push(action)) } }),
      worlds: [{ name: "the happy path" }],
    });

    expect(findings).toEqual([]);
    expect(calls).toEqual([{ type: "hand-off-to-qa" }]);
  });

  it("fails a port-and-method action whose port the world never handed over", async () => {
    const findings = await conformance(quiet, {
      runtime: () => runtimeOf("received", { observe: () => ({}), actions: { merge: { port: "forge", method: "merge" } } }),
      worlds: [{ name: "quiet" }],
    });

    expect(findings).toEqual([
      { property: "handlers", message: "action `merge`: needs the `forge` port, which nothing mounted" },
    ]);
  });

  it("asks every world's runtime, not only the first one built", async () => {
    const findings = await conformance(handingOff, {
      runtime: (world) =>
        runtimeOf("approved", {
          observe: () => ({}),
          actions: { "hand-off-to-qa": world.name === "a runtime that forgot it" ? undefined : async () => {} },
        }),
      worlds: [
        { name: "the happy path" },
        {
          name: "a runtime that forgot it",
          start: (now) => ({ id: "x", state: "done", updatedAt: now.toISOString(), attempts: {}, history: [] }),
        },
      ],
    });

    expect(findings).toContainEqual({
      property: "handlers",
      message:
        "action `hand-off-to-qa` is declared with no implementation — give it a handler, or a port and a method (in a runtime that forgot it)",
    });
  });
});
