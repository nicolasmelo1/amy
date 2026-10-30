import {
  BRANCH_SETTINGS,
  CodeHost,
  ConfigSchema,
  Harness,
  Notifier,
  Store,
  Worktree,
  defineWorkflow,
  optional,
  port,
} from "@amykit/core";
import { plan } from "./machine.js";
import { DEFAULT_POLICY } from "./observation.js";
import { ErrandRecord } from "./record.js";
import { Tasks } from "./ports/Tasks.js";
import { errandRuntime } from "./runtime.js";

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

export const plugin = defineWorkflow({
  name: "errand",
  pluginName: "@amykit/workflow-errand",
  configSchema,
  policy: DEFAULT_POLICY,
  needs: {
    tasks: port<Tasks>(),
    agent: port<Harness>(),
    "code-host": port<CodeHost>(),
    notifier: port<Notifier>(),
    store: port<Store<ErrandRecord>>(),
    worktree: optional<Worktree>(),
  },
  codeHostWrites: ["open-pull-request"],
  plan,
  record: () => ({}),
  runtime: ({ ports, config, policy, checkouts, ctx }) => errandRuntime({
    tasks: ports.tasks,
    agent: ports.agent,
    host: ports["code-host"],
    notifier: ports.notifier,
    records: ports.store,
    ...checkouts,
    now: ctx.now,
    log: ctx.log,
    config: { repos: config.repos },
    policy,
  }),
});

