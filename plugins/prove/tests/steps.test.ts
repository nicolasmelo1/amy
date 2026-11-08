import { describe, expect, it } from "vitest";
import { evaluate, holds } from "../src/assertions.js";
import { ProveWorld, newRun, operationsPlugin, walk } from "./world.js";

const scenario = (steps: string, assertions: string) => `name: steps\nsteps:\n${steps}\nassertions:\n${assertions}\n`;

describe("an assertion the run cannot evaluate blocks completion", () => {
  it("is unsupported when its step never ran, its output lacks the path, or the output says it could not settle", () => {
    expect(evaluate({ id: "a", step: "s" }, {})).toEqual({ id: "a", status: "unsupported", why: "the step `s` never ran, so nothing could evaluate it" });
    expect(evaluate({ id: "a", step: "s", path: "badge" }, { s: { status: "done", output: {} } }))
      .toEqual({ id: "a", status: "unsupported", why: "the output of `s` carries no `badge` to evaluate" });
    expect(evaluate({ id: "a", step: "s" }, { s: { status: "done", output: { status: "unsupported", why: "the sizes differ" } } }))
      .toEqual({ id: "a", status: "unsupported", why: "the step `s` could not settle it: the sizes differ" });
    expect(holds([{ id: "a", status: "passed" }, { id: "b", status: "unsupported", why: "x" }])).toBe(false);
  });

  it("refuses the run naming the assertion and why, rather than counting it a pass", async () => {
    const world = new ProveWorld();
    world.brief("TBO-3", scenario(
      "  - { id: open, operation: page.open, input: {} }",
      "  - { id: opened, step: open, path: status, equals: ok }\n  - { id: badge, criterion: C2, step: open, path: badge, equals: Paid }",
    ));
    const mounted = await world.mounted([operationsPlugin("site", { "page.open": () => ({ status: "ok" }) })]);

    const { record } = await walk(world, mounted, newRun(mounted, "TBO-3/PROVE#1"));

    expect(record.state).toBe("refused");
    expect(record.verdict).toEqual({
      assertions: [{ id: "opened", status: "passed" }, { id: "badge", criterion: "C2", status: "unsupported", why: "the output of `open` carries no `badge` to evaluate" }],
      refused: "`badge` is unsupported",
    });
    expect(mounted.workflow.plan(record, await mounted.runtime.observe(record), mounted.runtime.policy).kind).toBe("settled");
  });
});

describe("each kind of step", () => {
  it("runs a deterministic step with no harness, and an agent step with one", async () => {
    const world = new ProveWorld();
    world.brief("TBO-4", scenario(
      "  - { id: open, operation: page.open, input: {} }\n  - { id: read, kind: agent, prompt: read the badge }",
      "  - { id: opened, step: open, path: status, equals: ok }\n  - { id: badge, step: read, path: badge, equals: Paid }",
    ));
    world.harnessReplies = ['Done.\n{"calls":[{"operation":"page.read","input":{"selector":"#badge"}}]}'];
    const mounted = await world.mounted([operationsPlugin("site", { "page.open": () => ({ status: "ok" }), "page.read": () => ({ badge: "Paid" }) })]);

    const run = newRun(mounted, "TBO-4/PROVE#1");
    const first = await walk(world, mounted, run, { until: (record) => record.results?.open !== undefined });
    expect(world.asked).toEqual([]);

    const { record } = await walk(world, mounted, first.record);
    expect(world.asked).toHaveLength(1);
    expect(world.asked[0]).toContain("read the badge");
    expect(record.state).toBe("PROVEN");
  });

  it("passes a wait-until step once its check holds before the deadline, waiting as a look between checks", async () => {
    const world = new ProveWorld();
    world.brief("TBO-5", scenario(
      "  - { id: settle, kind: wait-until, operation: job.status, input: {}, expect: { path: state, equals: done }, deadlineMs: 5000, everyMs: 1000 }",
      "  - { id: settled, step: settle, path: state, equals: done }",
    ));
    let checks = 0;
    const mounted = await world.mounted([operationsPlugin("jobs", { "job.status": () => ({ state: ++checks >= 3 ? "done" : "running" }) })]);

    const { record, looks } = await walk(world, mounted, newRun(mounted, "TBO-5/PROVE#1"), { throughWaits: true });

    expect(record.state).toBe("PROVEN");
    expect(checks).toBe(3);
    expect(looks.filter((one) => one.from === "RUNNING" && one.plan.kind === "wait")).toHaveLength(2);
    expect(record.attempts.RUNNING ?? 0).toBe(0);
  });

  it("fails a wait-until step past its deadline, naming the check", async () => {
    const world = new ProveWorld();
    world.brief("TBO-6", scenario(
      "  - { id: settle, kind: wait-until, operation: job.status, input: {}, expect: { path: state, equals: done }, deadlineMs: 3000, everyMs: 1000 }",
      "  - { id: settled, step: settle, path: state, equals: done }",
    ));
    const mounted = await world.mounted([operationsPlugin("jobs", { "job.status": () => ({ state: "running" }) })]);

    const { record } = await walk(world, mounted, newRun(mounted, "TBO-6/PROVE#1"), { throughWaits: true });

    expect(record.state).toBe("refused");
    expect(record.results?.settle).toEqual({ status: "failed", why: 'the check `job.status` on `state` did not hold within 3000ms; it last answered {"state":"running"}' });
  });

  it("is unsupported when an agent step has no harness to run", async () => {
    const world = new ProveWorld();
    world.brief("TBO-7", scenario(
      "  - { id: open, operation: page.open, input: {} }\n  - { id: read, kind: agent, prompt: read it }",
      "  - { id: badge, step: read, path: badge }",
    ));
    const mounted = await world.mounted([operationsPlugin("site", { "page.open": () => ({}) })], ["agent"]);

    const { record } = await walk(world, mounted, newRun(mounted, "TBO-7/PROVE#1"));

    expect(record.results?.read).toEqual({ status: "unsupported", why: "the step `read` needs an agent, and no harness is mounted" });
    expect(record.state).toBe("refused");
  });
});

describe("a run is proven only when every step held", () => {
  it("refuses a run whose unasserted step failed, and its proof does not count", async () => {
    const world = new ProveWorld();
    world.brief("TBO-30", scenario(
      "  - { id: pay, operation: invoices.pay, input: {} }\n  - { id: open, operation: page.open, input: {} }",
      "  - { id: opened, step: open, path: status, equals: ok }",
    ));
    const mounted = await world.mounted([operationsPlugin("shop", { "invoices.pay": () => new Error("card declined"), "page.open": () => ({ status: "ok" }) })]);

    const { record } = await walk(world, mounted, newRun(mounted, "TBO-30/PROVE#1"));

    expect(record.state).toBe("refused");
    expect(record.verdict?.refused).toContain("the step `pay` failed");
    const { ProofStore } = await import("../src/proof.js");
    expect(new ProofStore(`${world.artifacts}/proofs`).standing("TBO-30", { codeDigest: null, briefRevision: 1 })).toMatchObject({ proven: false, why: expect.stringContaining("the run was refused") });
  });

  it("fails a wait-until check that only holds once its deadline passed, however long the check took", async () => {
    const world = new ProveWorld();
    world.brief("TBO-31", scenario(
      "  - { id: settle, kind: wait-until, operation: job.status, input: {}, expect: { path: state, equals: done }, deadlineMs: 1000, everyMs: 5000 }",
      "  - { id: settled, step: settle, path: state, equals: done }",
    ));
    let checks = 0;
    const mounted = await world.mounted([operationsPlugin("jobs", { "job.status": () => {
      checks += 1;
      if (checks === 2) world.clock += 2000;
      return { state: checks >= 2 ? "done" : "running" };
    } })]);

    const { record, looks } = await walk(world, mounted, newRun(mounted, "TBO-31/PROVE#1"), { throughWaits: true });

    // No wait outlasts the deadline, though the step asks to check every five seconds.
    for (const one of looks.filter((taken) => taken.plan.kind === "wait")) expect((one.plan as { retryAfterMs: number }).retryAfterMs).toBeLessThanOrEqual(1000);
    expect(checks).toBe(2);
    expect(record.state).toBe("refused");
    expect(record.results?.settle?.status).toBe("failed");
  });

  it("answers unsupported, rather than hanging, on a reply that only opens a JSON object", async () => {
    const world = new ProveWorld();
    world.brief("TBO-32", scenario("  - { id: open, operation: page.open, input: {} }\n  - { id: read, kind: agent, prompt: read it }", "  - { id: badge, step: read, path: badge }"));
    world.harnessReplies = ['{"calls":['];
    const mounted = await world.mounted([operationsPlugin("site", { "page.open": () => ({}) })]);

    const { record } = await walk(world, mounted, newRun(mounted, "TBO-32/PROVE#1"));

    expect(record.results?.read).toEqual({ status: "unsupported", why: "the agent answered `read` with no calls amy can read" });
  });
});
