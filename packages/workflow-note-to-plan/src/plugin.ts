import path from "node:path";
import { FileQueue } from "@amykit/plugin-file-queue";
import {
  BRANCH_SETTINGS,
  Action,
  ActionContext,
  ActionHandler,
  ConfigOf,
  ConfigSchema,
  Harness,
  Notifier,
  PluginCommand,
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
import { writeNoteFile } from "./note-file.js";
import { branchFor, pullRequestTitle } from "./plan-file.js";

export const configSchema = {
  repos: {
    type: "string[]",
    required: true,
    description: "the repositories a plan may be written into. A note about anything else is handed back to the operator",
  },
  ...BRANCH_SETTINGS,
  notesDirectory: {
    type: "string",
    description: "where this machine keeps the notes `amy note` writes, relative to the state root. The host sets it; a value here only stands in for one",
    default: "notes",
  },
  policy: {
    type: "record",
    description: "maxDraftAttempts, maxOpenPlansPerRepo and ceilingBackoffMs. Anything left out keeps its default",
    default: {},
  },
} satisfies ConfigSchema;

type Settings = ConfigOf<typeof configSchema>;

/**
 * Friction, written down.
 *
 * A file and a queue entry, and nothing else: the command that captures a
 * complaint has to work on the machine that is complaining, which is exactly
 * the machine whose mount refused. The host carried it for every install
 * because it had nowhere else to put it; here it belongs to the workflow that
 * reads what it writes.
 */
const note: PluginCommand<Settings> = {
  name: "note",
  description: "Write a piece of friction down, and put it on the queue",
  args: [{ name: "text", description: "what went wrong, in your own words" }],
  flags: [
    { flags: "--repo <owner/name>", description: "the repository it is about" },
    { flags: "--source <who>", description: "who noticed", default: "somebody at a keyboard" },
  ],
  run({ home, state, settings, args, options, out }) {
    const repo = (options.repo as string | undefined) ?? settings.repos[0];
    if (!repo) {
      out.error("no repository: pass --repo, or list one under `repos`.");
      process.exitCode = 1;
      return;
    }

    const now = new Date();
    const written = writeNoteFile(
      path.join(home, settings.notesDirectory),
      { repo, text: args[0] ?? "", source: String(options.source ?? "somebody at a keyboard") },
      now,
    );
    new FileQueue(path.join(state, "queue")).enqueue({ workId: written.id, reason: "written down by hand" }, now);

    out.line(`noted ${written.id} about ${repo}`);
  },
};

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
  commands: [note],
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

