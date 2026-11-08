import { Plan, WorkRecord, act, advance, settled, wait } from "@amykit/core";
import { AssertionResult, StepResult, blocking, evaluate, holds } from "./assertions.js";
import type { Resource } from "./resources.js";
import { Fixture, OperationCall, Scenario, Step } from "./scenario.js";

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
  /** The calls each agent step made this run, kept as its replay only if its assertions pass. */
  agentCalls?: Record<string, OperationCall[]>;
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
  | { type: "finish"; outcome: "proven" | "refused"; why: string };

type Decision = (record: ProveRecord, observation: Observation, policy: Policy) => Plan;

/** The step the run takes next: the first with no result. */
export function nextStep(record: ProveRecord): Step | undefined {
  const done = record.results ?? {};
  return record.scenario?.steps.find((one) => !Object.hasOwn(done, one.id));
}

/**
 * The steps that keep a run from holding whatever its assertions say: one
 * that failed, or one nothing could evaluate, means the scenario did not
 * hold against the system, asserted on or not.
 */
export function stepsBlocking(record: ProveRecord): string[] {
  return Object.entries(record.results ?? {}).flatMap(([step, result]) => (result.status === "done" ? [] : [`the step \`${step}\` ${result.status === "failed" ? "failed" : "could not be evaluated"}: ${result.why}`]));
}

/** An end of the run: the move, and the effect that records the proof and lets go of what it held. */
function end(outcome: "PROVEN" | "refused", why: string, ...before: Effect[]): Plan {
  return advance(outcome, why, ...before, { type: "finish", outcome: outcome === "PROVEN" ? "proven" : "refused", why });
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
      return end("refused", `the scenario needs ${unknown.map((one) => `\`${one}\``).join(", ")}, which no configured resource is`);
    }
    const missing = needed.filter((one) => !(record.held ?? []).includes(one));
    if (missing.length === 0) return advance("PREPARING", needed.length > 0 ? `holds a seat on ${needed.map((one) => `\`${one}\``).join(", ")}` : "the scenario needs no resource");
    return wait(holding(policy, policy.seatRetryMs), `waiting for a seat on ${missing.map((one) => `\`${one}\``).join(", ")}`, { type: "lease" });
  },

  PREPARING: (record, observation, policy) => {
    const lost = lostLease(observation);
    if (lost) return lost;
    if (record.failed) return end("refused", record.failed);
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
      const broken = [...stepsBlocking(record), ...(holds(assertions) ? [] : blocking(assertions))];
      return broken.length === 0 ? end("PROVEN", `every step and assertion of \`${record.scenario?.name}\` passed`) : end("refused", broken.join("; "));
    }
    if (step.kind === "human") return advance("ASKING", `the step \`${step.id}\` asks a person`, { type: "ask", step: step.id, question: step.ask, deadlineMs: step.deadlineMs });
    const since = step.kind === "wait-until" ? record.untilSince?.[step.id] : undefined;
    if (step.kind === "wait-until" && since) {
      // The next check comes no later than the deadline, so a check past it
      // is the one that fails the step rather than one that passes late.
      const left = Date.parse(since) + step.deadlineMs - Date.parse(observation.now);
      return wait(holding(policy, Math.max(1, Math.min(step.everyMs, left))), `waiting until \`${step.operation}\` holds for \`${step.id}\``, { type: "run-step", step: step.id });
    }
    // A wait-until's first check is a look like its later ones: what costs an
    // attempt is a step that acts, not one that reads until the world agrees.
    if (step.kind === "wait-until") return act(`check \`${step.id}\``, { attempt: false }, { type: "run-step", step: step.id });
    return act(`run \`${step.id}\``, { type: "run-step", step: step.id });
  },

  ASKING: (record, observation, policy) => {
    const asking = record.asking;
    if (!asking) return advance(record.fixtureAsk ? "PREPARING" : "RUNNING", "nothing is being asked");
    // The deadline before the seats: a run nobody answered in time is over,
    // whether or not its seats outlived the wait, and an answer that came
    // after the deadline is not one in time however soon it is read.
    const reply = observation.reply && observation.reply.at <= asking.deadlineAt ? observation.reply : undefined;
    if (!reply && observation.now >= asking.deadlineAt) {
      return end("refused", `nobody answered \`${asking.step ?? asking.fixture}\` before ${asking.deadlineAt}`, { type: "escalate" });
    }
    const lost = lostLease(observation);
    if (lost) return lost;
    if (reply) {
      return asking.fixture
        ? advance("PREPARING", `${reply.author} made the fixture \`${asking.fixture}\` hold`)
        : advance("RUNNING", `${reply.author} answered \`${asking.step}\``);
    }
    return wait(holding(policy, policy.askEveryMs), `waiting on a person for \`${asking.step ?? asking.fixture}\``, { type: "renew" });
  },

  PROVEN: () => settled("the scenario held against the real system, and the proof is recorded"),
  refused: () => settled("the scenario did not hold, and what did not is recorded"),
} satisfies Record<ProveState, Decision>;
