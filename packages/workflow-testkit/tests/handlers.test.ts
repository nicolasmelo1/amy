import { WorkRecord } from "@amykit/core";
import { describe, expect, it } from "vitest";
import { conformance } from "../src/index.js";
import { advance, runtimeOf, settled, workflowOf } from "./machines.js";

const handingOff = (uses: string[]) =>
  workflowOf({
    states: ["approved", "done"],
    terminal: ["done"],
    uses,
    plan: (record) => (record.state === "approved" ? advance("done", "hand-off-to-qa") : settled()),
  });

describe("handlers", () => {
  it("fails an action declared with nothing behind it, naming it", async () => {
    const findings = await conformance(
      workflowOf({
        states: ["received", "done"],
        terminal: ["done"],
        uses: ["page"],
        plan: (record) => (record.state === "received" ? advance("done") : settled()),
      }),
      { runtime: () => runtimeOf("received", { observe: () => ({}) }), worlds: [{ name: "quiet" }] },
    );

    expect(findings).toEqual([
      { property: "handlers", message: "`page` is declared in usesActions, and the runtime has no handler for it" },
    ]);
  });

  it("fails an action planned at the last step with no handler", async () => {
    const findings = await conformance(handingOff(["hand-off-to-qa"]), {
      runtime: () => runtimeOf("approved", { observe: () => ({}) }),
      worlds: [{ name: "the happy path" }],
    });

    expect(findings).toContainEqual({
      property: "handlers",
      message: "the happy path: `approved` plans `hand-off-to-qa`, and nothing in the runtime handles it",
    });
  });

  it("fails a handler that throws on the observation the runtime really built", async () => {
    // The observation moved `threads` under `pullRequest`; the handler still
    // reads it where it used to be. A stub that ignored its argument would
    // have gone green here.
    const addressing = workflowOf<{ pullRequest: { threads: string[] } }>({
      states: ["fixing", "done"],
      terminal: ["done"],
      uses: ["address-threads"],
      plan: (record) => (record.state === "fixing" ? advance("done", "address-threads") : settled()),
    });

    const findings = await conformance(addressing, {
      runtime: () =>
        runtimeOf<WorkRecord, { pullRequest: { threads: string[] } }>("fixing", {
          observe: () => ({ pullRequest: { threads: ["T1"] } }),
          handlers: {
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

  it("fails an action it plans without declaring", async () => {
    const findings = await conformance(handingOff([]), {
      runtime: () => runtimeOf("approved", { observe: () => ({}), handlers: { "hand-off-to-qa": async () => {} } }),
      worlds: [{ name: "the happy path" }],
    });

    expect(findings).toEqual([
      { property: "handlers", message: "`approved` plans `hand-off-to-qa`, which usesActions does not declare" },
    ]);
  });

  it("passes when every declared action is handled and survives", async () => {
    const findings = await conformance(handingOff(["hand-off-to-qa"]), {
      runtime: () => runtimeOf("approved", { observe: () => ({}), handlers: { "hand-off-to-qa": async () => {} } }),
      worlds: [{ name: "the happy path" }],
    });

    expect(findings).toEqual([]);
  });

  it("asks every world's runtime, not only the first one built", async () => {
    const findings = await conformance(handingOff(["hand-off-to-qa"]), {
      runtime: (world) =>
        runtimeOf("approved", {
          observe: () => ({}),
          handlers: world.name === "a runtime that forgot it" ? {} : { "hand-off-to-qa": async () => {} },
        }),
      worlds: [{ name: "the happy path" }, { name: "a runtime that forgot it", start: (now) => ({ id: "x", state: "done", updatedAt: now.toISOString(), attempts: {}, history: [] }) }],
    });

    expect(findings).toContainEqual({
      property: "handlers",
      message: "`hand-off-to-qa` is declared in usesActions, and the runtime in a runtime that forgot it has no handler for it",
    });
  });
});
