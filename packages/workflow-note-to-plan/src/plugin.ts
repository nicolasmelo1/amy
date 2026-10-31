import {
  BRANCH_SETTINGS,
  Action,
  ActionContext,
  ActionHandler,
  ConfigSchema,
  Harness,
  Notifier,
  Store,
  WorkflowPieceContext,
  Worktree,
  call,
  defineWorkflow,
  optional,
  port,
} from "@amykit/core";
import { plugin as pullRequest } from "@amykit/workflow-pull-request";
import { Effect, decide } from "./decide.js";
import { DEFAULT_POLICY, Observation, Policy } from "./observation.js";
import { PlanRecord } from "./record.js";
import { Notes } from "./ports/Notes.js";
import { PlanCheck } from "./ports/PlanCheck.js";
import { planRuntime } from "./actions.js";
import { branchFor, pullRequestTitle } from "./plan-file.js";

export const configSchema = {
  repos: {
    type: "string[]",
    required: true,
    description: "the repositories a plan may be written into. A note about anything else is handed back to the operator",
  },
  ...BRANCH_SETTINGS,
  policy: {
    type: "record",
    description: "maxDraftAttempts, maxOpenPlansPerRepo and ceilingBackoffMs. Anything left out keeps its default",
    default: {},
  },
} satisfies ConfigSchema;

const needs = {
  notes: port<Notes>(),
  agent: port<Harness>(),
  "plan-check": port<PlanCheck>(),
  notifier: port<Notifier>(),
  store: port<Store<PlanRecord>>(),
  worktree: optional<Worktree>(),
};

type Scope = WorkflowPieceContext<typeof configSchema, Policy, typeof needs>;
const built = new WeakMap<Scope, ReturnType<typeof planRuntime>>();

function runtimeFor(scope: Scope): ReturnType<typeof planRuntime> {
  const existing = built.get(scope);
  if (existing) return existing;
  const runtime = planRuntime({
    notes: scope.ports.notes,
    agent: scope.ports.agent,
    check: scope.ports["plan-check"],
    notifier: scope.ports.notifier,
    records: scope.ports.store,
    ...scope.checkouts,
    now: scope.ctx.now,
    config: { repos: scope.config.repos },
    policy: scope.policy,
  });
  built.set(scope, runtime);
  return runtime;
}

async function run(scope: Scope, work: ActionContext<PlanRecord, Observation>, effect: Action): Promise<void> {
  const handler = runtimeFor(scope).actions[effect.type] as ActionHandler<PlanRecord, Observation>;
  await handler(effect, work);
}

/**
 * A note saved in `PR_OPEN` before it was a call worked out nothing to pass,
 * so it is opened with what its record still says, against the host's default.
 */
function openingAfterUpgrade(work: PlanRecord) {
  const slug = work.slug ?? work.id;
  return { repo: work.repo ?? "", branch: branchFor(slug), title: pullRequestTitle(slug), body: "" };
}

export const plugin = defineWorkflow({
  name: "note-to-plan",
  pluginName: "@amykit/workflow-note-to-plan",
  configSchema,
  policy: DEFAULT_POLICY,
  needs,
  codeHostWrites: ["open-pull-request"],
  calls: {
    // The pull request is opened by the workflow every shipped workflow
    // shares, against whichever code host the install mounted.
    PR_OPEN: call(pullRequest, {
      input: (work: PlanRecord) => work.opening ?? openingAfterUpgrade(work),
      output: {
        OPENED: (work: PlanRecord, out) => ({ ...work, pullRequestNumber: out.number }),
        REFUSED: (work: PlanRecord, out) => ({ ...work, refusal: out.reason }),
      },
      // The one way into DECLINED that nothing else announces.
      effects: {
        REFUSED: (work: PlanRecord, out) => [{
          type: "announce",
          text:
            `The plan for ${work.repo ?? "the repository"} is written on \`${work.opening?.branch ?? "its branch"}\`, ` +
            `and the code host would not open a pull request for it: ${out.reason}`,
        }],
      },
    }),
  },
  decide,
  record: () => ({}),
  discover: (scope) => runtimeFor(scope).found(),
  observe: (scope, record) => runtimeFor(scope).observe(record),
  actions: {
    "draft-plan": run,
    "check-plan": run,
    // Only worth saying, so a channel that fails never costs the work a move.
    announce: (scope, _work, effect) => scope.announce((effect as Extract<Effect, { type: "announce" }>).text),
  },
  remember: (scope, record, outcomes, observation, moved, decision, now) =>
    runtimeFor(scope).apply(record, decision, outcomes, observation, now, moved),
});

