import { Plan, WorkRecord, act, advance, settled, wait } from "@amykit/core";
import { AssertionResult, StepResult, blocking, evaluate, holds } from "./assertions.js";
import type { Resource } from "./resources.js";
import { Fixture, Scenario, Step } from "./scenario.js";

export type ProveState = "READING" | "LEASING" | "PREPARING" | "RUNNING" | "ASKING" | "PROVEN" | "refused";

/** Where a person was asked, and about what: a human step, or a fixture nothing could make hold. */
export interface Asking {
  readonly step?: string;
  readonly fixture?: string;
  readonly question: string;
  readonly askedAt: string;
  readonly deadlineAt: string;
  /** The work's thread, when a conversation is mounted. */
  readonly thread?: string;
}

/** Everything the proving walk remembers about one run, between looks. */
export interface ProveRecord extends WorkRecord {
  state: ProveState;
  input?: { criteria?: string[]; priority?: number };
  /** The scenario, as the brief settled it when the run started. */
  scenario?: Scenario;
  briefRevision?: number;
  /** The resources this run holds a seat on. */
  held?: string[];
  /** The resources this run brought up. */
  up?: string[];
  /** The code digest the run proves, once read: null where there is no code. */
  digest?: string | null;
  prepared?: boolean;
  /** Why preparing failed, naming the resource and its check's output. */
  failed?: string;
  /** A fixture nothing could make hold, waiting for a person. */
  fixtureAsk?: { readonly fixture: string; readonly question: string };
  /** Fixtures a person made hold, which are not ensured again this run. */
  heldByPerson?: string[];
  results?: Record<string, StepResult>;
  /** When each wait-until step first checked, its deadline counted from there. */
  untilSince?: Record<string, string>;
  asking?: Asking;
  /** What the run proved, once it ended. */
  verdict?: { readonly assertions: readonly AssertionResult[]; readonly refused?: string };
}

export interface Observation {
  readonly unit: string;
  readonly scenario?: Scenario;
  readonly problems: readonly string[];
  readonly briefRevision: number;
  /** Seats this run held that are not its any more: it stopped renewing, and they expired. */
  readonly lost: readonly string[];
  /** The person's answer, while asking. */
  readonly reply?: { readonly author: string; readonly text: string; readonly at: string };
  readonly now: string;
}

export interface Policy {
  readonly resources: Readonly<Record<string, Resource>>;
  readonly fixtures: Readonly<Record<string, Fixture>>;
  readonly leaseTtlMs: number;
  readonly seatRetryMs: number;
  readonly askEveryMs: number;
  readonly fixtureDeadlineMs: number;
}

export type Effect =
  | { type: "lease" }
  | { type: "renew" }
  | { type: "prepare" }
  | { type: "run-step"; step: string }
  | { type: "ask"; step?: string; fixture?: string; question: string; deadlineMs: number }
  | { type: "escalate" }
  | { type: "finish" };

type Decision = (record: ProveRecord, observation: Observation, policy: Policy) => Plan;

/** The step the run takes next: the first with no result. */
export function nextStep(record: ProveRecord): Step | undefined {
  const done = record.results ?? {};
  return record.scenario?.steps.find((one) => !Object.hasOwn(done, one.id));
}

/** What the run proved: each assertion against the steps' results. */
export function verdictOf(record: ProveRecord): readonly AssertionResult[] {
  return (record.scenario?.assertions ?? []).map((one) => evaluate(one, record.results ?? {}));
}

/**
 * How long a run holding seats may wait between looks: never past half a
 * seat's life, or the look that renews it would come after it ran out.
 */
const holding = (policy: Policy, ms: number): number => Math.min(ms, Math.floor(policy.leaseTtlMs / 2));

const lostLease = (observation: Observation): Plan | undefined => (observation.lost.length > 0
  ? advance("LEASING", `the lease on ${observation.lost.map((one) => `\`${one}\``).join(", ")} ran out, so the run waits for a seat again`)
  : undefined);

export const decide = {
  READING: (_record, observation, policy) => observation.scenario
    ? advance("LEASING", `the brief names the scenario \`${observation.scenario.name}\``)
    : wait(policy.seatRetryMs, `the brief \`${observation.unit}\` names no scenario a run can walk: ${observation.problems.join("; ") || "it has none"}`),

  LEASING: (record, _observation, policy) => {
    const needed = record.scenario?.resources ?? [];
    const unknown = needed.filter((one) => !Object.hasOwn(policy.resources, one));
    if (unknown.length > 0) {
      return advance("refused", `the scenario needs ${unknown.map((one) => `\`${one}\``).join(", ")}, which no configured resource is`, { type: "finish" });
    }
    const missing = needed.filter((one) => !(record.held ?? []).includes(one));
    if (missing.length === 0) return advance("PREPARING", needed.length > 0 ? `holds a seat on ${needed.map((one) => `\`${one}\``).join(", ")}` : "the scenario needs no resource");
    return wait(holding(policy, policy.seatRetryMs), `waiting for a seat on ${missing.map((one) => `\`${one}\``).join(", ")}`, { type: "lease" });
  },

  PREPARING: (record, observation, policy) => {
    const lost = lostLease(observation);
    if (lost) return lost;
    if (record.failed) return advance("refused", record.failed, { type: "finish" });
    if (record.fixtureAsk) {
      return advance("ASKING", `the fixture \`${record.fixtureAsk.fixture}\` cannot reach its state on its own`, {
        type: "ask", fixture: record.fixtureAsk.fixture, question: record.fixtureAsk.question, deadlineMs: policy.fixtureDeadlineMs,
      });
    }
    if (record.prepared) return advance("RUNNING", "the resources are up and every fixture holds");
    return act("bring the resources up and ensure the fixtures", { type: "prepare" });
  },

  RUNNING: (record, observation, policy) => {
    const lost = lostLease(observation);
    if (lost) return lost;
    const step = nextStep(record);
    if (!step) {
      const assertions = verdictOf(record);
      return holds(assertions)
        ? advance("PROVEN", `every assertion of \`${record.scenario?.name}\` passed`, { type: "finish" })
        : advance("refused", blocking(assertions).join("; "), { type: "finish" });
    }
    if (step.kind === "human") return advance("ASKING", `the step \`${step.id}\` asks a person`, { type: "ask", step: step.id, question: step.ask, deadlineMs: step.deadlineMs });
    if (step.kind === "wait-until" && record.untilSince?.[step.id]) {
      return wait(holding(policy, step.everyMs), `waiting until \`${step.operation}\` holds for \`${step.id}\``, { type: "run-step", step: step.id });
    }
    // A wait-until's first check is a look like its later ones: what costs an
    // attempt is a step that acts, not one that reads until the world agrees.
    if (step.kind === "wait-until") return act(`check \`${step.id}\``, { attempt: false }, { type: "run-step", step: step.id });
    return act(`run \`${step.id}\``, { type: "run-step", step: step.id });
  },

  ASKING: (record, observation, policy) => {
    const asking = record.asking;
    if (!asking) return advance(record.fixtureAsk ? "PREPARING" : "RUNNING", "nothing is being asked");
    // The deadline before the seats: a run nobody answered is over, whether
    // or not its seats outlived the wait.
    if (!observation.reply && observation.now >= asking.deadlineAt) {
      return advance("refused", `nobody answered \`${asking.step ?? asking.fixture}\` before ${asking.deadlineAt}`, { type: "escalate" }, { type: "finish" });
    }
    const lost = lostLease(observation);
    if (lost) return lost;
    if (observation.reply) {
      return asking.fixture
        ? advance("PREPARING", `${observation.reply.author} made the fixture \`${asking.fixture}\` hold`)
        : advance("RUNNING", `${observation.reply.author} answered \`${asking.step}\``);
    }
    return wait(holding(policy, policy.askEveryMs), `waiting on a person for \`${asking.step ?? asking.fixture}\``, { type: "renew" });
  },

  PROVEN: () => settled("the scenario held against the real system, and the proof is recorded"),
  refused: () => settled("the scenario did not hold, and what did not is recorded"),
} satisfies Record<ProveState, Decision>;
