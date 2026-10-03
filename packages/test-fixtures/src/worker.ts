import {
  Budget,
  BriefStore,
  CodeHost,
  Conversation,
  EventLog,
  Notifier,
  Plan,
  RepoLayout,
  StopSwitch,
  Workflow,
  WorkflowRuntime,
} from "@amykit/core";
import {
  Agent,
  DEFAULT_POLICY,
  Gate,
  Policy,
  Roster,
  TicketGit,
  ticketRuntime,
  ticketToQa,
  Tracker,
} from "@amykit/workflow-ticket-to-qa";
import { fakeAgent, fakeGate, fakeGit, fakeHost, fakeTracker, runtimeConfig, workerConfig } from "./fakes.js";
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
  conversation?: Conversation;
  host?: CodeHost;
  agent?: Agent;
  /** The tree and branch half; a recording fake that always commits, by default. */
  git?: TicketGit;
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
  /** The brief store, when the test is about one ticket reading a brief. */
  briefs?: BriefStore;
  /**
   * The layout the runtime's `Git` resolves, when a test is about what a
   * repository's pull request opens against. Left out, the fixture answers
   * with one `defaultBranch: "main"` for everything, which is the shape an
   * install without a mapping has.
   */
  layout?: RepoLayout;
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
      conversation: overrides.conversation,
      host: overrides.host ?? fakeHost(),
      // An agent that only answers, scripted by step, as the real one is.
      agent: overrides.agent ?? fakeAgent(),
      gate: overrides.gate ?? fakeGate(),
      notifier,
      roster: overrides.roster ?? ((): Roster => roster()),
      now,
      log: overrides.log,
      briefs: overrides.briefs,
      git: overrides.git ?? fakeGit(),
      layout: overrides.layout ?? { workspaceRoot: "/tmp/amy-fixture", defaultBranch: "main" },
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
