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
import { ErrandRecord } from "./record.js";
import { Tasks } from "./ports/Tasks.js";
import { errandRuntime } from "./actions.js";
import { branchFor } from "./task-file.js";

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

/**
 * An errand saved in `PR_OPEN` before it was a call worked out nothing to
 * pass, so it is opened with what its record still says, against the host's
 * default.
 */
function openingAfterUpgrade(work: ErrandRecord) {
  return { repo: work.repo ?? "", branch: branchFor(work.slug ?? work.id), title: work.slug ?? work.id, body: work.lastAttempt?.output ?? "" };
}

export const plugin = defineWorkflow({
  name: "errand",
  pluginName: "@amykit/workflow-errand",
  configSchema,
  policy: DEFAULT_POLICY,
  needs,
  codeHostWrites: ["open-pull-request"],
  calls: {
    // A draft, because nobody asked for this at the moment it landed. Work
    // somebody is waiting on is not a draft; an errand is something to look
    // at when you want to.
    PR_OPEN: call(pullRequest, {
      input: (work: ErrandRecord) => work.opening ?? openingAfterUpgrade(work),
      config: { draft: true },
      output: {
        OPENED: (work: ErrandRecord, out) => ({ ...work, pullRequestNumber: out.number, pullRequestUrl: out.url }),
        REFUSED: (work: ErrandRecord, out) => ({ ...work, refusal: out.reason }),
      },
      effects: {
        // The link, not the number. This is read on a phone more often than
        // anywhere else, and a number is something you have to go and look up.
        OPENED: (work: ErrandRecord, out) => [{
          type: "announce",
          text: `Done, and it is a draft for you to look at:\n\n${work.asked ?? work.slug ?? work.id}\n\n${out.url}`,
        }],
        REFUSED: (work: ErrandRecord, out) => [{
          type: "announce",
          text:
            `I did this, and the code host would not open a pull request for it:\n\n${work.asked ?? work.slug ?? work.id}\n\n` +
            `${out.reason}\n\nThe branch is \`${work.opening?.branch ?? "unknown"}\`.`,
        }],
      },
    }),
  },
  decide,
  record: () => ({}),
  discover: (scope) => runtimeFor(scope).found(),
  observe: (scope, record) => runtimeFor(scope).observe(record),
  actions: {
    "run-errand": run,
    // Only worth saying, so a channel that fails never costs the work a move.
    announce: (scope, _work, effect) => scope.announce((effect as Extract<Effect, { type: "announce" }>).text),
  },
  remember: (scope, record, outcomes, observation, moved, decision, now) =>
    runtimeFor(scope).apply(record, decision, outcomes, observation, now, moved),
});

