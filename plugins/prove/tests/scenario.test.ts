import { describe, expect, it } from "vitest";
import { defineWorkflow, withDiagram } from "@amykit/core";
import { briefsOf, checkBrief, composeProject, withSection } from "../../../packages/cli/src/project.js";
import { checkScenario, readScenario } from "../src/scenario.js";
import { ProveWorld, newRun, operationsPlugin, prove, walk } from "./world.js";

const OPERATIONS = [
  { id: "http.get", input: { type: "object", properties: { url: { type: "string" } }, required: ["url"], additionalProperties: false } },
  { id: "browser.open", input: { type: "object", properties: { url: { type: "string" } }, required: ["url"] } },
];

const ONE_REQUEST = `
name: the-invoice-answers
steps:
  - id: fetch
    operation: http.get
    input: { url: "https://api.localhost/invoices/1" }
assertions:
  - { id: paid, criterion: C1, step: fetch, path: status, equals: paid }
`;

/** A brief phase written the way a person writes one, asking for a goal. */
const briefPhase = withDiagram(defineWorkflow({
  name: "invoices-brief",
  configSchema: {},
  policy: {},
  needs: {},
  record: () => ({}),
  discover: async () => [],
  observe: async () => ({}),
  actions: {},
  output: { BRIEFED: () => ({ criteria: ["C1"] }) },
  decide: { BRIEFED: () => ({ kind: "settled", why: "briefed" }) },
  brief: { sections: ["Goal"], check: () => [] },
}), "stateDiagram-v2\n  [*] --> BRIEFED\n  BRIEFED --> [*]\n");

const workPhase = withDiagram(defineWorkflow({
  name: "invoices-work",
  configSchema: {},
  policy: {},
  needs: {},
  record: () => ({}),
  discover: async () => [],
  observe: async () => ({}),
  actions: {},
  decide: { OPENED: () => ({ kind: "settled", why: "opened" }) },
}), "stateDiagram-v2\n  [*] --> OPENED\n  OPENED --> [*]\n");

function project() {
  const composed = composeProject({
    profile: { name: "invoices", settings: {} },
    slices: {},
    phases: [
      { phase: "brief", plugin: briefPhase, name: briefPhase.name },
      { phase: "workflow", plugin: workPhase, name: workPhase.name },
      { phase: "prove", plugin: prove, name: prove.name },
    ],
    absent: {},
    root: "/projects/invoices",
  });
  expect(composed.problems).toEqual([]);
  return briefsOf(composed.plugin);
}

describe("a scenario is a section of the brief", () => {
  it("keeps a brief with no scenario from leaving grooming, naming the unit's missing section and the proving phase", async () => {
    const briefs = project();
    const sections = withSection(briefs, null, "Goal", "One currency on every invoice.");
    const brief = { id: "PROJ-12", sections, questions: [], explains: [], createdAt: "", updatedAt: "", revision: 1 };

    const checked = await checkBrief(briefs, "PROJ-12", brief, OPERATIONS);

    expect(checked.id).toBe("PROJ-12");
    expect(checked.refusals).toEqual([
      { phase: "prove", workflow: "@amykit/plugin-prove", section: "Scenario", rule: "`prove/` (@amykit/plugin-prove) asks for it, and the brief does not answer it" },
    ]);
    expect(checked.next).toEqual({ phase: "prove", section: "Scenario" });

    const groomed = { ...brief, sections: withSection(briefs, brief, "Scenario", ONE_REQUEST), revision: 2 };
    expect((await checkBrief(briefs, "PROJ-12", groomed, OPERATIONS)).refusals).toEqual([]);
  });

  it("refuses a step naming an operation no mounted plugin offers, naming the step and the operation", () => {
    const refusals = checkScenario({ sections: [{ name: "Scenario", body: ONE_REQUEST.replace("http.get", "http.fetch") }] }, OPERATIONS);

    expect(refusals).toEqual([{ section: "Scenario", rule: "the step `fetch` calls `http.fetch`, which no mounted plugin offers" }]);
  });

  it("refuses an input the operation's schema refuses, naming the step and the operation", () => {
    const refusals = checkScenario({ sections: [{ name: "Scenario", body: ONE_REQUEST.replace('{ url: "https://api.localhost/invoices/1" }', "{ address: 1 }") }] }, OPERATIONS);

    expect(refusals).toHaveLength(1);
    expect(refusals[0]!.rule).toMatch(/^the step `fetch` hands `http.get` an input its schema refuses: /);
  });

  it("refuses a scenario whose only actor is the walkthrough's fake world, one that calls no operation of the real system", () => {
    const refusals = checkScenario({
      sections: [{
        name: "Scenario",
        body: "name: nobody-acts\nsteps:\n  - { id: look, kind: human, ask: does it work?, deadlineMs: 1000 }\nassertions:\n  - { id: works, step: look }\n",
      }],
    }, OPERATIONS);

    expect(refusals.map((one) => one.rule)).toEqual([
      "the scenario `nobody-acts` calls no operation, so the walkthrough's fake world would be its only actor — a step has to reach the real system",
    ]);
  });

  it("reads a step without a kind as deterministic, and refuses a scenario that is not one by its problems", () => {
    expect(readScenario(ONE_REQUEST).scenario?.steps[0]).toMatchObject({ id: "fetch", kind: "deterministic" });
    expect(readScenario("name: x\nsteps: []\nassertions: []\n").problems.length).toBeGreaterThan(0);
    expect(readScenario("steps: [: : :").problems[0]).toMatch(/^it is not YAML/);
    expect(readScenario("name: x\nsteps:\n  - { id: a, operation: b }\n  - { id: a, operation: b }\nassertions:\n  - { id: z, step: c }\n").problems).toEqual([
      "the step `a` is named twice",
      "the assertion `z` reads the step `c`, which the scenario does not have",
    ]);
  });

  it("runs the scenario against the system the mounted operations reach, and the proof names what it ran against", async () => {
    const world = new ProveWorld();
    world.brief("PROJ-12", ONE_REQUEST);
    const calls: unknown[] = [];
    const mounted = await world.mounted([operationsPlugin("acme-api", { "http.get": (input) => { calls.push(input); return { status: "paid" }; } })]);

    const { record } = await walk(world, mounted, newRun(mounted, "PROJ-12/PROVE#1"));

    expect(record.state).toBe("PROVEN");
    expect(calls).toEqual([{ url: "https://api.localhost/invoices/1" }]);
    const proof = (await import("../src/proof.js")).ProofStore.prototype.get.call(new (await import("../src/proof.js")).ProofStore(`${world.artifacts}/proofs`), "PROJ-12");
    expect(proof).toMatchObject({ unit: "PROJ-12", against: ["acme-api"], assertions: [{ id: "paid", criterion: "C1", status: "passed" }] });
  });
});

describe("one proving diagram walks every scenario", () => {
  const TWO_APPS = `
name: paid-shows-in-both-apps
resources: [api, web]
fixtures: [a-paid-invoice]
steps:
  - { id: settle, kind: wait-until, operation: http.get, input: { url: "https://api.localhost/invoices/2" }, expect: { path: status, equals: paid }, deadlineMs: 10000, everyMs: 1000 }
  - { id: open, operation: browser.open, input: { url: "https://web.localhost/invoices/2" } }
  - { id: look, kind: human, ask: "Does the badge read Paid?", deadlineMs: 60000 }
assertions:
  - { id: settled, criterion: C1, step: settle, path: status, equals: paid }
  - { id: badge, criterion: C2, step: open, path: badge, equals: Paid }
  - { id: seen, criterion: C3, step: look, path: answer }
`;

  it("walks a single request and two apps with a fixture and a human step through the same workflow, no diagram written per task", async () => {
    const config = {
      resources: { api: { capacity: 1, up: "api-up", check: "api-check", down: "api-down" }, web: { capacity: 1, check: "web-check" } },
      fixtures: { "a-paid-invoice": { ensure: [{ check: { operation: "http.get", input: { url: "https://api.localhost/invoices/2" }, expect: { path: "exists", equals: true } }, act: { operation: "invoices.pay", input: {} } }] } },
    };
    const ok = () => ({ ok: true, output: "" });
    const world = new ProveWorld(config, { "api-up": ok, "api-check": ok, "api-down": ok, "web-check": ok });
    world.brief("PROJ-1", ONE_REQUEST);
    world.brief("PROJ-2", TWO_APPS);
    let paid = false;
    let reads = 0;
    const mounted = await world.mounted([operationsPlugin("acme", {
      // The second invoice settles a few reads after it is paid: the wait-until step has to wait for it.
      "http.get": (input) => (input.url === "https://api.localhost/invoices/1" ? { status: "paid" }
        : ++reads > 4 && paid ? { status: "paid", exists: true } : { status: paid ? "pending" : "open", exists: paid }),
      "browser.open": () => ({ badge: "Paid" }),
      "invoices.pay": () => { paid = true; return {}; },
    })]);

    const one = await walk(world, mounted, newRun(mounted, "PROJ-1/PROVE#1"), { throughWaits: true });
    const two = await walk(world, mounted, newRun(mounted, "PROJ-2/PROVE#1"), { throughWaits: true, until: (record) => record.state === "ASKING" && record.asking !== undefined });
    world.answer("thread-PROJ-2", "yes, it reads Paid");
    const done = await walk(world, mounted, two.record, { throughWaits: true });

    expect(one.record.state).toBe("PROVEN");
    expect(done.record.state).toBe("PROVEN");
    const states = (looks: { to: string }[]) => [...new Set(looks.map((look) => look.to))];
    expect(states(one.looks)).toEqual(["LEASING", "PREPARING", "RUNNING", "PROVEN"]);
    expect(states([...two.looks, ...done.looks])).toEqual(["LEASING", "PREPARING", "RUNNING", "ASKING", "PROVEN"]);
    // Both walked one workflow: every state either visited is a state of the one diagram.
    for (const state of [...one.looks, ...two.looks, ...done.looks].map((look) => look.to)) expect(mounted.workflow.states).toContain(state);
    expect(two.looks.filter((look) => look.plan.kind === "wait" && look.from === "RUNNING").length).toBeGreaterThan(0);
    expect(world.ran).toEqual(["api-up", "api-check", "web-check", "api-down"]);
  });
});
