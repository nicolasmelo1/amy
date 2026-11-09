import { describe, expect, it } from "vitest";
import {
  BriefRecord,
  HostServices,
  Plan,
  Plugin,
  WORKFLOW_RUNTIME,
  Workflow,
  WorkflowRuntime,
  WorkRecord,
  actionsOf,
  applyPlan,
  mount,
  movedBy,
  withDiagramBeside,
} from "@amykit/core";
import { checkBrief, criteriaOf } from "../src/brief.js";
import { GroomingRecord, plugin as declared } from "../src/plugin.js";

const plugin = withDiagramBeside(declared, import.meta.url);

const GROOMED = [
  { name: "Goal", body: "One currency on every invoice." },
  { name: "Sources", body: "- S1: the finance team asked for it" },
  { name: "Criteria", body: "- C1: the total shows one currency (source: S1)\n- C2: the lines show the same currency (source: S1)" },
  { name: "Out of scope", body: "Converting old invoices." },
];

async function mounted(briefs: Map<string, BriefRecord>) {
  const store: Plugin = { name: "briefs", register: (registry) => {
    registry.port("brief", { get: async (id: string) => briefs.get(id) ?? null });
  } };
  const host: HostServices = { runner: { run: async () => ({ ok: true, exitCode: 0, stdout: "", stderr: "" }) }, now: () => new Date(), paths: { state: "/state" } };
  const outcome = await mount([store, plugin], { [plugin.name]: { repos: [] } }, host);
  if (!outcome.ok) throw new Error(outcome.problems.join("; "));
  const workflow = outcome.mounted.workflow as unknown as Workflow;
  return { workflow, runtime: outcome.mounted.contributions.get(WORKFLOW_RUNTIME)!.get(workflow.name) as WorkflowRuntime };
}

async function look({ workflow, runtime }: Awaited<ReturnType<typeof mounted>>, record: WorkRecord): Promise<{ record: GroomingRecord; plan: Plan }> {
  const observation = await runtime.observe(record);
  const plan = workflow.plan(record, observation, runtime.policy);
  if (plan.kind === "settled") return { record: record as GroomingRecord, plan };
  expect(actionsOf(plan)).toEqual([]);
  const now = new Date("2026-11-08T12:00:00.000Z");
  return { record: runtime.apply(applyPlan(record, plan, now, {}), plan, {}, observation, now, movedBy(record, plan)) as GroomingRecord, plan };
}

const brief = (sections: { name: string; body: string }[]): BriefRecord => ({ id: "TBO-1", sections, questions: [], explains: [], createdAt: "", updatedAt: "", revision: 1 });

describe("a feature is groomed into a brief", () => {
  it("waits as a look while the brief is missing or refused, then returns the criteria it settled", async () => {
    const briefs = new Map<string, BriefRecord>();
    const machine = await mounted(briefs);
    let record = machine.runtime.newRecord("TBO-1/BRIEF#1", new Date()) as GroomingRecord;

    const missing = await look(machine, record);
    expect(missing.plan).toMatchObject({ kind: "wait", why: "the brief of TBO-1 is still being groomed: there is no brief yet" });

    briefs.set("TBO-1", brief([...GROOMED.slice(0, 2), { name: "Criteria", body: "- C1: one currency" }, GROOMED[3]!]));
    const refused = await look(machine, missing.record);
    expect(refused.plan).toMatchObject({ kind: "wait", why: expect.stringContaining("`C1: one currency` is not `C<n>: what holds (source: S<n>)`") });
    expect(refused.record.attempts.GROOMING ?? 0).toBe(0);

    briefs.set("TBO-1", brief(GROOMED));
    record = (await look(machine, refused.record)).record;
    expect(record.state).toBe("BRIEFED");
    expect(record.criteria).toEqual(["C1", "C2"]);
    expect((await look(machine, record)).plan.kind).toBe("settled");
    expect(declared.brief?.sections).toEqual(["Goal", "Sources", "Criteria", "Out of scope"]);
  });

  it("refuses a criterion citing a source the brief does not list, and one named twice", () => {
    const refusals = checkBrief({ sections: [{ name: "Sources", body: "S1: asked" }, { name: "Criteria", body: "C1: a (source: S2)\nC1: b (source: S1)" }] });

    expect(refusals).toEqual([
      { section: "Criteria", rule: "C1 cites S2, which Sources does not list" },
      { section: "Criteria", rule: "C1 is named twice" },
    ]);
    expect(criteriaOf({ sections: [{ name: "Criteria", body: "- C3: x (source: S1)" }] })).toEqual(["C3"]);
  });
});
