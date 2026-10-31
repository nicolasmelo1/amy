import {
  CodeHost,
  CodeHostRefusal,
  Harness,
  HostServices,
  Plan,
  Plugin,
  PullRequestView,
  Store,
  WORKFLOW_RUNTIME,
  Workflow,
  WorkflowRuntime,
  WorkRecord,
  actionsOf,
  applyPlan,
  implementationOf,
  mount,
  movedBy,
  runAction,
} from "@amykit/core";
import { ScriptedRunner, fakeHost, fakeRun, pullRequest, whenArgsInclude } from "@amykit/test-fixtures";
import { Task } from "../src/ports/Tasks.js";
import { ErrandRecord } from "../src/record.js";
import { plugin as errand } from "./drawn.js";

export const PULL_REQUEST_URL = "https://github.example.test/acme/widgets/pull/41";

/**
 * The world one errand meets, mounted the way the host mounts it: the
 * workflow, the pull-request workflow its `PR_OPEN` calls, and a fake for
 * every port. The world moves only in response to an action.
 */
export class ErrandWorld {
  pullRequest: PullRequestView | null = null;
  /** Errands already in flight, for the ceiling. */
  others: ErrandRecord[] = [];
  /** Whether the agent gets it done at all. */
  agentSucceeds = true;
  /** Whether what it did left a change to push, or was only an answer. */
  agentChangesSomething = true;
  /** Why it said it would not do this, when it said so. */
  agentDeclines: string | undefined;
  /** What the code host answers when asked to open one, when it will not. */
  refusal: string | undefined;
  readonly said: string[] = [];
  readonly opened: { branch: string; draft: boolean }[] = [];
  private ticks = 0;
  readonly now = (): Date => new Date(Date.UTC(2026, 8, 5, 10, 0, 0) + 1000 * ++this.ticks);

  constructor(readonly task: Task, private readonly repos: readonly string[] = [task.repo]) {}

  async mounted(): Promise<{ workflow: Workflow; runtime: WorkflowRuntime }> {
    const outcome = await mount([errand, ...this.ports()], { [errand.name]: { repos: [...this.repos] } }, this.host());
    if (!outcome.ok) throw new Error(outcome.problems.join("; "));
    const workflow = outcome.mounted.workflow as unknown as Workflow;
    return { workflow, runtime: outcome.mounted.contributions.get(WORKFLOW_RUNTIME)!.get(workflow.name) as WorkflowRuntime };
  }

  private host(): HostServices {
    const changes = this.agentChangesSomething;
    const runner = new ScriptedRunner([
      { match: whenArgsInclude("status", "--porcelain"), result: { stdout: changes ? " M package.json\n" : "" } },
      { match: whenArgsInclude("rev-list", "--count"), result: { stdout: "0\n" } },
      { match: whenArgsInclude("push"), result: { stdout: "Done\n" } },
    ]);
    return { runner, now: this.now, paths: { workspace: "/checkouts", checkouts: {}, state: "/state" } };
  }

  private ports(): Plugin[] {
    const agent: Harness = {
      name: "relay",
      ask: async () => ({
        text: this.agentDeclines ? `I will not.\n${JSON.stringify({ declined: this.agentDeclines })}` : "raised four minor versions",
        run: fakeRun(this.agentSucceeds ? { output: "raised four minor versions" } : { outcome: "failed", output: "the checkout would not resolve" }),
      }),
    };
    const records: Store<ErrandRecord> = { all: () => [...this.others], load: () => null, save: () => undefined };
    const host: CodeHost = fakeHost(null, {
      findPullRequest: async () => this.pullRequest,
      findPullRequestMentioning: async () => null,
      openPullRequest: async (request) => {
        if (this.refusal) throw new CodeHostRefusal(this.refusal);
        this.opened.push({ branch: request.branch, draft: request.draft === true });
        this.pullRequest = pullRequest({ number: 41, url: PULL_REQUEST_URL });
        return 41;
      },
    });
    const ports: Record<string, object> = {
      tasks: { all: () => [this.task], get: (id: string) => (id === this.task.id ? this.task : null), add: () => this.task },
      agent,
      "code-host": host,
      notifier: { announce: async ({ text }: { text: string }) => { this.said.push(text); } },
      store: records,
    };
    return Object.entries(ports).map(([kind, impl]) => ({ name: `fake-${kind}`, register: (registry) => registry.port(kind, impl) }));
  }
}

export interface Look {
  readonly from: string;
  readonly to: string;
  readonly plan: Plan;
  readonly actions: string[];
}

/** Looks the way the engine does until the work settles or waits, and throws if it never does. */
export async function walk(
  { workflow, runtime }: { workflow: Workflow; runtime: WorkflowRuntime },
  id: string,
  start?: WorkRecord,
  limit = 40,
): Promise<{ record: ErrandRecord; looks: Look[] }> {
  let record: WorkRecord = start ?? runtime.newRecord(id, new Date("2026-09-05T10:00:00.000Z"));
  const looks: Look[] = [];
  for (let step = 0; step < limit; step += 1) {
    const now = new Date(Date.UTC(2026, 8, 5, 10, 1, step));
    const observation = await runtime.observe(record);
    const plan = workflow.plan(record, observation, runtime.policy);
    if (plan.kind === "settled") return { record: record as ErrandRecord, looks };
    const outcomes: Record<string, unknown> = {};
    for (const action of actionsOf(plan)) {
      await runAction(implementationOf(runtime, action.type), action, { record, observation, outcomes }, () => undefined);
    }
    const next = runtime.apply(applyPlan(record, plan, now, outcomes), plan, outcomes, observation, now, movedBy(record, plan));
    looks.push({ from: record.state, to: next.state, plan, actions: actionsOf(plan).map((action) => action.type) });
    record = next;
    if (plan.kind === "wait") return { record: record as ErrandRecord, looks };
  }
  throw new Error(`the machine never settled: ${looks.map((look) => look.to).join(" -> ")}`);
}
