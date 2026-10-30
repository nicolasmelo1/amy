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
import { ErrandRecord } from "./record.js";
import { Tasks } from "./ports/Tasks.js";
import { errandRuntime } from "./actions.js";

export const configSchema = {
  repos: {
    type: "string[]",
    required: true,
    description:
      "the repositories an errand may be done in. A task about anything else is handed back to whoever asked",
  },
  ...BRANCH_SETTINGS,
  policy: {
    type: "record",
    description: "maxAttempts, maxInFlight and ceilingBackoffMs. Anything left out keeps its default",
    default: {},
  },
} satisfies ConfigSchema;

const needs = {
  tasks: port<Tasks>(),
  agent: port<Harness>(),
  "code-host": port<CodeHost>(),
  notifier: port<Notifier>(),
  store: port<Store<ErrandRecord>>(),
  worktree: optional<Worktree>(),
};

type Scope = WorkflowPieceContext<typeof configSchema, Policy, typeof needs>;
const built = new WeakMap<Scope, ReturnType<typeof errandRuntime>>();

function runtimeFor(scope: Scope): ReturnType<typeof errandRuntime> {
  const existing = built.get(scope);
  if (existing) return existing;
  const runtime = errandRuntime({
    tasks: scope.ports.tasks,
    agent: scope.ports.agent,
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

async function run(scope: Scope, work: ActionContext<ErrandRecord, Observation>, effect: Action): Promise<void> {
  const handler = runtimeFor(scope).actions[effect.type] as ActionHandler<ErrandRecord, Observation>;
  await handler(effect, work);
}

export const plugin = defineWorkflow({
  name: "errand",
  pluginName: "@amykit/workflow-errand",
  configSchema,
  policy: DEFAULT_POLICY,
  needs,
  codeHostWrites: ["open-pull-request"],
  decide,
  record: () => ({}),
  discover: (scope) => runtimeFor(scope).found(),
  observe: (scope, record) => runtimeFor(scope).observe(record),
  actions: {
    "run-errand": run,
    "open-pull-request": run,
    // Only worth saying, so a channel that fails never costs the work a move.
    announce: (scope, _work, effect) => scope.announce((effect as Extract<Effect, { type: "announce" }>).text),
  },
  remember: (scope, record, outcomes, observation, moved, decision, now) =>
    runtimeFor(scope).apply(record, decision, outcomes, observation, now, moved),
});

