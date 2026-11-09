import type { BriefOperation, BriefRecord, BriefRefusal } from "@amykit/core";
import { parse as parseYaml } from "yaml";
import { z } from "zod";

/**
 * The scenario a brief settles while grooming: what proves the unit, as data.
 *
 * One proving workflow walks every scenario, so a task needing one request
 * and one needing two apps, a fixture and a person differ here and nowhere
 * else. A step calls an operation a mounted plugin offers, by id: the
 * proving plugin learns no driver, and the core learns no scenario.
 */

/** The brief section the scenario is written in. */
export const SCENARIO_SECTION = "Scenario";

const expectation = z.object({
  /** A dotted path into the operation's output; the whole output when unsaid. */
  path: z.string().min(1).optional(),
  /** The value it must equal; any value present holds when unsaid. */
  equals: z.unknown().optional(),
}).strict();

const operationCall = z.object({
  operation: z.string().min(1),
  input: z.record(z.string(), z.unknown()).default({}),
}).strict();

const step = z.discriminatedUnion("kind", [
  z.object({ id: z.string().min(1), kind: z.literal("deterministic"), operation: z.string().min(1), input: z.record(z.string(), z.unknown()).default({}) }).strict(),
  z.object({ id: z.string().min(1), kind: z.literal("agent"), prompt: z.string().min(1) }).strict(),
  z.object({ id: z.string().min(1), kind: z.literal("human"), ask: z.string().min(1), deadlineMs: z.number().int().positive() }).strict(),
  z.object({
    id: z.string().min(1),
    kind: z.literal("wait-until"),
    operation: z.string().min(1),
    input: z.record(z.string(), z.unknown()).default({}),
    expect: expectation,
    deadlineMs: z.number().int().positive(),
    everyMs: z.number().int().positive().default(1000),
  }).strict(),
]);

const assertion = z.object({
  id: z.string().min(1),
  /** The brief's criterion this assertion answers, when it answers one. */
  criterion: z.string().min(1).optional(),
  step: z.string().min(1),
  path: z.string().min(1).optional(),
  equals: z.unknown().optional(),
}).strict();

const scenarioSchema = z.object({
  name: z.string().min(1),
  resources: z.array(z.string().min(1)).default([]),
  fixtures: z.array(z.string().min(1)).default([]),
  steps: z.array(z.unknown()).min(1),
  assertions: z.array(assertion).min(1),
}).strict();

export type Expectation = z.infer<typeof expectation>;
export type OperationCall = z.infer<typeof operationCall>;
export type Step = z.infer<typeof step>;
export type Assertion = z.infer<typeof assertion>;
export interface Scenario {
  readonly name: string;
  readonly resources: readonly string[];
  readonly fixtures: readonly string[];
  readonly steps: readonly Step[];
  readonly assertions: readonly Assertion[];
}

export const fixtureSchema = z.object({
  ensure: z.array(z.object({
    /** Reads the world: the state holds when its output meets the expectation. */
    check: operationCall.extend({ expect: expectation.default({}) }),
    /** What moves the world to the state, when it differs; a person is asked when there is none. */
    act: operationCall.optional(),
  }).strict()).min(1),
}).strict();
export type Fixture = z.infer<typeof fixtureSchema>;

/** What reading a scenario found: the scenario, or every reason it is not one. */
export type Read = { readonly scenario: Scenario; readonly problems: readonly [] } | { readonly scenario?: undefined; readonly problems: readonly string[] };

/**
 * A step is deterministic unless it says otherwise: one written without a
 * `kind` is read as `deterministic`, so a scenario of plain calls needs no
 * vocabulary beyond the operation and its input.
 */
function withKind(raw: unknown): unknown {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw) || "kind" in raw) return raw;
  return { ...raw, kind: "deterministic" };
}

/** Reads the scenario a brief's section carries, as YAML. */
export function readScenario(text: string): Read {
  let raw: unknown;
  try {
    raw = parseYaml(text);
  } catch (error) {
    return { problems: [`it is not YAML: ${error instanceof Error ? error.message.split("\n")[0] : String(error)}`] };
  }
  const read = scenarioSchema.safeParse(raw);
  if (!read.success) return { problems: read.error.issues.map(issueText) };
  const problems: string[] = [];
  const steps: Step[] = [];
  read.data.steps.forEach((one, at) => {
    const parsed = step.safeParse(withKind(one));
    if (parsed.success) steps.push(parsed.data);
    else problems.push(...parsed.error.issues.map((issue) => `steps.${at}${issue.path.length > 0 ? "." : ""}${issueText(issue)}`));
  });
  const ids = new Set<string>();
  for (const one of steps) {
    if (ids.has(one.id)) problems.push(`the step \`${one.id}\` is named twice`);
    ids.add(one.id);
  }
  for (const one of read.data.assertions) {
    if (!ids.has(one.step)) problems.push(`the assertion \`${one.id}\` reads the step \`${one.step}\`, which the scenario does not have`);
  }
  if (problems.length > 0) return { problems };
  return { scenario: { ...read.data, steps }, problems: [] };
}

function issueText(issue: z.core.$ZodIssue): string {
  return issue.path.length > 0 ? `${issue.path.join(".")}: ${issue.message}` : issue.message;
}

/** The scenario section of a brief, or undefined when the brief does not answer it. */
export function scenarioText(brief: Pick<BriefRecord, "sections"> | null): string | undefined {
  const body = brief?.sections.find((section) => section.name === SCENARIO_SECTION)?.body;
  return body === undefined || body.trim() === "" ? undefined : body;
}

/** The steps that reach the system through an operation, rather than through a person or a model alone. */
function callsTheSystem(scenario: Scenario): boolean {
  return scenario.steps.some((one) => one.kind === "deterministic" || one.kind === "wait-until");
}

/**
 * The brief check the proving phase declares: the scenario reads, calls the
 * system rather than leaving the walkthrough's fake world its only actor, and
 * every step names an operation a mounted plugin offers with an input that
 * operation's schema accepts.
 */
export function checkScenario(brief: Pick<BriefRecord, "sections">, operations: readonly BriefOperation[]): BriefRefusal[] {
  const text = scenarioText(brief);
  if (text === undefined) return [{ section: SCENARIO_SECTION, rule: "the brief names no scenario, so nothing can prove it" }];
  const read = readScenario(text);
  if (!read.scenario) return read.problems.map((rule) => ({ section: SCENARIO_SECTION, rule }));
  const refusals: BriefRefusal[] = [];
  if (!callsTheSystem(read.scenario)) {
    refusals.push({
      section: SCENARIO_SECTION,
      rule: `the scenario \`${read.scenario.name}\` calls no operation, so the walkthrough's fake world would be its only actor — a step has to reach the real system`,
    });
  }
  const offered = new Map(operations.map((one) => [one.id, one.input]));
  for (const one of read.scenario.steps) {
    if (one.kind !== "deterministic" && one.kind !== "wait-until") continue;
    refusals.push(...callRefusals(`the step \`${one.id}\``, one, offered));
  }
  return refusals;
}

/** What is wrong with one call: the operation nothing offers, or the input its schema refuses. */
function callRefusals(who: string, call: OperationCall, offered: ReadonlyMap<string, Readonly<Record<string, unknown>>>): BriefRefusal[] {
  const schema = offered.get(call.operation);
  if (!schema) return [{ section: SCENARIO_SECTION, rule: `${who} calls \`${call.operation}\`, which no mounted plugin offers` }];
  const checked = inputSchema(schema).safeParse(call.input);
  if (checked.success) return [];
  return [{ section: SCENARIO_SECTION, rule: `${who} hands \`${call.operation}\` an input its schema refuses: ${checked.error.issues.map(issueText).join("; ")}` }];
}

function inputSchema(schema: Readonly<Record<string, unknown>>): z.ZodType {
  const { $schema: _dialect, ...rest } = schema;
  return z.fromJSONSchema(rest as Parameters<typeof z.fromJSONSchema>[0]);
}

/** The value at a dotted path, and whether it was there at all. */
export function at(value: unknown, path: string | undefined): { readonly found: boolean; readonly value?: unknown } {
  if (path === undefined) return { found: true, value };
  let here: unknown = value;
  for (const key of path.split(".")) {
    if (typeof here !== "object" || here === null || !Object.hasOwn(here, key)) return { found: false };
    here = (here as Record<string, unknown>)[key];
  }
  return { found: true, value: here };
}

/** Whether an output meets an expectation: the path is there, and equals what it must when that is said. */
export function meets(output: unknown, expectation: Expectation): boolean {
  const found = at(output, expectation.path);
  if (!found.found) return false;
  return expectation.equals === undefined ? found.value !== undefined && found.value !== null && found.value !== false : same(found.value, expectation.equals);
}

/** Whether two values are equal as data: a mapping's keys in any order, an array's items in theirs. */
export function same(one: unknown, other: unknown): boolean {
  if (Array.isArray(one) || Array.isArray(other)) {
    return Array.isArray(one) && Array.isArray(other) && one.length === other.length && one.every((item, at) => same(item, other[at]));
  }
  if (typeof one === "object" && one !== null && typeof other === "object" && other !== null) {
    const keys = Object.keys(one);
    return keys.length === Object.keys(other).length
      && keys.every((key) => Object.hasOwn(other, key) && same((one as Record<string, unknown>)[key], (other as Record<string, unknown>)[key]));
  }
  return Object.is(one, other);
}
