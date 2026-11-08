import { describe, expect, it } from "vitest";
import { z } from "zod";
import type { BriefRecord, HostServices, Plugin } from "@amykit/core";
import { defineOperation, defineWorkflow, mount, withDiagram } from "@amykit/core";
import { briefsOf, checkBrief, operationsOffered } from "../src/project.js";
import { shipped } from "../src/skills.js";

/**
 * `amy brief check`: a brief judged against the sections its workflow declares
 * and the check it exports, with the operations the mounted plugins offer.
 * The command prints this result and exits non-zero while it refuses
 * anything; the installed run of the command is the grooming gate's.
 */

const body = (record: BriefRecord, name: string) => record.sections.find((one) => one.name === name)?.body ?? "";

/** A workflow declaring four sections, whose check reads Criteria and Scenario. */
const groomed = withDiagram(defineWorkflow({
  name: "groomed",
  configSchema: {},
  policy: {},
  needs: {},
  record: () => ({}),
  discover: async () => [],
  observe: async () => ({}),
  actions: {},
  decide: { READY: () => ({ kind: "settled", why: "ready" }) },
  brief: {
    sections: ["Goal", "Sources", "Criteria", "Scenario"],
    check(record, { operations }) {
      const refusals: { section: string; rule: string }[] = [];
      for (const line of body(record, "Criteria").split("\n").filter((one) => one.trim() !== "")) {
        if (!/\(source: S\d+\)$/.test(line)) refusals.push({ section: "Criteria", rule: `\`${line}\` names no source` });
      }
      for (const line of body(record, "Scenario").split("\n").filter((one) => one.trim() !== "")) {
        const [id, field] = line.trim().split(" ");
        const offered = operations.find((one) => one.id === id);
        if (!offered) refusals.push({ section: "Scenario", rule: `no mounted plugin offers \`${id}\`` });
        else if (field && !Object.hasOwn((offered.input.properties ?? {}) as object, field)) {
          refusals.push({ section: "Scenario", rule: `\`${id}\` takes no \`${field}\`` });
        }
      }
      return refusals;
    },
  },
}), "stateDiagram-v2\n    [*] --> READY\n    READY --> [*]\n");

const brief = (sections: Record<string, string>): BriefRecord => ({
  id: "invoice-currency",
  sections: Object.entries(sections).map(([name, text]) => ({ name, body: text })),
  questions: [],
  explains: ["BILL-1"],
  createdAt: "2026-11-08T00:00:00.000Z",
  updatedAt: "2026-11-08T00:00:00.000Z",
  revision: 1,
});

const READY = {
  Goal: "One currency on every invoice line.",
  Sources: "S1: the product ticket BILL-1",
  Criteria: "- the total shows one currency (source: S1)",
  Scenario: "browser.open url",
};

const open = [{ id: "browser.open", input: { type: "object", properties: { url: { type: "string" } } } }];

describe("amy brief check", () => {
  it("accepts a brief the workflow's check accepts", async () => {
    const result = await checkBrief(briefsOf(groomed), "invoice-currency", brief(READY), open);

    expect(result.refusals).toEqual([]);
    expect(result.next).toBeNull();
  });

  it("refuses a brief the check refuses, naming the section and the rule", async () => {
    const result = await checkBrief(briefsOf(groomed), "invoice-currency", brief({ ...READY, Criteria: "- the total shows one currency" }), open);

    expect(result.refusals).toEqual([
      { phase: null, workflow: "workflow-groomed", section: "Criteria", rule: "`- the total shows one currency` names no source" },
    ]);
    expect(result.next).toEqual({ phase: null, section: "Criteria" });
  });

  it("refuses every declared section of a brief not stored yet, and asks the first", async () => {
    const result = await checkBrief(briefsOf(groomed), "invoice-currency", null, open);

    expect(result.revision).toBe(0);
    expect(result.refusals.map((one) => one.section)).toEqual(["Goal", "Sources", "Criteria", "Scenario"]);
    expect(result.next).toEqual({ phase: null, section: "Goal" });
  });

  it("refuses a section left blank, which the check is never asked to judge", async () => {
    const result = await checkBrief(briefsOf(groomed), "invoice-currency", brief({ ...READY, Sources: "  \n" }), open);

    expect(result.refusals).toEqual([
      { phase: null, workflow: "workflow-groomed", section: "Sources", rule: "the workflow-groomed workflow asks for it, and the brief does not answer it" },
    ]);
  });

  it("refuses, rather than passes, a brief whose workflow declares sections and no check", async () => {
    const unchecked = { name: "workflow-unchecked", brief: { sections: ["Goal"] } };

    const result = await checkBrief(briefsOf(unchecked), "invoice-currency", brief(READY), open);

    expect(result.refusals).toHaveLength(1);
    expect(result.refusals[0]!.section).toBeUndefined();
    expect(result.refusals[0]!.rule).toContain("declares no brief check");
  });

  it("reports a check that throws as a refusal naming the workflow", async () => {
    const throwing = { name: "workflow-throwing", brief: { sections: ["Goal"], check: () => { throw new Error("the parser broke"); } } };

    const result = await checkBrief(briefsOf(throwing), "invoice-currency", brief(READY), open);

    expect(result.refusals.map((one) => one.rule)).toEqual(["the workflow-throwing workflow's check threw: the parser broke"]);
  });

  it("refuses a workflow's brief declaring no section, or one section twice, where it is defined", () => {
    const declare = (sections: string[]) => () => defineWorkflow({
      name: "malformed", configSchema: {}, policy: {}, needs: {}, record: () => ({}), observe: async () => ({}), actions: {},
      decide: { READY: () => ({ kind: "settled", why: "ready" }) },
      brief: { sections },
    });
    expect(declare([])).toThrow("the malformed workflow's `brief` names no section");
    expect(declare(["Goal", "Goal"])).toThrow("names `Goal` more than once");
  });
});

describe("a brief check sees what the mounted plugins offer", () => {
  const openPage = defineOperation({
    id: "browser.open",
    domain: "browser",
    summary: "Opens a page",
    description: "Opens the page at the url. Changes nothing.",
    input: z.object({ url: z.string().describe("the page") }),
    output: z.object({ title: z.string().describe("its title") }),
    writes: [],
    http: { method: "post", path: "/browser/open" },
    examples: [{ summary: "a page", input: { url: "https://example.com" }, output: { title: "Example" } }],
    async handler() {
      return { title: "Example" };
    },
  });
  const browser: Plugin = { name: "@acme/plugin-browser", operations: [openPage], register() {} };
  const host: HostServices = {
    runner: { run: async () => ({ ok: true, exitCode: 0, stdout: "", stderr: "" }) },
    now: () => new Date("2026-11-08T12:00:00.000Z"),
    paths: { state: "/state" },
  };

  it("hands the check every mounted operation's id and input schema, and refuses a section naming one no plugin offers", async () => {
    const outcome = await mount([browser], {}, host);
    if (!outcome.ok) throw new Error(outcome.problems.join("; "));

    const operations = operationsOffered(outcome.mounted);
    expect(operations.map((one) => one.id)).toEqual(["browser.open"]);
    expect((operations[0]!.input.properties as Record<string, unknown>).url).toMatchObject({ type: "string" });

    const offered = await checkBrief(briefsOf(groomed), "invoice-currency", brief(READY), operations);
    expect(offered.refusals).toEqual([]);

    const unknown = await checkBrief(briefsOf(groomed), "invoice-currency", brief({ ...READY, Scenario: "desktop.click" }), operations);
    expect(unknown.refusals).toEqual([
      { phase: null, workflow: "workflow-groomed", section: "Scenario", rule: "no mounted plugin offers `desktop.click`" },
    ]);

    const field = await checkBrief(briefsOf(groomed), "invoice-currency", brief({ ...READY, Scenario: "browser.open selector" }), operations);
    expect(field.refusals.map((one) => one.rule)).toEqual(["`browser.open` takes no `selector`"]);
  });
});

describe("the section grooming asks next", () => {
  it("asks a refused section it already answered again, before one still unanswered", async () => {
    const { Sources: _skipped, ...rest } = READY;
    const result = await checkBrief(briefsOf(groomed), "invoice-currency", brief({ ...rest, Criteria: "- rounding" }), open);

    expect(result.refusals.map((one) => one.section)).toEqual(["Sources", "Criteria"]);
    expect(result.next).toEqual({ phase: null, section: "Criteria" });
  });
});

describe("the shipped amy-groom", () => {
  const skill = () => shipped().find(([name]) => name === "amy-groom")![1];

  it("asks the sections the workflow declares, through amy, and names none of its own", () => {
    const body = skill();

    expect(body).toContain("amy brief sections --json");
    expect(body).toContain("amy brief check <id> --json");
    expect(body).toContain("amy brief write <id>");
    // No numbered or headed list of sections of its own: every question is
    // about the section the check names next.
    const headed = body.split("\n").map((line) => line.replace(/^(\d+\.|#+|-) \**/, "")).filter((line, at) => line !== body.split("\n")[at]);
    for (const own of ["Sources", "Requirements", "Open questions", "The split", "Criteria", "Scenario"]) {
      expect(headed.filter((line) => line.startsWith(own))).toEqual([]);
    }
  });

  it("names no tracker, no team and no private workflow", () => {
    const body = skill().toLowerCase();

    // The private names are refused across the whole repository by
    // `npm run check:private`, the skill included; these are the public ones.
    for (const name of ["linear", "jira", "github", "gitlab", "slack", "ticket-to-qa", "feature-grooming"]) {
      expect(body).not.toContain(name);
    }
  });
});
