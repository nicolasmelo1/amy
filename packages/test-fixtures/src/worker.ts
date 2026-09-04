import {
  Budget,
  CodeHost,
  EventLog,
  Notifier,
  Plan,
  StopSwitch,
  Workflow,
  WorkflowRuntime,
} from "@amy/core";
import {
  Agent,
  DEFAULT_POLICY,
  Gate,
  Policy,
  Roster,
  ticketRuntime,
  ticketToQa,
  Tracker,
} from "@amy/workflow-ticket-to-qa";
import { fakeAgent, fakeGate, fakeHost, fakeTracker, runtimeConfig, workerConfig } from "./fakes.js";
import { roster } from "./builders.js";

/**
 * What a test wants to vary about an engine driving the ticket workflow.
 *
 * The ports are here rather than on the engine because that is where they
 * live now: the engine holds a queue, a record store and a notifier, and
 * everything that knows what a ticket is arrives through the runtime.
 */
export interface TicketWorkerOverrides {
  tracker?: Tracker;
  host?: CodeHost;
  agent?: Agent;
  gate?: Gate;
  notifier?: Notifier;
  roster?: () => Roster;
  now?: () => Date;
  log?: EventLog;
  stop?: StopSwitch;
  budget?: Budget;
  policy?: Policy;
  config?: Partial<EngineConfig>;
  /** A decision this workflow would never make, for a test that needs one. */
  plan?: Workflow["plan"];
}

interface EngineConfig {
  staleClaimMs: number;
  retentionDays: number;
  maxItemAttempts: number;
  retryDelayMs: number;
}

/**
 * Everything a `Worker` needs except the queue and the store, which a test
 * builds itself because it reads them afterwards.
 *
 * Structurally typed rather than importing the engine's own types: the engine
 * depends on these fixtures, and a fixture that depended back would be a
 * cycle.
 */
export interface TicketWorkerDeps {
  workflow: Workflow;
  runtime: WorkflowRuntime;
  notifier: Notifier;
  now: () => Date;
  config: EngineConfig;
  log?: EventLog;
  stop?: StopSwitch;
  budget?: Budget;
}

export function ticketWorkerDeps(overrides: TicketWorkerOverrides = {}): TicketWorkerDeps {
  const now = overrides.now ?? ((): Date => new Date());
  const notifier = overrides.notifier ?? { announce: async (): Promise<void> => {} };

  const workflow: Workflow = overrides.plan
    ? { ...ticketToQa, plan: overrides.plan as (r: never, o: never, p: never) => Plan }
    : (ticketToQa as Workflow);

  return {
    workflow,
    runtime: ticketRuntime({
      tracker: overrides.tracker ?? fakeTracker(),
      host: overrides.host ?? fakeHost(),
      agent: overrides.agent ?? fakeAgent(),
      gate: overrides.gate ?? fakeGate(),
      notifier,
      roster: overrides.roster ?? ((): Roster => roster()),
      now,
      log: overrides.log,
      config: runtimeConfig,
      policy: overrides.policy ?? DEFAULT_POLICY,
      // The same boundary `ticketToQa` casts at, for the same reason: this
      // workflow's record and observation are typed, the engine's are not,
      // and the cast lives at the one place they meet.
    }) as unknown as WorkflowRuntime,
    notifier,
    now,
    config: { ...workerConfig, ...overrides.config },
    log: overrides.log,
    stop: overrides.stop,
    budget: overrides.budget,
  };
}
