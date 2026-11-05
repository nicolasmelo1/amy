import path from "node:path";
import { FileQueue } from "@amykit/plugin-file-queue";
import {
  BRANCH_SETTINGS,
  ConfigOf,
  ConfigSchema,
  Harness,
  Notifier,
  PluginCommand,
  Store,
  Worktree,
  call,
  defineWorkflow,
  optional,
  port,
} from "@amykit/core";
import { plugin as pullRequest } from "@amykit/workflow-pull-request";
import { Effect, decide } from "./decide.js";
import { DEFAULT_POLICY } from "./observation.js";
import { PlanRecord } from "./record.js";
import { Notes } from "./ports/Notes.js";
import { PlanCheck } from "./ports/PlanCheck.js";
import { checkPlan, discover, draftPlan, observe, remember } from "./actions.js";
import { writeNoteFile } from "./note-file.js";
import { branchFor, pullRequestTitle } from "./plan-file.js";

export const configSchema = {
  repos: {
    type: "string[]",
    required: true,
    example: ["Northwind/amy"],
    description: "the repositories a plan may be written into. A note about anything else is handed back to the operator",
  },
  check: {
    type: "record",
    description:
      "the check commands per repository, with a `default` fallback, that judge a plan before it goes anywhere. `sf check` is the whole quality bar in a repository that has one; the plan-check plugin mounts them",
    default: { default: ["sf check"] },
  },
  ...BRANCH_SETTINGS,
  notesDirectory: {
    type: "string",
    description: "where this machine keeps the notes `amy note` writes, relative to the state root. The host sets it; a value here only stands in for one",
    default: "notes",
  },
  queueDirectory: {
    type: "string",
    description: "where this machine keeps the queue `amy note` puts the note on, relative to the state root. The host sets it; a value here only stands in for one",
    default: "queue",
  },
  "policy.maxDraftAttempts": {
    type: "number",
    default: 3,
    description: "how many times an agent may try to write a plan the check accepts before it is handed back",
  },
  "policy.maxOpenPlansPerRepo": {
    type: "number",
    default: 2,
    description:
      "how many plans this machine may carry in flight for one repository. A machine that files twelve plans a day into three repositories is producing a backlog with a robot's name on it, and past this many it holds",
  },
  "policy.ceilingBackoffMs": {
    type: "number",
    default: 60 * 60 * 1000,
    description: "how long a note is held while the plan ceiling is reached",
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
  run({ home, settings, args, options, out }) {
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
    new FileQueue(path.join(home, settings.queueDirectory)).enqueue({ workId: written.id, reason: "written down by hand" }, now);

    out.line(`noted ${written.id} about ${repo}`);
  },
};

export const needs = {
  notes: port<Notes>(),
  agent: port<Harness>(),
  "plan-check": port<PlanCheck>(),
  notifier: port<Notifier>(),
  store: port<Store<PlanRecord>>(),
  worktree: optional<Worktree>(),
};

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
  // A project is brief, work and proof; a plan is the work half alone. The
  // friction note a plan comes from already says what the work is, and the
  // plan check the install runs before the pull request is what judges it.
  phases: {
    brief: "the friction note a plan is written from already says what the work is, so no brief phase runs first",
    prove: "the plan check the machine runs on every draft is what judges a plan; the work runs no separate proving phase",
  },
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
  discover,
  observe,
  actions: {
    "draft-plan": draftPlan,
    "check-plan": checkPlan,
    // Only worth saying, so a channel that fails never costs the work a move.
    announce: (scope, _work, effect) => scope.announce((effect as Extract<Effect, { type: "announce" }>).text),
  },
  remember,
});

