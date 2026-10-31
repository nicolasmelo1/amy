import {
  AttemptOutcome,
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
import { Note } from "../src/ports/Notes.js";
import { PlanRecord } from "../src/record.js";
import { plugin as noteToPlan } from "./drawn.js";

/**
 * The world one note meets, mounted the way the host mounts it: the workflow,
 * the pull-request workflow its `PR_OPEN` calls, and a fake for every port.
 *
 * The world only changes when an action changes it, so nothing passes because
 * an answer was already there before the question was asked.
 */
export class NoteWorld {
  pullRequest: PullRequestView | null = null;
  /** Other plans this machine is carrying, for the ceiling. */
  others: PlanRecord[] = [];
  checkPasses = true;
  /** How many checks come back red before the agent's draft holds, when `checkPasses` is left true. */
  redChecks = 0;
  agentWrites = true;
  /** What the code host answers when asked to open one, when it will not. */
  refusal: string | undefined;
  readonly said: string[] = [];
  readonly opened: { repo: string; branch: string; body: string; draft?: boolean }[] = [];
  private checks = 0;
  private ticks = 0;
  /** A clock that moves every time it is read, so a draft and a check are never at the same instant. */
  readonly now = (): Date => new Date(Date.UTC(2026, 8, 4, 20, 0, 0) + 1000 * ++this.ticks);

  constructor(readonly note: Note, private readonly repos: readonly string[] = [note.repo]) {}

  async mounted(): Promise<{ workflow: Workflow; runtime: WorkflowRuntime }> {
    const outcome = await mount([noteToPlan, ...this.ports()], { [noteToPlan.name]: { repos: [...this.repos] } }, this.host(this.now));
    if (!outcome.ok) throw new Error(outcome.problems.join("; "));
    const workflow = outcome.mounted.workflow as unknown as Workflow;
    return { workflow, runtime: outcome.mounted.contributions.get(WORKFLOW_RUNTIME)!.get(workflow.name) as WorkflowRuntime };
  }

  private host(now: () => Date): HostServices {
    // The agent writes a file, so there is always something to commit.
    const runner = new ScriptedRunner([{ match: whenArgsInclude("status", "--porcelain"), result: { stdout: " M plans/x.md\n" } }]);
    return { runner, now, paths: { workspace: "/checkouts", checkouts: {}, state: "/state" } };
  }

  private ports(): Plugin[] {
    const agent: Harness = {
      name: "relay",
      ask: async () => ({ text: "wrote the plan", run: fakeRun(this.agentWrites ? {} : { outcome: "failed", output: "changed no file" }) }),
    };
    const records: Store<PlanRecord> = { all: () => [...this.others], load: () => null, save: () => undefined };
    const host: CodeHost = fakeHost(null, {
      findPullRequest: async () => this.pullRequest,
      findPullRequestMentioning: async () => null,
      openPullRequest: async (request) => {
        if (this.refusal) throw new CodeHostRefusal(this.refusal);
        this.opened.push({ repo: request.repo, branch: request.branch, body: request.body, ...(request.draft ? { draft: true } : {}) });
        this.pullRequest = pullRequest({ number: 12, url: "https://github.example.test/acme/widgets/pull/12" });
        return 12;
      },
    });
    const ports: Record<string, object> = {
      notes: { all: () => [this.note], get: (id: string) => (id === this.note.id ? this.note : null), write: () => this.note },
      agent,
      "plan-check": { check: async (): Promise<AttemptOutcome> => this.check() },
      "code-host": host,
      notifier: { announce: async ({ text }: { text: string }) => { this.said.push(text); } },
      store: records,
    };
    return Object.entries(ports).map(([kind, impl]) => ({ name: `fake-${kind}`, register: (registry) => registry.port(kind, impl) }));
  }

  private check(): AttemptOutcome {
    this.checks += 1;
    const at = this.now().toISOString();
    return this.checkPasses && this.checks > this.redChecks ? { ok: true, output: "no findings", at } : { ok: false, output: "L4.PLAN_DECLARES_EXIT_CONDITION", at };
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
  limit = 40,
): Promise<{ record: PlanRecord; looks: Look[] }> {
  let record: WorkRecord = runtime.newRecord(id, new Date("2026-09-04T20:00:00.000Z"));
  const looks: Look[] = [];
  for (let step = 0; step < limit; step += 1) {
    const now = new Date(Date.UTC(2026, 8, 4, 20, 1, step));
    const observation = await runtime.observe(record);
    const plan = workflow.plan(record, observation, runtime.policy);
    if (plan.kind === "settled") return { record: record as PlanRecord, looks };
    const outcomes: Record<string, unknown> = {};
    for (const action of actionsOf(plan)) {
      await runAction(implementationOf(runtime, action.type), action, { record, observation, outcomes }, () => undefined);
    }
    const next = runtime.apply(applyPlan(record, plan, now, outcomes), plan, outcomes, observation, now, movedBy(record, plan));
    looks.push({ from: record.state, to: next.state, plan, actions: actionsOf(plan).map((action) => action.type) });
    record = next;
    // The ceiling is the only wait, and the world releases it rather than another look.
    if (plan.kind === "wait") return { record: record as PlanRecord, looks };
  }
  throw new Error(`the machine never settled: ${looks.map((look) => look.to).join(" -> ")}`);
}
