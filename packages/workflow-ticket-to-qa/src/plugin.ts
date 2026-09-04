import {
  CodeHost,
  ConfigSchema,
  Notifier,
  Plan,
  Plugin,
  PluginContext,
  WORKFLOW_RUNTIME,
  WorkflowRuntime,
} from "@amy/core";
import { Observation, DEFAULT_POLICY, Policy } from "./observation.js";
import { Agent } from "./ports/Agent.js";
import { Gate } from "./ports/Gate.js";
import { Tracker } from "./ports/Tracker.js";
import { Roster } from "./roster.js";
import { TicketRecord } from "./record.js";
import { ticketRuntime } from "./runtime.js";
import { ticketToQa } from "./machine.js";

/**
 * The collection the host puts this workflow's data in.
 *
 * Today's roster is neither a port nor a setting: it changes daily, lives in
 * its own file, and reading it is something the host knows how to do. It is
 * contributed and read when a tick needs it, so confirming the roster takes
 * effect without a restart.
 */
export const WORKFLOW_DATA = "workflow-data";

/** Something one plugin contributes for another to read when it is needed. */
export interface Provider<T> {
  read(): T;
}

export const configSchema: ConfigSchema = {
  repos: {
    type: "string[]",
    required: true,
    description: "every repository review load is counted across",
  },
  qaStatusName: {
    type: "string",
    required: true,
    description: "the status a ticket moves to when it is handed to QA",
  },
  policy: {
    type: "record",
    description:
      "maxImplementAttempts, maxGateAttempts, pollBackoffMs, rosterBackoffMs and maxOpenReviewsPerReviewer. Anything left out keeps its default",
    default: {},
  },
};

/**
 * The runtime built for one mount, keyed by that mount's context.
 *
 * The exported plugin is a module singleton, so a field on it would be shared
 * by every host in the process and the second mount would answer with the
 * first one's ports.
 */
const runtimes = new WeakMap<PluginContext, WorkflowRuntime<TicketRecord, Observation>>();

function runtimeFor(ctx: PluginContext): WorkflowRuntime<TicketRecord, Observation> {
  const existing = runtimes.get(ctx);
  if (existing) return existing;

  const built = ticketRuntime({
    tracker: required<Tracker>(ctx, "tracker"),
    host: required<CodeHost>(ctx, "code-host"),
    agent: required<Agent>(ctx, "agent"),
    gate: required<Gate>(ctx, "gate"),
    notifier: required<Notifier>(ctx, "notifier"),
    roster: () => provided<Roster>(ctx, "roster"),
    now: ctx.now,
    log: ctx.log,
    config: {
      repos: ctx.config.repos as string[],
      qaStatusName: ctx.config.qaStatusName as string,
    },
    policy: { ...DEFAULT_POLICY, ...(ctx.config.policy as Partial<Policy>) },
  });

  runtimes.set(ctx, built);
  return built;
}

/**
 * This workflow, as a plugin: the order its states happen in, and how each of
 * its actions runs.
 *
 * Both halves are here on purpose. The decision is pure and the runtime is
 * not, and neither is an engine's business — an engine that reached for a
 * tracker itself would drive this workflow and no other, whatever its types
 * said.
 */
export const plugin: Plugin = {
  name: "@amy/workflow-ticket-to-qa",
  version: "0.1.0",
  configSchema,
  register(registry, ctx) {
    registry.workflow(ticketToQa);

    // Not built now: the ports it needs are mounted by plugins that may be
    // listed after this one, and mounting order should not be something an
    // operator has to get right. `ready` builds it while boot can still
    // refuse, and this is the fallback for a host that mounts without that
    // second pass.
    const lazily = (): WorkflowRuntime<TicketRecord, Observation> => runtimeFor(ctx);

    registry.contribute(WORKFLOW_RUNTIME, ticketToQa.name, {
      get policy(): unknown {
        return lazily().policy;
      },
      found: (): Promise<string[]> => lazily().found(),
      newRecord: (workId: string, now: Date): TicketRecord => lazily().newRecord(workId, now),
      observe: (record: TicketRecord): Promise<Observation> => lazily().observe(record),
      handlers: () => lazily().handlers(),
      apply: (
        record: TicketRecord,
        plan: Plan,
        outcomes: Record<string, unknown>,
        observation: Observation,
        now: Date,
      ): TicketRecord => lazily().apply(record, plan, outcomes, observation, now),
    } satisfies WorkflowRuntime<TicketRecord, Observation>);
  },

  /**
   * Builds the runtime while boot can still refuse.
   *
   * A missing port is an install that cannot run a ticket, and it costs a
   * boot naming the port rather than somebody's ticket halfway through.
   */
  ready(ctx) {
    runtimeFor(ctx);
  },
};

/** A port this workflow cannot work without. */
function required<T>(ctx: PluginContext, kind: string): T {
  const port = ctx.port(kind);
  if (!port) {
    throw new Error(`the ticket-to-qa workflow needs the \`${kind}\` port, and nothing mounted it`);
  }
  return port as T;
}

function provided<T>(ctx: PluginContext, name: string): T {
  const entry = ctx.contributions(WORKFLOW_DATA).get(name);
  if (!entry) {
    throw new Error(
      `the ticket-to-qa workflow needs \`${name}\` in the \`${WORKFLOW_DATA}\` collection`,
    );
  }
  return (entry as Provider<T>).read();
}
