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
import { PlanRecord } from "./record.js";
import { Notes } from "./ports/Notes.js";
import { PlanCheck } from "./ports/PlanCheck.js";
import { planRuntime } from "./runtime.js";
import { PLAN_STATES, WAITING_STATES } from "./state.js";

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

export const plugin = defineWorkflow({
  name: "note-to-plan",
  pluginName: "@amykit/workflow-note-to-plan",
  states: PLAN_STATES,
  waiting: WAITING_STATES,
  terminal: ["DONE", "DECLINED"],
  configSchema,
  policy: DEFAULT_POLICY,
  needs: {
    notes: port<Notes>(),
    agent: port<Harness>(),
    "plan-check": port<PlanCheck>(),
    "code-host": port<CodeHost>(),
    notifier: port<Notifier>(),
    store: port<Store<PlanRecord>>(),
    worktree: optional<Worktree>(),
  },
  codeHostWrites: ["open-pull-request"],
  plan,
  record: () => ({}),
  runtime: ({ ports, config, policy, checkouts, ctx }) => planRuntime({
    notes: ports.notes,
    agent: ports.agent,
    check: ports["plan-check"],
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

export const noteToPlan = plugin.workflow;
export const newRecord = plugin.newRecord;
