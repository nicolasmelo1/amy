import {
  BriefStore,
  CodeHost,
  ConfigSchema,
  Conversation,
  Git,
  Notifier,
  parseBudget,
  Plugin,
  PluginContext,
  Worktree,
  WORKFLOW_RUNTIME,
  deferred,
  WorkflowRuntime,
} from "@amykit/core";
import { Observation, DEFAULT_POLICY, Policy } from "./observation.js";
import { Agent, Gate, Tracker } from "@amykit/core";
import type { AskContext, HarnessReply } from "@amykit/core";
import { Roster } from "./roster.js";
import { TicketRecord } from "./record.js";
import { ticketRuntime } from "./runtime.js";
import { ticketToQa } from "./machine.js";

/**
 * The collection the host may put this workflow's data in.
 *
 * Today's roster is neither a port nor a setting: it changes daily, lives in
 * its own file, and reading it is knowledge that travels with the workflow —
 * the host contributes it when it knows where the file is, and the workflow
 * falls back to its own reader when nothing did. Read when a tick needs it,
 * so confirming the roster takes effect without a restart.
 */
export const WORKFLOW_DATA = "workflow-data";

/** Something one plugin contributes for another to read when it is needed. */
export interface Provider<T> {
  read(): T;
}

/**
 * The roster, from whoever knows where it lives.
 *
 * The host's contribution wins, because the host is the thing that chose the
 * home directory. Without one the workflow reads the file it knows: a
 * machine running this workflow has `~/.amy/roster.yaml`, or it is missing
 * the one file `amy init` writes, which the error names.
 */
function rosterProvider(readFromHost?: () => Roster): () => Roster {
  if (readFromHost) return readFromHost;
  return () => {
    throw new Error(
      "no roster was contributed, and the workflow does not know where this machine keeps one — run `amy init` first",
    );
  };
}

export const configSchema: ConfigSchema = {
  repos: {
    type: "string[]",
    required: true,
    description: "every repository review load is counted across",
  },
  defaultBranch: {
    type: "string",
    description: "the branch new work is cut from, for a repository that named none, which is not always `main`",
    default: "main",
  },
  baseBranch: {
    type: "record",
    description:
      "where one repository's base branch is, instead of the fallback. A repository named here has its work cut from, and its pull requests opened against, that branch",
    default: {},
  },
  qaStatusName: {
    type: "string",
    required: true,
    description: "the status a ticket moves to when it is handed to QA",
  },
  reviewerHints: {
    type: "record",
    description: "guidance appended to the review prompt when answering a particular reviewer, by host login",
    default: {},
  },
  policy: {
    type: "record",
    description:
      "maxImplementAttempts, maxGateAttempts, pollBackoffMs, rosterBackoffMs, maxOpenReviewsPerReviewer, maxPullRequestFiles, maxPullRequestLines, and writes — `machine` makes the tracker and code-host writes, `operator` hands each one to you once, in the work's thread or through the notifier, waits until it sees it made, and claims no writes at all — and conversation — `answer` reads a reply nobody marked as the decision, `discuss` reads it as a turn in a discussion, answered in the thread while the work waits for a reply marked as the decision. Anything left out keeps its default",
    default: {},
  },
  budget: {
    type: "record",
    description: "agent budget, including an optional progress block that stops repeated no-evidence runs",
    default: {},
  },
};

/** The runtime for one mount, built by the host once every plugin has registered. */
function runtimeFor(ctx: PluginContext): WorkflowRuntime<TicketRecord, Observation> {
  return ticketRuntime({
    tracker: required<Tracker>(ctx, "tracker"),
    conversation: ctx.port("conversation") as Conversation | undefined,
    host: required<CodeHost>(ctx, "code-host"),
    // Both halves of the relay's one port: the ticket-shaped methods this
    // workflow's prompts were written for, and the `ask` the self-review
    // runs on. The relay always mounts both, so the cast is narrowing, not
    // wishing — the same one the errand workflow makes at its own edge.
    agent: required<Agent>(ctx, "agent") as Agent & {
      ask(prompt: string, cwd: string, context?: AskContext): Promise<HarnessReply>;
    },
    gate: required<Gate>(ctx, "gate"),
    notifier: required<Notifier>(ctx, "notifier"),
    roster: () => provided<Roster>(ctx, "roster") ?? rosterProvider()(),
    // The same checkout the gate runs in, for the self-review to read: the
    // gate already runs against the ticket's own branch, so this is the
    // second reader of a layout the host already owns. With a worktree port
    // mounted, the same Git resolves every path through it and the work runs
    // in the ticket's own tree; without one, nothing here changes.
    git: new Git(
      ctx.runner,
      {
        workspaceRoot: ctx.paths.workspace,
        checkouts: ctx.paths.checkouts,
        defaultBranch: ctx.config.defaultBranch as string,
        baseBranch: ctx.config.baseBranch as Record<string, string> | undefined,
      },
      ctx.port("worktree") as Worktree | undefined,
    ),
    // The same layout, named for the question `Git` does not answer: what the
    // pull request opens against. One map, resolved once, at the caller that
    // knows the repository.
    layout: {
      workspaceRoot: ctx.paths.workspace,
      checkouts: ctx.paths.checkouts,
      defaultBranch: ctx.config.defaultBranch as string,
      baseBranch: ctx.config.baseBranch as Record<string, string> | undefined,
    },
    // Optional on purpose: the `brief` port is the persistence seam a
    // grooming workflow's briefs live behind, and an install whose tickets
    // reference none is a real install that mounts and runs exactly as
    // before. A ticket that does reference one is resolved against whatever
    // mounted here, at read time, on every observation.
    briefs: ctx.port("brief") as BriefStore | undefined,
    now: ctx.now,
    log: ctx.log,
    config: {
      repos: ctx.config.repos as string[],
      qaStatusName: ctx.config.qaStatusName as string,
      reviewerHints: ctx.config.reviewerHints as Record<string, string>,
    },
    progress: progressPolicy(ctx),
    policy: { ...DEFAULT_POLICY, ...(ctx.config.policy as Partial<Policy>), writes: writesOf(ctx), conversation: conversationOf(ctx) },
  });
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
  name: "@amykit/workflow-ticket-to-qa",
  configSchema,
  register(registry, ctx) {
    // The claim follows the switch, so a workflow handing its writes to the
    // operator is mounted claiming none, and the mount refuses it any writer.
    registry.workflow(writesOf(ctx) === "operator" ? { ...ticketToQa, trackerWrites: [], codeHostWrites: [] } : ticketToQa);

    // Deferred: the ports it needs are mounted by plugins that may be listed
    // after this one. The host builds it once every plugin has registered, so
    // a port nobody mounted is refused at boot, naming the port.
    registry.contribute(WORKFLOW_RUNTIME, ticketToQa.name, deferred(() => runtimeFor(ctx)));
  },
};

function writesOf(ctx: PluginContext): Policy["writes"] {
  const writes = (ctx.config.policy as Partial<Policy> | undefined)?.writes ?? "machine";
  if (writes !== "machine" && writes !== "operator") {
    throw new Error(`ticket-to-qa policy.writes must be "machine" or "operator", not ${JSON.stringify(writes)}`);
  }
  return writes;
}

function conversationOf(ctx: PluginContext): Policy["conversation"] {
  const conversation = (ctx.config.policy as Partial<Policy> | undefined)?.conversation ?? "answer";
  if (conversation !== "answer" && conversation !== "discuss") {
    throw new Error(`ticket-to-qa policy.conversation must be "answer" or "discuss", not ${JSON.stringify(conversation)}`);
  }
  return conversation;
}

/** A port this workflow cannot work without. */
function required<T>(ctx: PluginContext, kind: string): T {
  const port = ctx.port(kind);
  if (!port) {
    throw new Error(`the ticket-to-qa workflow needs the \`${kind}\` port, and nothing mounted it`);
  }
  return port as T;
}

function provided<T>(ctx: PluginContext, name: string): T | undefined {
  const entry = ctx.contributions(WORKFLOW_DATA).get(name);
  if (!entry) return undefined;
  return (entry as Provider<T>).read();
}

function progressPolicy(ctx: PluginContext) {
  const parsed = parseBudget(ctx.config.budget);
  if (!parsed.ok) throw new Error(parsed.problems.join("; "));
  return parsed.limits.progress;
}
