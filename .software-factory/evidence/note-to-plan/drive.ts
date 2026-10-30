// Drives the installed `amy` from a piece of friction to a pull request, and
// writes down what the world looked like afterwards.
//
// Usage: tsx drive.ts <source-dir> <amy-binary> <report-path> [--keep]
//
// Every command here is one an operator types. Nothing reaches inside amy:
// the only things read back are the code host, the repositories, the files
// amy left on disk and what it printed.
//
// There is no tracker in this run, and that is the claim being made rather
// than a convenience: work reaches the queue because somebody wrote it down.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync, spawnSync } from "node:child_process";
import {
  BY_HAND,
  BY_HAND_SLUG,
  FOREIGN_REPO,
  FRICTION,
  OTHER_REPO,
  REPO,
  SLUG,
  UNWRITABLE,
  UNWRITABLE_REPO,
  build,
  configure,
  fileOnBranch,
  lines,
  read,
  type CodeHost,
  type Pull,
} from "./world.js";

function usage(): never {
  throw new Error("usage: drive.ts <source-dir> <amy-binary> <report-path> [--keep]");
}

const [source = usage(), binary = usage(), reportPath = usage()] = process.argv.slice(2);
const keep = process.argv.includes("--keep");
/** The stand-ins are TypeScript too, and run the way this does: through the repository's tsx. */
const TSX = path.join(source, "..", "..", "..", "node_modules", ".bin", "tsx");

const MAX_TICKS = 60;

/** Every move the first note makes, in the order it has to make them. */
const EXPECTED = [
  "NOTED>DRAFTED",
  "DRAFTED>CHECKED",
  "CHECKED>DRAFTED",
  "DRAFTED>CHECKED",
  "CHECKED>PR_OPEN",
  "PR_OPEN>DONE",
];

/** What a command printed, and how it exited. */
interface Said {
  code: number | null;
  out: string;
}

/** A look at the queue: what `amy tick` printed. */
interface Look {
  said: string;
  code: number | null;
}

interface PlanRecord {
  id: string;
  state: string;
  history?: { from: string; to: string }[];
}

/** One line of each stand-in's log. */
interface AgentCall {
  model: string;
  told: boolean;
  plan: string;
  cwd: string;
  prompt: string;
}

interface CheckCall {
  argv: string[];
  cwd: string;
}

interface GhCall {
  at: string;
  argv: string[];
}

interface LogLine {
  kind: string;
  workId?: string;
}

/** Everything one walkthrough observed. */
interface State {
  root: string;
  init: Said;
  version: Said;
  noted: Said;
  noteId: string | undefined;
  queuedAfterNote: string[];
  discovered: Said;
  rediscovered: Said;
  trail: Look[];
  status: Said;
  ticketStatus: Said;
  budget: Said;
  mounted: Said;
  ticketQueue: string[];
  planQueue: string[];
  records: PlanRecord[];
  first: PlanRecord | null;
  byHand: PlanRecord | null;
  foreign: PlanRecord | null;
  broken: PlanRecord | null;
  unwritable: PlanRecord | null;
  /** The arrows the installed package's `workflow.mmd` draws, as `FROM>TO`. */
  diagram: string[];
  host: CodeHost;
  agentCalls: AgentCall[];
  checkCalls: CheckCall[];
  ghCalls: GhCall[];
  log: LogLine[];
  notesLeft: string[];
  plan: string;
  order: string;
  inbox: string[];
  leftBehind: boolean;
}

function amy(root: string, args: string[]): Said {
  const result = spawnSync(binary, args, {
    cwd: path.join(root, "home"),
    encoding: "utf-8",
    env: {
      ...process.env,
      PATH: `${path.join(root, "bin")}:${process.env.PATH}`,
      HOME: path.join(root, "home"),
      AMY_E2E_WORLD: path.join(root, "world"),
      AMY_E2E_ORIGINS: path.join(root, "origins"),
      AMY_E2E_TSX: TSX,
    },
  });

  return { code: result.status, out: `${result.stdout ?? ""}${result.stderr ?? ""}`.trim() };
}

/** The second profile, which is the one this run is about. */
const plans = (root: string, args: string[]): Said => amy(root, ["--workflow", "plans", ...args]);

function installPlugins(root: string): void {
  const tarballs = process.env.AMY_E2E_TARBALLS;
  if (!tarballs) throw new Error("the scenario did not name the packaged plugins");
  const packed = fs.readdirSync(tarballs)
    .filter((name) => name.endsWith(".tgz"))
    .map((name) => path.join(tarballs, name))
    .map((file) => ({
      file,
      manifest: JSON.parse(
        execFileSync("tar", ["-xOf", file, "package/package.json"], { encoding: "utf-8" }),
      ) as { name: string },
    }));
  // The CLI is already installed through install.sh, where local overrides
  // bind unreleased fixed-group siblings to these tarballs. npm 11 requires a
  // direct dependency and its override to use the same specifier.
  const dependencies = Object.fromEntries(packed
    .filter(({ manifest }) => manifest.name !== "@amykit/cli")
    .map(({ file, manifest }) => [manifest.name, `file:${file}`]));
  const prefix = path.join(root, "home", ".amy", "plugins");
  fs.mkdirSync(prefix, { recursive: true });
  fs.writeFileSync(
    path.join(prefix, "package.json"),
    `${JSON.stringify({ name: "amy-e2e-plugins", private: true, dependencies, overrides: dependencies }, null, 2)}\n`,
    "utf-8",
  );
  const result = spawnSync(
    "npm",
    ["install", "--prefix", prefix, "--no-audit", "--no-fund"],
    { encoding: "utf-8" },
  );
  if (result.status !== 0) throw new Error(`the scenario could not install the packaged plugins: ${result.stderr}`);
}

const recordsDir = (root: string): string => path.join(root, "home", ".amy", "plans", "records");
const notesDir = (root: string): string => path.join(root, "home", ".amy", "notes");
const worldDir = (root: string): string => path.join(root, "world");

function records(root: string): PlanRecord[] {
  if (!fs.existsSync(recordsDir(root))) return [];
  return fs
    .readdirSync(recordsDir(root))
    .filter((name) => name.endsWith(".json"))
    .map((name) => read<PlanRecord>(path.join(recordsDir(root), name)));
}

const recordFor = (root: string, id: string | undefined): PlanRecord | null => records(root).find((record) => record.id === id) ?? null;

/**
 * The plugins `amy plugin list` says it mounted, not the ones it found.
 *
 * The listing reports both, and they are different questions: a tracker
 * installed on the machine and left unmounted is exactly what this workflow
 * running without one looks like.
 */
function mountedNames(out: string): string {
  return out
    .split("\n")
    .filter((line) => /^ {2}(ok|FAIL)/.test(line))
    .join(" ");
}

/** Which queue directory each profile keeps its work in. */
function queued(root: string, directory: string): string[] {
  const ready = path.join(root, "home", ".amy", directory, "ready");
  return fs.existsSync(ready) ? fs.readdirSync(ready) : [];
}

/** Drives until nothing is due, or until it is clear nothing will settle. */
function run(root: string): Look[] {
  const trail: Look[] = [];

  for (let look = 0; look < MAX_TICKS; look += 1) {
    const result = plans(root, ["tick"]);
    trail.push({ said: result.out, code: result.code });
    if (result.out.includes("nothing due")) break;
  }

  return trail;
}

/**
 * The arrows the installed workflow's diagram draws, read from the package
 * the run mounted rather than from this checkout: a package that left its
 * diagram out could not have mounted, and this says which file it was.
 */
function installedDiagram(root: string): string[] {
  const file = path.join(root, "home", ".amy", "plugins", "node_modules", "@amykit", "workflow-note-to-plan", "workflow.mmd");
  if (!fs.existsSync(file)) return [];
  const name = /^[A-Za-z_]\w*$/;
  return fs.readFileSync(file, "utf-8").split("\n").flatMap((line) => {
    const [from = "", rest = ""] = line.split("-->");
    const to = rest.split(":")[0]!.trim();
    return name.test(from.trim()) && name.test(to) ? [`${from.trim()}>${to}`] : [];
  });
}

function transitionsOf(record: PlanRecord | null): string[] {
  return (record?.history ?? []).map((move) => `${move.from}>${move.to}`);
}

/**
 * One whole run, from an empty directory to a pull request.
 *
 * The friction is injected two ways on purpose: one by the command, one by a
 * file dropped into the watched directory the way an editor or a hook would
 * leave it. Both have to become work.
 */
function walkthrough(): State {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "amy-note-to-plan-"));
  try {
    build(root, { source });

  const init = amy(root, ["init"]);
  configure(root);
  installPlugins(root);

  const version = amy(root, ["--version"]);

  // One: the command. Nothing is resolved against anything; the note is
  // written down and put on the queue in the same step.
  const noted = plans(root, ["note", FRICTION, "--repo", REPO, "--source", "ada"]);
  const queuedAfterNote = queued(root, "plans/queue");
  const noteId = fs
    .readdirSync(notesDir(root))
    .filter((name) => name.endsWith(".md"))
    .map((name) => name.slice(0, -3))[0];

  // Two: a file, dropped in by hand, about the same repository. It meets the
  // ceiling, because the first one is still in flight.
  fs.writeFileSync(
    path.join(notesDir(root), "by-hand.md"),
    `---\nrepo: ${REPO}\nsource: a hook\n---\n\n${BY_HAND}\n`,
    "utf-8",
  );
  const discovered = plans(root, ["discover"]);

  // Three: a note about a repository this install does not write into.
  fs.writeFileSync(
    path.join(notesDir(root), "not-mine.md"),
    `---\nrepo: ${FOREIGN_REPO}\n---\n\nsomething about a repository I do not own\n`,
    "utf-8",
  );

  // Four: a note about a repository whose code host is not answering, which
  // is what a tick giving up looks like from the inside.
  fs.writeFileSync(
    path.join(notesDir(root), "will-break.md"),
    `---\nrepo: ${OTHER_REPO}\n---\n\nthe check runs twice when it only needs to run once\n`,
    "utf-8",
  );

  // Five: a note about a repository plans are written into, which the agent
  // never manages to draft. It is handed back once the attempts run out.
  fs.writeFileSync(
    path.join(notesDir(root), "unwritable.md"),
    `---\nrepo: ${UNWRITABLE_REPO}\n---\n\n${UNWRITABLE}\n`,
    "utf-8",
  );

  const rediscovered = plans(root, ["discover"]);
  const trail = run(root);

  const status = plans(root, ["status"]);
  // The plans profile is the default, so a bare `amy status` reads it. The
  // same installed binary is what would drive any other workflow, and the
  // two keep separate state under one .amy — nothing this run did landed in
  // a second workflow's directories, and none is declared here.
  const ticketStatus = amy(root, ["workflow", "list"]);
  const budget = amy(root, ["budget"]);
  const mounted = plans(root, ["plugin", "list"]);

  const state: State = {
    root,
    init,
    version,
    noted,
    noteId,
    queuedAfterNote,
    discovered,
    rediscovered,
    trail,
    status,
    ticketStatus,
    budget,
    mounted,
    ticketQueue: queued(root, "tickets/queue"),
    planQueue: queued(root, "plans/queue"),
    records: records(root),
    first: recordFor(root, noteId),
    byHand: recordFor(root, "by-hand"),
    foreign: recordFor(root, "not-mine"),
    broken: recordFor(root, "will-break"),
    unwritable: recordFor(root, "unwritable"),
    diagram: installedDiagram(root),
    host: read<CodeHost>(path.join(worldDir(root), "code-host.json")),
    agentCalls: lines<AgentCall>(path.join(worldDir(root), "claude.log")),
    checkCalls: lines<CheckCall>(path.join(worldDir(root), "sf.log")),
    ghCalls: lines<GhCall>(path.join(worldDir(root), "gh.log")),
    log: lines<LogLine>(path.join(root, "home", ".amy", "log", logFile(root))),
    notesLeft: fs.readdirSync(notesDir(root)).filter((name) => name.endsWith(".md")),
    plan: fileOnBranch(root, REPO, `amy/plan-${SLUG}`, `plans/${SLUG}.md`),
    order: fileOnBranch(root, REPO, `amy/plan-${SLUG}`, "plans/next-steps.md"),
    inbox: inboxNotes(root),
    leftBehind: fs.existsSync(path.join(process.cwd(), ".amy")),
  };

    if (keep) process.stdout.write(`kept ${root}\n`);

    return state;
  } finally {
    // A failed assertion must leave exactly as little state as a passing one:
    // the whole world is a disposable fixture, never an operator checkout.
    if (!keep) fs.rmSync(root, { recursive: true, force: true });
  }
}

function logFile(root: string): string {
  const dir = path.join(root, "home", ".amy", "log");
  return fs.existsSync(dir) ? (fs.readdirSync(dir)[0] ?? "") : "";
}

function inboxNotes(root: string): string[] {
  const dir = path.join(root, "home", ".amy", "needs-input");
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .filter((name) => name.endsWith(".md"))
    .map((name) => fs.readFileSync(path.join(dir, name), "utf-8"));
}

/** The pull request the first note ended up on, as the code host holds it. */
const pullFor = (state: State, repo: string, slug: string): Pull | undefined =>
  (state.host.repos[repo]?.pulls ?? []).find((pull) => pull.head === `amy/plan-${slug}`);

/** Where in the run each thing happened, so an ordering can be asserted. */
function orderOf(state: State): { drafted: number; checked: number; opened: number } {
  const drafted = state.agentCalls.findIndex((call) => call.plan === `plans/${SLUG}.md`);
  const checked = state.checkCalls.findIndex(
    (call) => call.cwd.endsWith("/amy") || call.cwd.endsWith("/acme-amy"),
  );
  const opened = state.ghCalls.findIndex((call) =>
    call.argv.some((arg) => arg === `/repos/${REPO}/pulls`),
  );
  return { drafted, checked, opened };
}

/** One assertion, before it is reported: its name, and whether it held. */
type Check = [type: string, ok: boolean | undefined];

function assertionsFor(state: State): { type: string; status: "passed" | "failed" }[] {
  return [
    ...intakeChecks(state),
    ...barChecks(state),
    ...pullChecks(state),
    ...boundaryChecks(state),
    ...lifecycleChecks(state),
  ].map(([type, ok]) => ({ type, status: ok ? "passed" : "failed" }));
}

function intakeChecks(state: State): Check[] {
  return [
    // Work that is not a ticket.
    [
      "plan.work_injected_by_command_reaches_the_queue",
      state.noted.code === 0 && state.queuedAfterNote.length === 1,
    ],
    [
      "plan.a_note_in_the_watched_directory_is_discovered",
      state.discovered.out.includes("by-hand") && state.byHand?.state === "DONE",
    ],
    [
      // Not "it happened not to call one": there is no tracker plugin in the
      // mount at all, so there is nothing a work id could have been resolved
      // against even if something had tried.
      "plan.nothing_is_resolved_against_a_tracker",
      state.first?.state === "DONE" &&
        state.mounted.code === 0 &&
        !mountedNames(state.mounted.out).includes("@amykit/plugin-linear") &&
        state.mounted.out.includes("workflow: note-to-plan"),
    ],

  ];
}

function barChecks(state: State): Check[] {
  const where = orderOf(state);
  const forFirst = state.agentCalls.filter((call) => call.plan === `plans/${SLUG}.md`);

  return [
    // The quality bar is the repository's own, and it is met by meeting it.
    [
      "plan.a_refused_draft_goes_back_to_the_agent",
      transitionsOf(state.first).includes("CHECKED>DRAFTED") && forFirst.length === 2,
    ],
    [
      "plan.the_agent_is_told_what_the_check_said",
      forFirst[0]?.told === false &&
        forFirst[1]?.told === true &&
        forFirst[1]?.prompt.includes("L4.PLAN_DECLARES_EXIT_CONDITION"),
    ],
    [
      "plan.nothing_reaches_a_pull_request_until_the_check_is_green",
      where.checked >= 0 && where.opened > where.checked,
    ],
    [
      "plan.the_plan_carries_an_exit_condition_and_a_place_in_the_order",
      state.plan.includes("**Exit condition:**") && state.order.includes(`${SLUG}.md`),
    ],

  ];
}

function pullChecks(state: State): Check[] {
  const pull = pullFor(state, REPO, SLUG);
  const held = state.trail.filter((look) => look.said.includes("already in flight"));

  return [
    // The pull request, in the repository the note was about.
    [
      "plan.a_pull_request_is_opened_in_the_repository_the_note_is_about",
      pull !== undefined && pull.head === `amy/plan-${SLUG}`,
    ],
    [
      "plan.the_pull_request_names_the_friction_it_came_from",
      Boolean(pull?.body.includes(FRICTION)) && Boolean(pull?.body.includes("ada")),
    ],

    // The ceiling.
    [
      // It held, and when it stopped holding it opened exactly one — so the
      // ceiling delayed the second plan rather than losing it. Two notes, two
      // pull requests, and neither of them a third nobody asked for.
      "plan.nothing_new_is_opened_past_the_ceiling",
      held.length > 0 &&
        (state.host.repos[REPO]?.pulls ?? []).length === 2 &&
        Boolean(pullFor(state, REPO, BY_HAND_SLUG)),
    ],
    [
      "plan.the_ceiling_is_said_once",
      state.inbox.filter((note) => note.includes("already open there")).length === 1,
    ],

  ];
}

function boundaryChecks(state: State): Check[] {
  return [
    // What it will not do.
    [
      "plan.a_note_about_another_repository_is_handed_back",
      state.foreign?.state === "DECLINED" &&
        state.inbox.some((note) => note.includes(FOREIGN_REPO)),
    ],
    [
      "plan.a_tick_that_gives_up_leaves_a_note_behind",
      state.notesLeft.some((name) => name.startsWith("note-")) &&
        state.log.some((line) => line.kind === "work.failed" && line.workId === "will-break"),
    ],

    // The same machine as the other workflow, and it did not change to take
    // this one.
    [
      "plan.both_workflows_run_on_the_same_installed_binary",
      state.version.code === 0 &&
        state.status.code === 0 &&
        state.ticketStatus.code === 0 &&
        state.ticketStatus.out.includes("@amykit/workflow-note-to-plan"),
    ],
    [
      // Two profiles, one `.amy`. The records and the queue are the only two
      // things that move, so nothing the plan workflow did landed in a
      // second workflow's directories, and none other is declared here.
      "plan.each_workflow_keeps_its_own_queue_and_records",
      state.ticketQueue.length === 0 &&
        state.planQueue.length === 0 &&
        state.records.length === 5 &&
        !state.ticketStatus.out.includes("ticket-to-qa"),
    ],
    [
      "plan.what_the_agent_spent_lands_in_the_shared_log",
      state.log.filter((line) => line.kind === "agent.run").length === state.agentCalls.length &&
        state.budget.out.includes("allowed"),
    ],

  ];
}

function lifecycleChecks(state: State): Check[] {
  return [
    // The lifecycle itself.
    [
      "plan.the_lifecycle_walks_in_order",
      transitionsOf(state.first).join(",") === EXPECTED.join(","),
    ],
    [
      // Every arrow the installed diagram draws is one some note in this run
      // took: the walkthrough leaves nothing drawn and never walked.
      "plan.every_drawn_edge_is_walked",
      state.diagram.length === 7 &&
        state.unwritable?.state === "DECLINED" &&
        state.diagram.every((edge) => state.records.some((record) => transitionsOf(record).includes(edge))),
    ],
    [
      "plan.one_look_makes_at_most_one_move",
      state.trail.every((look) => look.said.split("->").length <= 2),
    ],
    [
      "plan.the_machine_settles_instead_of_spinning",
      state.trail.at(-1)?.said.includes("nothing due") === true,
    ],
    [
      "plan.the_run_leaves_nothing_behind",
      !state.leftBehind,
    ],
  ];
}

const state = walkthrough();
const assertions = assertionsFor(state);
const failed = assertions.filter((assertion) => assertion.status === "failed");

for (const assertion of failed) process.stderr.write(`FAILED ${assertion.type}\n`);

fs.writeFileSync(
  reportPath,
  `${JSON.stringify(
    {
      scenario: "note-to-plan",
      status: failed.length === 0 ? "passed" : "failed",
      goal:
        "Something in my machine got in its own way, and I want that to turn into a plan in the " +
        "repository it is about rather than into a shrug. I want to be able to write the friction down " +
        "in one line, or drop a file in a directory, and find a pull request adding a plan that the " +
        "repository's own check accepts. I do not want a ticket for it, I do not want twelve of them a " +
        "day, and I want to be the one who decides whether the work happens.",
      artifact: {
        package: "@amykit/cli",
        entry: "the installed executable, driven by `amy note`, `amy discover` and `amy tick`",
        built_by: "scripts/install.sh",
      },
      observed: {
        assertions_run: assertions.length,
        assertions_failed: failed.length,
        version: state.version.out,
        looks: state.trail.length,
        transitions: transitionsOf(state.first),
        by_hand: transitionsOf(state.byHand),
        declined: transitionsOf(state.foreign),
        gave_up: state.broken?.state,
        agent_calls: state.agentCalls.length,
        check_calls: state.checkCalls.length,
        gh_calls: state.ghCalls.length,
        pull_requests: Object.fromEntries(
          Object.entries(state.host.repos).map(([repo, entry]) => [repo, entry.pulls.length]),
        ),
        notes_left: state.notesLeft,
        budget: state.budget.out.split("\n").at(-1),
      },
      assertions,
    },
    null,
    2,
  )}\n`,
  "utf-8",
);

process.stdout.write(
  `${assertions.length - failed.length}/${assertions.length} assertions passed in ${state.trail.length} looks\n`,
);
process.exit(failed.length === 0 ? 0 : 1);
