import path from "node:path";
import {
  ActionContext,
  BriefStore,
  Commands,
  ConfigOf,
  ConfigSchema,
  Conversation,
  Harness,
  MountedOperation,
  Moved,
  Notifier,
  OPERATIONS_COLLECTION,
  WorkflowActionScope,
  WorkflowPieceContext,
  defineWorkflow,
  optional,
  port,
} from "@amykit/core";
import { StepResult } from "./assertions.js";
import { Effect, Observation, Policy, ProveRecord, decide, verdictOf } from "./decide.js";
import { ensure, readFixtures } from "./fixtures.js";
import { Leases } from "./lease.js";
import { proofOperations } from "./operations.js";
import { PROOFS_DIRECTORY, ProofStore } from "./proof.js";
import { bringUp, commandsNamed, readResources, takeDown } from "./resources.js";
import { SCENARIO_SECTION, checkScenario, readScenario, scenarioText } from "./scenario.js";
import { Replays, checkUntil, runAgent, runDeterministic, untilMissed } from "./steps.js";

export const configSchema = {
  resources: {
    type: "record",
    default: {},
    description: "what a scenario runs against, by name: `{ capacity, up, check, down }`, each a command the commands port allows. `check` is required",
  },
  fixtures: {
    type: "record",
    default: {},
    description: "states a scenario starts from, shared by name: `{ ensure: [{ check: { operation, input, expect }, act: { operation, input } }] }`",
  },
  digest: {
    type: "string",
    default: "",
    description: "the command, by the name the commands port allows, that prints the digest of the code a proof certifies. Empty where the unit has no code",
  },
  "policy.leaseTtlMs": { type: "number", default: 10 * 60 * 1000, description: "how long a seat on a resource lasts without its run renewing it" },
  "policy.seatRetryMs": { type: "number", default: 30 * 1000, description: "how long a run waits before asking again for a seat or a scenario" },
  "policy.askEveryMs": { type: "number", default: 60 * 1000, description: "how often a run waiting on a person looks for the answer" },
  "policy.fixtureDeadlineMs": { type: "number", default: 24 * 60 * 60 * 1000, description: "how long a person has to make a fixture hold before the run gives up" },
} satisfies ConfigSchema;

type Settings = ConfigOf<typeof configSchema>;

export const needs = {
  brief: port<BriefStore>(),
  notifier: port<Notifier>(),
  conversation: optional<Conversation>(),
  agent: optional<Harness>(),
  commands: optional<Commands>(),
};

type Scope = WorkflowPieceContext<typeof configSchema, Policy, typeof needs>;
type ActionScope = WorkflowActionScope<typeof configSchema, Policy, typeof needs>;
type Work = ActionContext<ProveRecord, Observation>;

/** The unit a run proves: the work the proving phase was called for, its brief's id. */
export function unitOf(record: { readonly id: string }): string {
  return record.id.split("/")[0]!;
}

/** Where a mount keeps its proofs: the project's artifact root, beside the briefs, or the profile's own state. */
export function proofsAt(paths: { readonly state: string; readonly profile?: string; readonly artifacts?: string }): string {
  return path.join(paths.artifacts ?? paths.profile ?? paths.state, PROOFS_DIRECTORY);
}

/** The machine's leases, under Amy home: shared by every project and profile. */
export function leasesAt(home: string): string {
  return path.join(home, "leases");
}

function stores(scope: Scope) {
  const proofs = new ProofStore(proofsAt(scope.ctx.paths));
  return {
    proofs,
    leases: new Leases(leasesAt(scope.ctx.paths.state), scope.ctx.now),
    replays: new Replays(path.join(proofs.directory, "replays")),
  };
}

function ownerOf(scope: Scope, id: string): string | undefined {
  return (scope.ctx.contributions(OPERATIONS_COLLECTION).get(id) as MountedOperation | undefined)?.owner;
}

async function observe(scope: Scope, record: ProveRecord): Promise<Observation> {
  const unit = unitOf(record);
  const now = scope.ctx.now().toISOString();
  const { leases } = stores(scope);
  const lost = (record.held ?? []).filter((resource) => !leases.holds(resource, record.id));
  let read: Pick<Observation, "scenario" | "problems" | "briefRevision"> = { problems: [], briefRevision: record.briefRevision ?? 0 };
  if (record.state === "READING") {
    const brief = await scope.ports.brief.get(unit);
    const text = scenarioText(brief);
    const scenario = text === undefined ? { problems: [`it has no \`${SCENARIO_SECTION}\` section`] } : readScenario(text);
    read = { ...scenario, briefRevision: brief?.revision ?? 0 };
  }
  let reply: Observation["reply"];
  if (record.state === "ASKING" && record.asking?.thread && scope.ports.conversation) {
    const answers = await scope.ports.conversation.replies({ id: record.asking.thread }, record.asking.askedAt);
    const first = answers.find((one) => one.text.trim() !== "");
    if (first) reply = { author: first.author, text: first.text, at: first.at };
  }
  return { unit, ...read, lost, ...(reply ? { reply } : {}), now };
}

/** Renews every seat the run holds, so a run that is still moving never loses one. */
function renew(scope: ActionScope, record: ProveRecord): void {
  const { leases } = stores(scope);
  for (const resource of record.held ?? []) leases.renew(resource, record.id, scope.policy.leaseTtlMs);
}

const actions = {
  lease: async (scope: ActionScope, work: Work) => {
    const { leases } = stores(scope);
    const record = work.record;
    const held = [...(record.held ?? [])];
    for (const resource of record.scenario?.resources ?? []) {
      const claimed = leases.claim({
        resource,
        capacity: scope.policy.resources[resource]!.capacity,
        holder: record.id,
        priority: record.input?.priority ?? 0,
        ttlMs: scope.policy.leaseTtlMs,
      });
      if (claimed.held && !held.includes(resource)) held.push(resource);
    }
    work.outcomes.held = held;
  },

  renew: async (scope: ActionScope, work: Work) => renew(scope, work.record),

  prepare: async (scope: ActionScope, work: Work) => {
    renew(scope, work.record);
    if (work.record.digest === undefined) work.outcomes.digest = await digestOf(scope);
    if (!(await broughtUp(scope, work))) return;
    if (!(await fixturesHold(scope, work))) return;
    work.outcomes.prepared = true;
  },

  "run-step": async (scope: ActionScope, work: Work, effect: Extract<Effect, { type: "run-step" }>) => {
    renew(scope, work.record);
    const record = work.record;
    const step = record.scenario?.steps.find((one) => one.id === effect.step);
    if (!step) throw new Error(`the scenario has no step \`${effect.step}\``);
    const { replays } = stores(scope);
    const operate = scope.operate;
    let result: StepResult | undefined;
    if (step.kind === "deterministic") result = await runDeterministic(step, { operate });
    else if (step.kind === "agent") {
      const agent = scope.ports.agent;
      result = await runAgent(record.scenario!.name, step, {
        operate,
        replays,
        offered: [...scope.ctx.contributions(OPERATIONS_COLLECTION).keys()].sort(),
        ...(agent ? { ask: (prompt: string) => agent.ask(prompt, scope.ctx.paths.profile ?? scope.ctx.paths.state, { workId: record.id, step: step.id }) } : {}),
      });
    } else if (step.kind === "wait-until") {
      const now = scope.ctx.now();
      const since = record.untilSince?.[step.id] ?? now.toISOString();
      const checked = await checkUntil(step, { operate });
      if (checked.holds) result = checked.result;
      else if (now.getTime() - Date.parse(since) >= step.deadlineMs) result = untilMissed(step, checked.result);
      else work.outcomes.untilSince = { ...record.untilSince, [step.id]: since };
    }
    if (result) work.outcomes.result = { step: step.id, result };
  },

  ask: async (scope: ActionScope, work: Work, effect: Extract<Effect, { type: "ask" }>) => {
    const record = work.record;
    renew(scope, record);
    const unit = unitOf(record);
    const now = scope.ctx.now();
    const deadlineAt = new Date(now.getTime() + effect.deadlineMs).toISOString();
    const about = effect.step ? `the step \`${effect.step}\`` : `the fixture \`${effect.fixture}\``;
    let thread: string | undefined;
    if (scope.ports.conversation) {
      const opened = await scope.ports.conversation.open(unit, `Proving ${unit}`);
      await scope.ports.conversation.post(opened, { text: `${effect.question}\n\n(${about} of \`${record.scenario?.name}\`; answer before ${deadlineAt})` });
      thread = opened.id;
    }
    const held = record.held ?? [];
    await scope.ports.notifier.announce({
      workId: record.id,
      state: "ASKING",
      text: `The proof of ${unit} stopped at ${about} and waits on you${thread ? " in its thread" : ""}: ${effect.question}\n` +
        `It holds ${held.length > 0 ? held.map((one) => `\`${one}\``).join(", ") : "no resource"} until you answer, or until ${deadlineAt}.`,
    });
    work.outcomes.asking = {
      ...(effect.step ? { step: effect.step } : {}),
      ...(effect.fixture ? { fixture: effect.fixture } : {}),
      question: effect.question,
      askedAt: now.toISOString(),
      deadlineAt,
      ...(thread ? { thread } : {}),
    };
  },

  escalate: async (scope: ActionScope, work: Work) => {
    const asking = work.record.asking;
    await scope.ports.notifier.announce({
      workId: work.record.id,
      state: "ASKING",
      kind: "gave-up",
      text: `Nobody answered \`${asking?.step ?? asking?.fixture}\` of the proof of ${unitOf(work.record)} by ${asking?.deadlineAt}; ` +
        `the proof is refused and ${(work.record.held ?? []).map((one) => `\`${one}\``).join(", ") || "nothing"} is released.`,
    });
  },

  finish: async (scope: ActionScope, work: Work) => {
    const record = work.record;
    const { leases, proofs } = stores(scope);
    const said: string[] = [];
    for (const name of record.up ?? []) {
      const failed = await takeDown(name, scope.policy.resources[name]!, scope.ports.commands!);
      if (failed) said.push(failed);
    }
    for (const resource of record.scenario?.resources ?? []) leases.release(resource, record.id);
    if (record.scenario) {
      const called = record.scenario.steps.flatMap((one) => (one.kind === "deterministic" || one.kind === "wait-until" ? [one.operation] : []));
      const owners = [...new Set(called.map((id) => ownerOf(scope, id)).filter((owner): owner is string => owner !== undefined))];
      proofs.write({
        unit: unitOf(record),
        scenario: record.scenario.name,
        assertions: verdictOf(record),
        ranBy: "amy",
        manual: false,
        against: [...(record.held ?? []), ...owners],
        codeDigest: record.digest ?? null,
        briefRevision: record.briefRevision ?? 0,
        at: scope.ctx.now().toISOString(),
      });
    }
    for (const line of said) await scope.announce(line);
  },
};

/** Brings up every resource the run has not; false, with why, when one would not come up. */
async function broughtUp(scope: ActionScope, work: Work): Promise<boolean> {
  const up = [...(work.record.up ?? [])];
  for (const name of work.record.scenario?.resources ?? []) {
    if (up.includes(name)) continue;
    const brought = await bringUp(name, scope.policy.resources[name]!, scope.ports.commands!);
    if (!brought.ok) {
      work.outcomes.up = brought.started ? [...up, name] : up;
      work.outcomes.failed = brought.why;
      return false;
    }
    up.push(name);
  }
  work.outcomes.up = up;
  return true;
}

/** Ensures every fixture a person has not already made hold; false when one is missing or needs a person. */
async function fixturesHold(scope: ActionScope, work: Work): Promise<boolean> {
  for (const name of work.record.scenario?.fixtures ?? []) {
    if ((work.record.heldByPerson ?? []).includes(name)) continue;
    const fixture = scope.policy.fixtures[name];
    if (!fixture) {
      work.outcomes.failed = `the scenario starts from the fixture \`${name}\`, which no configured fixture is`;
      return false;
    }
    const ensured = await ensure(name, fixture, scope.operate);
    if (!ensured.holds) {
      work.outcomes.fixtureAsk = { fixture: name, question: ensured.ask };
      return false;
    }
  }
  return true;
}

async function digestOf(scope: ActionScope): Promise<string | null> {
  const name = scope.config.digest;
  if (!name) return null;
  const ran = await scope.ports.commands!.run(name);
  if (!ran.ok) throw new Error(`the digest command \`${name}\` failed (exit ${ran.exitCode ?? "killed"}): ${ran.output}`);
  return ran.output.trim();
}

/** The record fields an action's outcome lands in, under the same names. */
const FOLDED = ["held", "up", "digest", "failed", "fixtureAsk", "prepared", "untilSince", "asking"] as const;

/** Folds what the actions found onto the record, and what leaving a state lets go of. */
function remember(record: ProveRecord, outcomes: Record<string, unknown>, observation: Observation, moved: Moved | null): ProveRecord {
  // The record arrives already moved: where it came from is what `moved` says.
  const from = moved?.from ?? record.state;
  let next = folded(record, outcomes);
  if (from === "READING" && next.state !== "READING" && observation.scenario) {
    next = { ...next, scenario: observation.scenario, briefRevision: observation.briefRevision };
  }
  if (from === "ASKING" && next.state !== "ASKING") next = afterAsking(record, next, observation);
  if (observation.lost.length > 0 && next.state === "LEASING") next = unseated(next, observation);
  return ended(from, record, next, observation);
}

/** The record with what the actions found folded on, each outcome under its field's own name. */
function folded(record: ProveRecord, outcomes: Record<string, unknown>): ProveRecord {
  const next: ProveRecord = { ...record };
  for (const field of FOLDED) if (outcomes[field] !== undefined) Object.assign(next, { [field]: outcomes[field] });
  if (!outcomes.result) return next;
  const { step, result } = outcomes.result as { step: string; result: StepResult };
  return { ...next, results: { ...next.results, [step]: result } };
}

/** On reaching an end, what the run proved, and why it was refused when it was. */
function ended(from: string, before: ProveRecord, after: ProveRecord, observation: Observation): ProveRecord {
  if ((after.state !== "PROVEN" && after.state !== "refused") || from === after.state) return after;
  return { ...after, verdict: { assertions: verdictOf(after), ...(after.state === "refused" ? { refused: refusalOf(from, before, after, observation) } : {}) } };
}

/** Leaving ASKING: a person's answer is the step's result, or the fixture they made hold. */
function afterAsking(before: ProveRecord, after: ProveRecord, observation: Observation): ProveRecord {
  const { asking: _asked, ...next } = after;
  const reply = observation.reply;
  if (reply && before.asking?.step) {
    return { ...next, results: { ...next.results, [before.asking.step]: { status: "done", output: { answer: reply.text, by: reply.author } } } } as ProveRecord;
  }
  if (reply && before.asking?.fixture) {
    const { fixtureAsk: _settled, ...rest } = next;
    return { ...rest, heldByPerson: [...(next.heldByPerson ?? []), before.asking.fixture] } as ProveRecord;
  }
  return next as ProveRecord;
}

/**
 * A lease that ran out is a seat somebody else may have taken: the run
 * waits for one again, and prepares from the start once it has it.
 */
function unseated(record: ProveRecord, observation: Observation): ProveRecord {
  const { prepared: _prepared, fixtureAsk: _fixture, asking: _asking, ...rest } = record;
  return { ...rest, held: (record.held ?? []).filter((one) => !observation.lost.includes(one)), up: [] } as ProveRecord;
}

function refusalOf(from: string, before: ProveRecord, after: ProveRecord, observation: Observation): string {
  if (after.failed) return after.failed;
  if (from === "ASKING") return `nobody answered \`${before.asking?.step ?? before.asking?.fixture}\` before ${before.asking?.deadlineAt}`;
  if (from === "LEASING") return "the scenario needs a resource no configuration names";
  const failing = verdictOf(after).filter((one) => one.status !== "passed");
  return failing.length > 0 ? failing.map((one) => `\`${one.id}\` is ${one.status}`).join("; ") : `refused at ${observation.now}`;
}

/** The criteria a run answered: each criterion an assertion that passed names. */
function answered(record: ProveRecord): string[] {
  return [...new Set((record.verdict?.assertions ?? verdictOf(record)).flatMap((one) => (one.status === "passed" && one.criterion ? [one.criterion] : [])))];
}

/**
 * The proving workflow: one diagram every scenario walks.
 *
 * Proving is a plugin, and amy stays a state machine that moves work from
 * one state to the next: the core learns no scenario, step, resource or
 * driver. What proves the work is the domain's — the app running, the post
 * published, the call made — so a step reaches the world only through an
 * operation some other mounted plugin offers.
 */
export const plugin = defineWorkflow({
  name: "prove",
  pluginName: "@amykit/plugin-prove",
  configSchema,
  // The resources and fixtures join the policy at mount, read from their own
  // settings: only the numbers are the policy block's.
  policy: {
    leaseTtlMs: configSchema["policy.leaseTtlMs"].default,
    seatRetryMs: configSchema["policy.seatRetryMs"].default,
    askEveryMs: configSchema["policy.askEveryMs"].default,
    fixtureDeadlineMs: configSchema["policy.fixtureDeadlineMs"].default,
  } as Policy,
  needs,
  input: {
    criteria: { type: "string[]", default: [], description: "the criteria the brief settled, which the proof answers" },
    priority: { type: "number", default: 0, description: "the work's priority: the next free seat on a resource goes to the highest" },
  },
  output: {
    PROVEN: (record: ProveRecord) => ({ criteria: answered(record), scenario: record.scenario?.name }),
    refused: (record: ProveRecord) => ({ criteria: answered(record), refused: record.verdict?.refused ?? "the proof did not hold" }),
  },
  brief: {
    sections: [SCENARIO_SECTION],
    check: (record, { operations }) => checkScenario(record, operations),
  },
  runtimePolicy: ({ ports, config, policy }) => {
    const resources = readResources(config.resources);
    if (Object.keys(resources).length > 0 || config.digest) {
      const commands = ports.commands;
      if (!commands) throw new Error("the proving plugin names resources or a digest command, and nothing mounted the commands port that runs them");
      const allowed = new Set(commands.available());
      const named = [...commandsNamed(resources), ...(config.digest ? [{ resource: "digest", command: config.digest }] : [])];
      for (const { resource, command } of named) {
        if (!allowed.has(command)) throw new Error(`\`${resource}\` runs \`${command}\`, which the commands port does not allow: it allows ${[...allowed].map((one) => `\`${one}\``).join(", ") || "nothing"}`);
      }
    }
    return { ...policy, resources, fixtures: readFixtures(config.fixtures) };
  },
  operations: proofOperations,
  record: () => ({}),
  discover: async () => [],
  observe,
  actions: actions as never,
  remember: (_scope, record, outcomes, observation, moved) => remember(record, outcomes, observation, moved),
  decide,
});

export type { Settings };
