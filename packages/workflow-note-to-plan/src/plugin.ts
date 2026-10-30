import {
  BRANCH_SETTINGS,
  Action,
  ActionContext,
  ActionHandler,
  CodeHost,
  ConfigSchema,
  Harness,
  Notifier,
  Store,
  WorkflowPieceContext,
  Worktree,
  defineWorkflow,
  optional,
  port,
} from "@amykit/core";
import { Effect, decide } from "./decide.js";
import { DEFAULT_POLICY, Observation, Policy } from "./observation.js";
import { PlanRecord } from "./record.js";
import { Notes } from "./ports/Notes.js";
import { PlanCheck } from "./ports/PlanCheck.js";
import { planRuntime } from "./actions.js";

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
  "code-host": port<CodeHost>(),
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
    host: scope.ports["code-host"],
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

export const plugin = defineWorkflow({
  name: "note-to-plan",
  pluginName: "@amykit/workflow-note-to-plan",
  configSchema,
  policy: DEFAULT_POLICY,
  needs,
  codeHostWrites: ["open-pull-request"],
  decide,
  record: () => ({}),
  discover: (scope) => runtimeFor(scope).found(),
  observe: (scope, record) => runtimeFor(scope).observe(record),
  actions: {
    "draft-plan": run,
    "check-plan": run,
    "open-pull-request": run,
    // Only worth saying, so a channel that fails never costs the work a move.
    announce: (scope, _work, effect) => scope.announce((effect as Extract<Effect, { type: "announce" }>).text),
  },
  remember: (scope, record, outcomes, observation, moved, decision, now) =>
    runtimeFor(scope).apply(record, decision, outcomes, observation, now, moved),
});

