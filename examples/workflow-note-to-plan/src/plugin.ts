import path from "node:path";
import { FileQueue } from "@amykit/plugin-file-queue";
import {
  BRANCH_SETTINGS,
  ConfigOf,
  ConfigSchema,
  Harness,
  Notifier,
  Store,
  Worktree,
  call,
  defineOperation,
  defineWorkflow,
  fail,
  optional,
  port,
  scopeOf,
} from "@amykit/core";
import { z } from "zod";
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
 * A file and a queue entry, and nothing else: the operation that captures a
 * complaint has to work on the machine that is complaining, which is exactly
 * the machine whose mount refused. Here it belongs to the workflow that
 * reads what it writes; `amy note` is its command.
 */
const captureNote = defineOperation({
  id: "note-to-plan.capture-note",
  domain: "note-to-plan",
  summary: "Write a piece of friction down, and put it on the queue",
  description:
    "Writes the friction down as a note file and puts it on the queue in one step, against the repository named or the first of `repos`. " +
    "Never drafts the plan itself, and needs no mounted machine.",
  input: z.object({
    text: z.string().describe("what went wrong, in your own words"),
    repo: z.string().optional().describe("the repository it is about; the first of `repos` when unsaid"),
    source: z.string().default("somebody at a keyboard").describe("who noticed"),
  }),
  output: z.object({
    id: z.string().describe("noted"),
    repo: z.string().describe("about"),
  }),
  errors: { "note-to-plan.no_repository": { description: "no repository was named and `repos` lists none" } },
  writes: ["queue"],
  http: { method: "post", path: "/note-to-plan/notes", status: 201 },
  cli: { words: ["note"], positional: ["text"] },
  examples: [{
    summary: "friction in one repository",
    input: { text: "the gate takes two minutes to say nothing", repo: "acme/amy" },
    output: { id: "2026-11-07-the-gate-takes-two-minutes-to-say-nothing", repo: "acme/amy" },
  }],
  async handler({ text, repo, source }, context) {
    const { home, settings } = scopeOf<Settings>(context, "note-to-plan.capture-note");
    const where = repo ?? settings.repos[0];
    if (!where) return fail("note-to-plan.no_repository", "no repository: pass --repo, or list one under `repos`.");

    const now = new Date();
    const written = writeNoteFile(path.join(home, settings.notesDirectory), { repo: where, text, source }, now);
    new FileQueue(path.join(home, settings.queueDirectory)).enqueue({ workId: written.id, reason: "written down by hand" }, now);
    return { id: written.id, repo: where };
  },
});

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
  operations: [captureNote],
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

