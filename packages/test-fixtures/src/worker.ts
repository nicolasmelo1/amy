import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  Budget,
  BriefStore,
  Checkouts,
  CodeHost,
  Conversation,
  EventLog,
  Notifier,
  Plan,
  Plugin,
  RepoLayout,
  StopSwitch,
  WORKFLOW_RUNTIME,
  Workflow,
  WorkflowRuntime,
  mount,
} from "@amykit/core";
import {
  Agent,
  DEFAULT_POLICY,
  Gate,
  Policy,
  Roster,
  TicketGit,
  Tracker,
} from "@amykit/workflow-ticket-to-qa";
import { drawnTicketToQa, ticketToQa } from "./ticket-to-qa.js";
import { fakeAgent, fakeGate, fakeGit, fakeHost, fakeTracker, workerConfig } from "./fakes.js";
import { roster as defaultRoster } from "./builders.js";

/**
 * The world ticket-to-qa is mounted over, for a test: the ports it reaches
 * for, the checkouts it works in, and what the install configured.
 */
export interface TicketMount {
  tracker?: Tracker;
  conversation?: Conversation;
  host?: CodeHost;
  agent?: Agent;
  /** The tree and branch half; a recording fake that always commits, by default. */
  git?: TicketGit;
  gate?: Gate;
  notifier?: Notifier;
  /** The roster the profile holds; the fixture's own, confirmed on its workday, by default. */
  roster?: Roster;
  now?: () => Date;
  log?: EventLog;
  policy?: Policy;
  /** The brief store, when the test is about one ticket reading a brief. */
  briefs?: BriefStore;
  /**
   * The layout the checkouts resolve, when a test is about what a
   * repository's pull request opens against. Left out, one
   * `defaultBranch: "main"` for everything, which is the shape an install
   * without a mapping has.
   */
  layout?: RepoLayout;
}

/** What ticket-to-qa is configured with, for a test. */
const SETTINGS = {
  repos: ["Northwind/northwind-backend"],
  qaStatusName: "In QA",
};

/**
 * ticket-to-qa's runtime as the host builds it from the declaration: mounted
 * over stand-in ports, its lanes composed, and every action handed its ports
 * the way the host hands them. Only the checkouts are lent rather than built
 * from a runner, so a test can read what was prepared and pushed.
 */
export async function mountTicketToQa(options: TicketMount = {}): Promise<WorkflowRuntime> {
  const ports = portsFor(options);
  const world: Plugin = {
    name: "@amykit/plugin-world",
    register: (registry) => {
      for (const [kind, port] of Object.entries(ports)) if (port) registry.port(kind, port);
    },
  };
  const checkouts = lentCheckouts(options.git ?? fakeGit(), options.layout ?? { workspaceRoot: "/tmp/amy-fixture", defaultBranch: "main" });
  const lent: Plugin = {
    name: drawnTicketToQa.name,
    configSchema: drawnTicketToQa.configSchema,
    register: (registry, ctx) => drawnTicketToQa.register(registry, { ...ctx, checkouts: () => checkouts }),
  };
  const settings = { ...SETTINGS, ...(options.policy ? { policy: options.policy } : {}) };
  const outcome = await mount([lent, world], { [drawnTicketToQa.name]: settings }, {
    runner: { run: async () => ({ ok: true, exitCode: 0, stdout: "", stderr: "" }) },
    now: options.now ?? ((): Date => new Date()),
    ...(options.log ? { log: options.log } : {}),
    paths: { workspace: "/tmp/amy-fixture", checkouts: {}, state: "/tmp/amy-fixture/.amy", profile: rosterDirectory(options.roster ?? defaultRoster()) },
  });
  if (!outcome.ok) throw new Error(outcome.problems.join("; "));
  return outcome.mounted.contributions.get(WORKFLOW_RUNTIME)!.get(ticketToQa.name) as WorkflowRuntime;
}

/** The ports a test named, and a stand-in for every one it did not. */
function portsFor(options: TicketMount): Record<string, object | undefined> {
  return {
    tracker: options.tracker ?? fakeTracker(),
    conversation: options.conversation,
    "code-host": options.host ?? fakeHost(),
    // An agent that only answers, scripted by step, as the real one is.
    agent: options.agent ?? fakeAgent(),
    gate: options.gate ?? fakeGate(),
    notifier: options.notifier ?? { announce: async (): Promise<void> => {} },
    brief: options.briefs,
  };
}

/**
 * The fake standing in for a `Git`. A lane takes its checkouts leased, and
 * the fake has no branches to lease, so it lends itself.
 */
function lentCheckouts(git: TicketGit, layout: RepoLayout): Checkouts {
  const lent: TicketGit & { leasedTo(): TicketGit } = Object.assign(Object.create(git) as TicketGit, { leasedTo: () => lent });
  return { git: lent as unknown as Checkouts["git"], layout };
}

/** A profile directory holding one roster, which is where the workflow reads it. */
function rosterDirectory(roster: Roster): string {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "amy-roster-"));
  // JSON is YAML, and says exactly what the builder built.
  fs.writeFileSync(path.join(directory, "roster.yaml"), JSON.stringify(roster), "utf-8");
  return directory;
}

/**
 * What a test wants to vary about an engine driving the ticket workflow.
 *
 * The ports are here rather than on the engine because that is where they
 * live now: the engine holds a queue, a record store and a notifier, and
 * everything that knows what a ticket is arrives through the runtime.
 */
export interface TicketWorkerOverrides extends TicketMount {
  stop?: StopSwitch;
  budget?: Budget;
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

export async function ticketWorkerDeps(overrides: TicketWorkerOverrides = {}): Promise<TicketWorkerDeps> {
  const now = overrides.now ?? ((): Date => new Date());
  const notifier = overrides.notifier ?? { announce: async (): Promise<void> => {} };

  const workflow: Workflow = overrides.plan
    ? { ...ticketToQa, plan: overrides.plan as (r: never, o: never, p: never) => Plan }
    : (ticketToQa as Workflow);

  return {
    workflow,
    runtime: await mountTicketToQa({ ...overrides, now, notifier, policy: overrides.policy ?? DEFAULT_POLICY }),
    notifier,
    now,
    config: { ...workerConfig, ...overrides.config },
    log: overrides.log,
    stop: overrides.stop,
    budget: overrides.budget,
  };
}
