import { BRANCH_SETTINGS, BriefStore, ConfigSchema, WorkRecord, advance, defineWorkflow, port, unitOf, wait } from "@amykit/core";
import { BRIEF_SECTIONS, checkBrief, criteriaOf } from "./brief.js";

export const configSchema = {
  repos: { type: "string[]", required: true, description: "repositories whose configured base branch grooming may read" },
  ...BRANCH_SETTINGS,
  "policy.briefLookMs": { type: "number", default: 5 * 60 * 1000, description: "how often a brief still being groomed is looked at again" },
} satisfies ConfigSchema;

/** The feature a brief explains, and what it settled once it is groomed. */
export interface GroomingRecord extends WorkRecord {
  state: "GROOMING" | "BRIEFED";
  criteria?: string[];
}

interface Observation {
  readonly unit: string;
  readonly refusals: readonly string[];
  readonly criteria: readonly string[];
}

/**
 * A feature, groomed into a brief a project's other phases can trust.
 *
 * The brief is written through the brief port by whoever grooms it — a
 * person with `amy-groom` — and this walk waits, as a look, until the brief
 * answers every section it declares and its check accepts it. It then
 * returns the criteria the brief settled: what the work is for and what the
 * proof is asked to show.
 *
 * It mounts no port of its own, so a project's `brief/` can call it: a
 * workflow that registers ports is mounted, never called. Reading the base
 * branch is `amy-groom`'s, and reconciling a tracker's groomed work is
 * `groomFeature`, handed the source and tracker its caller has.
 */
export const plugin = defineWorkflow({
  name: "feature-grooming",
  pluginName: "@amykit/workflow-feature-grooming",
  configSchema,
  policy: { briefLookMs: configSchema["policy.briefLookMs"].default },
  needs: { brief: port<BriefStore>() },
  brief: { sections: [...BRIEF_SECTIONS], check: (record) => checkBrief(record) },
  output: { BRIEFED: (record: GroomingRecord) => ({ criteria: record.criteria ?? [] }) },
  record: () => ({}),
  discover: async () => [],
  async observe(scope, record): Promise<Observation> {
    const unit = unitOf(record);
    const brief = await scope.ports.brief.get(unit);
    if (!brief) return { unit, refusals: ["there is no brief yet"], criteria: [] };
    const blank = BRIEF_SECTIONS.filter((name) => (brief.sections.find((section) => section.name === name)?.body ?? "").trim() === "");
    const refusals = blank.length > 0
      ? blank.map((name) => `${name} is not answered`)
      : checkBrief(brief).map((refusal) => `${refusal.section}: ${refusal.rule}`);
    return { unit, refusals, criteria: criteriaOf(brief) };
  },
  actions: {},
  remember: (_scope, record: GroomingRecord, _outcomes, observation: Observation) =>
    record.state === "BRIEFED" && record.criteria === undefined ? { ...record, criteria: [...observation.criteria] } : record,
  decide: {
    GROOMING: (_record: GroomingRecord, observation: Observation, policy: { briefLookMs: number }) => observation.refusals.length === 0
      ? advance("BRIEFED", `the brief of ${observation.unit} settles ${observation.criteria.length} criteria`)
      : wait(policy.briefLookMs, `the brief of ${observation.unit} is still being groomed: ${observation.refusals.join("; ")}`),
    BRIEFED: () => ({ kind: "settled", why: "the brief is groomed, and what it settled was returned" }),
  },
});
