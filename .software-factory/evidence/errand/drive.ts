// Drives the installed `amy` through five errands, and writes down what the
// world looked like afterwards.
//
// Usage: tsx drive.ts <source-dir> <amy-binary> <report-path> [--keep]
//
// Every command here is one an operator types. Nothing reaches inside amy:
// the only things read back are the code host, the repositories, the files
// amy left on disk and what it printed.
//
// There is no tracker in this run, and that is the claim being made rather
// than a convenience: an errand is something somebody said in passing, so
// there was never a ticket for any of it.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync, spawnSync } from "node:child_process";
import {
  BY_HAND_ADDED_AT,
  BY_HAND_ID,
  BY_HAND_SOURCE,
  CHANGE_BRANCH,
  CHANGE_TASK,
  CLOSED_TASK,
  COMMITTED_BRANCH,
  COMMITTED_TASK,
  FOREIGN_REPO,
  FOREIGN_TASK,
  QUESTION_BRANCH,
  QUESTION_TASK,
  REFUSAL,
  REFUSED_BY_HOST,
  REFUSE_TASK,
  REPO,
  build,
  branches,
  configure,
  fileOnBranch,
  lines,
  read,
  tree,
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

const MAX_TICKS = 90;

/** Every move the errand that changed something makes, in the order it must. */
const EXPECTED = ["QUEUED>WORKING", "WORKING>PR_OPEN", "PR_OPEN>DONE"];

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

interface ErrandRecord {
  id: string;
  state: string;
  repo?: string;
  slug?: string;
  attempts?: Record<string, number>;
  history?: { from: string; to: string; why: string }[];
  changed?: boolean;
  pullRequestNumber?: number;
  /** The call it is waiting on, while it is in one. */
  calling?: string;
  /** Every call it made, each the called workflow's own record. */
  calls?: Record<string, { id: string; state: string; input?: { repo?: string; branch?: string } }>;
}

/** One line of the stand-in agent's log. */
interface AgentCall {
  at: string;
  model: string;
  task: string;
  asked: number;
  cwd: string;
  prompt: string;
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
  /** The remark typed at `amy btw`, in the words of whoever typed it. */
  btw: Said;
  taskId: string;
  taskFile: string;
  queuedAfterBtw: string[];
  discovered: Said;
  rediscovered: Said;
  trail: Look[];
  status: Said;
  workflowList: Said;
  mounted: Said;
  /** What this machine's command line says it can do. */
  help: Said;
  /** A command another workflow would have brought. */
  roster: Said;
  /** The doctor, on the machine that reviews nobody. */
  doctor: Said;
  diagram: string[];
  records: ErrandRecord[];
  change: ErrandRecord | null;
  question: ErrandRecord | null;
  committed: ErrandRecord | null;
  refusal: ErrandRecord | null;
  closed: ErrandRecord | null;
  foreign: ErrandRecord | null;
  host: CodeHost;
  agentCalls: AgentCall[];
  ghCalls: GhCall[];
  log: LogLine[];
  inbox: string[];
  originBranches: string[];
  ledgerBefore: Record<string, string>;
  ledgerAfter: Record<string, string>;
  changeManifest: string;
  committedChangelog: string;
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
      // `HOME` alone is not isolation: an `AMY_HOME` exported by whoever ran
      // the harness outranks it, and the run would then be driving — and
      // writing to — the caller's own machine.
      AMY_HOME: amyHome(root),
      AMY_E2E_WORLD: path.join(root, "world"),
      AMY_E2E_ORIGINS: path.join(root, "origins"),
      AMY_E2E_TSX: TSX,
    },
  });

  return { code: result.status, out: `${result.stdout ?? ""}${result.stderr ?? ""}`.trim() };
}

/** The profile this run is about. */
const errand = (root: string, args: string[]): Said => amy(root, ["--workflow", "errand", ...args]);

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

const amyHome = (root: string): string => path.join(root, "home", ".amy");
const tasksDir = (root: string): string => path.join(amyHome(root), "tasks");
const recordsDir = (root: string, profile: string): string => path.join(amyHome(root), profile, "records");
const queueDir = (root: string, profile: string): string => path.join(amyHome(root), profile, "queue");
const inboxDir = (root: string): string => path.join(amyHome(root), "needs-input");
const treesDir = (root: string): string => path.join(root, "trees");
const originsDir = (root: string): string => path.join(root, "origins");

function records(root: string, profile = "errand"): ErrandRecord[] {
  if (!fs.existsSync(recordsDir(root, profile))) return [];
  return fs
    .readdirSync(recordsDir(root, profile))
    .filter((name) => name.endsWith(".json"))
    .map((name) => read<ErrandRecord>(path.join(recordsDir(root, profile), name)));
}

const recordFor = (root: string, id: string): ErrandRecord | null =>
  records(root).find((record) => record.id === id) ?? null;

/** Which queue directory each item of one piece of work is in. */
function queuedFor(root: string, workId: string): { ready: number; running: number; done: number } {
  const count = (directory: string): number => {
    const dir = path.join(queueDir(root, "errand"), directory);
    if (!fs.existsSync(dir)) return 0;
    return fs
      .readdirSync(dir)
      .filter((name) => name.endsWith(".json"))
      .filter((name) => {
        const item = read<{ workId?: string }>(path.join(dir, name));
        return item.workId === workId;
      }).length;
  };

  return { ready: count("ready"), running: count("running"), done: count("done") };
}
function readyNames(root: string): string[] {
  const dir = path.join(queueDir(root, "errand"), "ready");
  return fs.existsSync(dir) ? fs.readdirSync(dir).filter((name) => name.endsWith(".json")) : [];
}

const mountedNames = (out: string): string =>
  out
    .split("\n")
    .filter((line) => /^ {2}(ok|FAIL)/.test(line))
    .join(" ");

/** Drives until nothing is due, or until it is clear nothing will settle. */
function run(root: string): Look[] {
  const trail: Look[] = [];

  for (let look = 0; look < MAX_TICKS; look += 1) {
    const result = errand(root, ["tick"]);
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
  const file = path.join(amyHome(root), "plugins", "node_modules", "@amykit", "workflow-errand", "workflow.mmd");
  if (!fs.existsSync(file)) return [];
  const name = /^[A-Za-z_]\w*$/;
  return fs.readFileSync(file, "utf-8").split("\n").flatMap((line) => {
    const [from = "", rest = ""] = line.split("-->");
    const to = rest.split(":")[0]!.trim();
    return name.test(from.trim()) && name.test(to) ? [`${from.trim()}>${to}`] : [];
  });
}

const transitionsOf = (record: ErrandRecord | null): string[] =>
  (record?.history ?? []).map((move) => `${move.from}>${move.to}`);

/**
 * A second profile's state, written before the run.
 *
 * It is a real queue item and a real record in the shape the store writes,
 * because the claim is that a run leaves *another* profile exactly as it
 * found it, and a directory that was empty before proves only that the run
 * did not fill it.
 */
function seedLedger(root: string): void {
  const at = "2026-09-05T08:00:00.000Z";
  const id = "task-19700101T000000000";

  fs.mkdirSync(recordsDir(root, "ledger"), { recursive: true });
  fs.mkdirSync(path.join(queueDir(root, "ledger"), "ready"), { recursive: true });

  fs.writeFileSync(
    path.join(recordsDir(root, "ledger"), `${id}.json`),
    `${JSON.stringify(
      {
        id,
        state: "QUEUED",
        attempts: {},
        looks: { QUEUED: 1 },
        history: [],
        updatedAt: at,
      },
      null,
      2,
    )}\n`,
    "utf-8",
  );
  fs.writeFileSync(
    path.join(queueDir(root, "ledger"), "ready", `19700101T000000000-0001-${id}.json`),
    `${JSON.stringify(
      {
        id: `19700101T000000000-0001-${id}`,
        workId: id,
        enqueuedAt: at,
        notBefore: at,
        attempt: 0,
        reason: "seeded before the run",
      },
      null,
      2,
    )}\n`,
    "utf-8",
  );
}

/** Where a task file is dropped, in the shape an editor or a hook would leave. */
function taskFile(repo: string, source: string, text: string): string {
  return [`---`, `repo: ${repo}`, `source: ${source}`, `added: ${BY_HAND_ADDED_AT}`, `---`, ``, text, ``].join("\n");
}

/** The scratch world, deleted once the assertions have read what they need. */
let world = "";

/**
 * One whole run, from an empty directory to five finished errands.
 *
 * The five are the whole lifecycle: one that changed something, one whose
 * agent committed the change itself, one that was a question, one the agent
 * refused, and one about a repository this install does not work in. The
 * first two reach a pull request; the question and the refusal are delivered
 * as answers.
 */
function walkthrough(): State {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "amy-errand-"));
  world = root;
  {
    build(root, { source });

    const init = amy(root, ["init"]);
    configure(root);
    installPlugins(root);
    // Made by hand here, because `amy init` has no reason to create a second
    // profile's directories and the run must find them already holding state.
    fs.mkdirSync(path.join(queueDir(root, "ledger"), "ready"), { recursive: true });
    seedLedger(root);
    const ledgerBefore = tree(path.join(amyHome(root), "ledger"));

    const version = amy(root, ["--version"]);

    // One: the command. The remark is written down and queued in one step,
    // and nothing is resolved against anything.
    // Two profiles mount the errand, so the command names the one it means —
    // the ledger profile exists only to hold state this run must not touch.
    const btw = errand(root, ["btw", CHANGE_TASK, "--repo", REPO, "--source", "ada"]);
    const taskId = fs
      .readdirSync(tasksDir(root))
      .filter((name) => name.endsWith(".md"))
      .map((name) => name.slice(0, -3))[0] ?? "";
    const taskFileText = taskId ? fs.readFileSync(path.join(tasksDir(root), `${taskId}.md`), "utf-8") : "";
    const queuedAfterBtw = readyNames(root);

    // Two: a file, dropped in by hand, the way an editor or a hook leaves
    // one. It has to be discovered rather than queued by the command.
    fs.writeFileSync(
      path.join(tasksDir(root), `${BY_HAND_ID}.md`),
      taskFile(REPO, BY_HAND_SOURCE, QUESTION_TASK),
      "utf-8",
    );

    // Three: an errand the agent will refuse. The refusal is the agent's own
    // answer, not a decision the workflow makes for it.
    fs.writeFileSync(
      path.join(tasksDir(root), "refusal-task.md"),
      taskFile(REPO, "ada, mid-conversation", REFUSE_TASK),
      "utf-8",
    );

    // Four: an errand whose agent commits its own work, so the tree the
    // workflow reaches for is clean and the work is a commit only.
    fs.writeFileSync(
      path.join(tasksDir(root), "committed-task.md"),
      taskFile(REPO, "ada, mid-conversation", COMMITTED_TASK),
      "utf-8",
    );

    // Five: a repository this install does not work in. Nothing about
    // waiting would make it workable, so it is handed back rather than tried.
    fs.writeFileSync(
      path.join(tasksDir(root), "foreign-task.md"),
      taskFile(FOREIGN_REPO, "a hook", FOREIGN_TASK),
      "utf-8",
    );

    // Six: a change whose pull request the code host answers it will not
    // open. The call returns REFUSED, and the errand is handed back.
    fs.writeFileSync(
      path.join(tasksDir(root), "closed-task.md"),
      taskFile(REPO, "ada, mid-conversation", CLOSED_TASK),
      "utf-8",
    );

    // The first tick looks before it moves: the hand-written files have never
    // been on the queue, and a command that only moved what was already there
    // would leave them for the daemon.
    const discovered = errand(root, ["tick"]);
    const rediscovered = errand(root, ["tick"]);
    const trail = run(root);

    const status = errand(root, ["status", "--json"]);
    const workflowList = amy(root, ["workflow", "list"]);
    const mounted = errand(root, ["plugin", "list"]);
    const help = amy(root, ["--help"]);
    const roster = amy(root, ["roster"]);
    const doctor = amy(root, ["doctor"]);

    const state: State = {
      root,
      init,
      version,
      btw,
      taskId,
      taskFile: taskFileText,
      queuedAfterBtw,
      discovered,
      rediscovered,
      trail,
      status,
      workflowList,
      mounted,
      help,
      roster,
      doctor,
      diagram: installedDiagram(root),
      records: records(root),
      change: recordFor(root, taskId),
      question: recordFor(root, BY_HAND_ID),
      committed: recordFor(root, "committed-task"),
      refusal: recordFor(root, "refusal-task"),
      closed: recordFor(root, "closed-task"),
      foreign: recordFor(root, "foreign-task"),
      host: read<CodeHost>(path.join(root, "world", "code-host.json")),
      agentCalls: lines<AgentCall>(path.join(root, "world", "claude.log")),
      ghCalls: lines<GhCall>(path.join(root, "world", "gh.log")),
      log: lines<LogLine>(path.join(amyHome(root), "log", logFile(root))),
      inbox: inboxNotes(root),
      originBranches: branches(root, REPO),
      ledgerBefore,
      ledgerAfter: tree(path.join(amyHome(root), "ledger")),
      changeManifest: fileOnBranch(root, REPO, CHANGE_BRANCH, "api/package.json"),
      committedChangelog: fileOnBranch(root, REPO, COMMITTED_BRANCH, "api/CHANGELOG.md"),
      leftBehind: fs.existsSync(path.join(process.cwd(), ".amy")),
    };

    if (keep) process.stdout.write(`kept ${root}\n`);

    return state;
  }
}

function logFile(root: string): string {
  const dir = path.join(amyHome(root), "log");
  return fs.existsSync(dir) ? (fs.readdirSync(dir)[0] ?? "") : "";
}

function inboxNotes(root: string): string[] {
  const dir = inboxDir(root);
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .filter((name) => name.endsWith(".md"))
    .map((name) => fs.readFileSync(path.join(dir, name), "utf-8"));
}

/** The pull request one errand ended up on, as the code host holds it. */
const pullFor = (state: State, branch: string): Pull | undefined =>
  (state.host.repos[REPO]?.pulls ?? []).find((pull) => pull.head === branch);

/** Where the agent actually ran, read from the checkout itself. */
function remoteOf(cwd: string): string {
  try {
    return execFileSync("git", ["remote", "get-url", "origin"], {
      cwd,
      encoding: "utf-8",
      stdio: ["ignore", "pipe", "pipe"],
    }).trim();
  } catch {
    return "";
  }
}

/** One assertion, before it is reported: its name, and whether it held. */
type Check = [type: string, ok: boolean | undefined];

function assertionsFor(state: State): { type: string; status: "passed" | "failed" }[] {
  return [
    ...intakeChecks(state),
    ...commandLineChecks(state),
    ...workplaceChecks(state),
    ...deliveryChecks(state),
    ...refusalChecks(state),
    ...lifecycleChecks(state),
    ...profileChecks(state),
    ...rosterChecks(state),
  ].map(([type, ok]) => ({ type, status: ok ? "passed" : "failed" }));
}

/**
 * The machine that reviews nobody: init and the doctor carry no roster.
 *
 * The roster is a ticket machine's file, so a machine that mounted nothing
 * that reviews has no such file anywhere in its state, and the doctor's own
 * checks come out green on it without the mounted check that would ask.
 * Whatever day this run happens on is proven: there is no roster check to fail
 * on the morning after, because nothing mounted any.
 */
function rosterChecks(state: State): Check[] {
  // What the install itself wrote, not what the packages it installed vend:
  // every tarball on this PATH carries the workflow's own file, and the
  // machine's claim is that its state — config, profiles, the queue — wrote
  // and reads none of it.
  const home = Object.keys(tree(amyHome(state.root))).filter((name) => !name.includes("node_modules"));
  return [
    [
      "errand.doctor_is_green_without_a_roster",
      state.doctor.code === 0 &&
        !/roster/i.test(state.doctor.out) &&
        !/roster/i.test(state.init.out) &&
        home.every((name) => !name.includes("roster")),
    ],
  ];
}

function intakeChecks(state: State): Check[] {
  return [
    // Work that is not a ticket, captured in one sentence.
    [
      "errand.a_passing_remark_reaches_the_queue",
      state.btw.code === 0 &&
        state.taskId.length > 0 &&
        state.taskFile.includes(`repo: ${REPO}`) &&
        state.taskFile.includes("source: ada") &&
        state.taskFile.includes(CHANGE_TASK) &&
        state.queuedAfterBtw.length === 1 &&
        queuedFor(state.root, state.taskId).done > 0 &&
        queuedFor(state.root, state.taskId).ready === 0 &&
        state.change?.state === "DONE",
    ],
    [
      // The other way in: a file a person or a hook wrote, found rather than
      // queued by the command.
      "errand.a_task_in_the_directory_is_discovered",
      state.discovered.out.includes(BY_HAND_ID) &&
        state.question?.state === "DONE" &&
        // A second look finds nothing new: discovery is idempotent, so the
        // files it already queued are not queued again.
        !state.rediscovered.out.includes("queued"),
    ],
  ];
}

/**
 * The command line this machine mounted, and nothing else.
 */
function commandLineChecks(state: State): Check[] {
  return [
    [
      // One command, two acts: nothing had queued the hand-written files, and
      // the tick that found them is the tick that moved one.
      "errand.a_tick_discovers_before_it_moves",
      state.discovered.out.includes(BY_HAND_ID) &&
        !state.queuedAfterBtw.some((name) => name.includes(BY_HAND_ID)) &&
        state.question !== null,
    ],
    [
      // The host brings what the machine mounted, and nothing else: a command
      // another workflow would have brought does not exist here.
      "errand.a_command_nothing_mounts_does_not_exist",
      state.roster.code !== 0 && /unknown command/i.test(state.roster.out),
    ],
    [
      "errand.help_lists_only_the_machines_commands",
      helpSpeaksForThisMachine(state.help.out),
    ],
  ];
}

/**
 * The command line as this machine's, and not as the host's.
 *
 * The names below are the ones the host used to carry for every install or
 * that another workflow brings. `btw` is the errand's own and has to be
 * there; `daemon` and `after-daemon` are hidden from the list and still run.
 */
function helpSpeaksForThisMachine(help: string): boolean {
  // Gone, hidden, or another workflow's: none of these belongs on a machine
  // that mounted the errand and nothing else's workflow.
  const absent = ["pause", "resume", "discover", "daemon", "after-daemon", "poke", "note", "roster"];
  const listed = (name: string): boolean => help.split("\n").some((line) => line.startsWith(`  ${name} `) || line.startsWith(`  ${name}[`));
  // And what this machine did mount is listed with the package that brought
  // it: the errand's own verb, and the two adapters every profile mounts.
  const here = ["btw", "worktrees", "models", "tick", "init", "doctor"];
  return absent.every((name) => !listed(name)) && here.every(listed);
}

function workplaceChecks(state: State): Check[] {
  // macOS resolves `/var` to `/private/var`, so both sides are compared by
  // their real path: an assertion about where a checkout is must not depend
  // on which spelling of the same directory the platform hands back.
  const real = (value: string): string => {
    try {
      return fs.realpathSync(value);
    } catch {
      return value;
    }
  };
  const origin = real(path.join(originsDir(state.root), `${REPO.slice(REPO.indexOf("/") + 1)}.git`));
  const trees = `${real(treesDir(state.root))}${path.sep}`;
  const home = `${real(amyHome(state.root))}${path.sep}`;

  return [
    // Every agent call happened in a checkout of the repository the errand
    // named — not in the state directory, and not in the standing tree.
    [
      "errand.the_agent_runs_where_the_work_is",
      state.agentCalls.length === 5 &&
        state.agentCalls.every(
          (call) =>
            `${real(call.cwd)}${path.sep}`.startsWith(trees) &&
            !`${real(call.cwd)}${path.sep}`.startsWith(home) &&
            fs.existsSync(path.join(call.cwd, ".git")) &&
            real(remoteOf(call.cwd)) === origin,
        ) &&
        !state.agentCalls.some((call) => real(call.cwd) === real(path.join(state.root, "checkouts", "amy"))),
    ],
    [
      // The agent was given the sentence somebody said, and nothing had to
      // ask it twice: the retry is the failure path, not the ordinary one.
      "errand.the_agent_is_asked_once_per_errand",
      (
        [
          ["change", CHANGE_TASK],
          ["question", QUESTION_TASK],
          ["committed", COMMITTED_TASK],
          ["refusal", REFUSE_TASK],
          ["closed", CLOSED_TASK],
        ] as const
      ).every(([task, text]) => {
        const forTask = state.agentCalls.filter((call) => call.task === task);
        return forTask.length === 1 && Boolean(forTask[0]?.prompt.includes(text));
      }),
    ],
  ];
}

function deliveryChecks(state: State): Check[] {
  return [
    ...changeDelivery(state),
    ...committedDelivery(state),
    ...unchangedDelivery(state),
    ...boundaryDelivery(state),
  ];
}

/** Whether an errand the agent had already committed was still delivered. */
function committedWorkIsDelivered(state: State): boolean {
  return (
    state.committed?.state === "DONE" &&
    state.committed?.changed === true &&
    state.originBranches.includes(COMMITTED_BRANCH) &&
    state.committedChangelog.includes("Raised left-pad to 1.3.0") &&
    pullFor(state, COMMITTED_BRANCH)?.head === COMMITTED_BRANCH
  );
}

function committedDelivery(state: State): Check[] {
  return [
    // A clean tree is not "nothing to deliver": the agent may have committed
    // the work itself, and a delivery decided from the working tree alone
    // would finish with the commit stranded on a local branch.
    ["errand.already_committed_work_is_delivered", committedWorkIsDelivered(state)],
  ];
}

/** Whether the pull request is the one the change asked for. */
function pullDeliversChange(pull: Pull | undefined): boolean {
  return (
    pull !== undefined &&
    pull.head === CHANGE_BRANCH &&
    pull.base === "main" &&
    pull.draft === true
  );
}

/** Whether the pull request carries what a reviewer would have to ask for. */
function pullNamesTheTask(state: State, pull: Pull | undefined): boolean {
  return (
    pull?.title === CHANGE_TASK &&
    Boolean(pull.body?.includes(CHANGE_TASK)) &&
    Boolean(pull.body?.includes("ada")) &&
    state.changeManifest.includes("1.3.0")
  );
}

function changeDelivery(state: State): Check[] {
  const pull = pullFor(state, CHANGE_BRANCH);

  return [
    // A change is a pull request; an answer is not.
    [
      "errand.a_change_opens_a_pull_request",
      pullDeliversChange(pull) &&
        pullNamesTheTask(state, pull) &&
        state.question?.state === "DONE" &&
        pullFor(state, QUESTION_BRANCH) === undefined,
    ],
  ];
}

/** Whether the code host was ever asked for a pull request on the answer. */
function askedForNoPullRequest(state: State): boolean {
  return state.ghCalls.filter((call) => call.argv.includes(`head=${QUESTION_BRANCH}`)).length === 0;
}

function unchangedDelivery(state: State): Check[] {
  return [
    // A branch with no commit on it is not something to review: the push
    // appearing is not the same fact as the work existing.
    [
      "errand.an_unchanged_branch_is_not_delivered",
      state.originBranches.includes(CHANGE_BRANCH) &&
        state.change?.changed === true &&
        state.question?.changed === false &&
        state.question?.pullRequestNumber === undefined &&
        // The branch must not exist at all: a published branch with no
        // pull request is still a publication nobody asked for, and the
        // code host's silence alone would not notice it.
        !state.originBranches.includes(QUESTION_BRANCH) &&
        askedForNoPullRequest(state),
    ],
  ];
}

/** Whether an errand about another repository was handed back untouched. */
function foreignIsHandedBack(state: State): boolean {
  return (
    state.foreign?.state === "DECLINED" &&
    transitionsOf(state.foreign).join(",") === "QUEUED>DECLINED" &&
    !state.agentCalls.some((call) => call.prompt.includes(FOREIGN_TASK)) &&
    state.inbox.some((note) => note.includes(FOREIGN_REPO))
  );
}

function boundaryDelivery(state: State): Check[] {
  return [
    // What it will not do: an errand about a repository this install does
    // not work in is handed back without spending an agent on it.
    ["errand.a_task_nobody_works_in_is_handed_back", foreignIsHandedBack(state)],
  ];
}

/** Whether an errand's pull request was opened by its call, and the number came back through it. */
function openedByACall(state: State, record: ErrandRecord | null, branch: string): boolean {
  const call = record?.calls?.[`${record.id}/PR_OPEN#1`];
  const pull = pullFor(state, branch);
  return record?.state === "DONE" &&
    call?.state === "OPENED" &&
    call.input?.branch === branch &&
    record.calling === undefined &&
    pull !== undefined &&
    record.pullRequestNumber === pull.number &&
    transitionsOf(record).includes("PR_OPEN>DONE");
}

function refusalChecks(state: State): Check[] {
  return [
    [
      // Opened by the shipped pull-request workflow, called from PR_OPEN: the
      // installed executable made the call's record inside the errand's, and
      // the errand took the edge named OPENED holding the number the stand-in
      // gh gave, and said where it is on the way out.
      "errand.the_pull_request_is_opened_by_a_call",
      openedByACall(state, state.change, CHANGE_BRANCH) &&
        openedByACall(state, state.committed, COMMITTED_BRANCH) &&
        state.inbox.some((note) =>
          note.includes("Done, and it is a draft for you to look at") &&
          note.includes(CHANGE_TASK) &&
          note.includes(`https://github.example.test/${REPO}/pull/${pullFor(state, CHANGE_BRANCH)?.number}`)),
    ],
    [
      "errand.a_refused_pull_request_hands_the_errand_back",
      state.closed?.state === "DECLINED" &&
        transitionsOf(state.closed).join(",") === "QUEUED>WORKING,WORKING>PR_OPEN,PR_OPEN>DECLINED" &&
        state.closed.calls?.["closed-task/PR_OPEN#1"]?.state === "REFUSED" &&
        !(state.host.repos[REPO]?.pulls ?? []).some((pull) => pull.title === CLOSED_TASK) &&
        state.inbox.some((note) => note.includes(REFUSED_BY_HOST) && note.includes(CLOSED_TASK)),
    ],
    [
      "errand.a_refusal_is_terminal_and_says_why",
      state.refusal?.state === "DECLINED" &&
        state.refusal?.attempts?.WORKING === 1 &&
        transitionsOf(state.refusal).join(",") === "QUEUED>WORKING,WORKING>DECLINED" &&
        state.inbox.some((note) => note.includes(REFUSAL) && note.includes(REFUSE_TASK)) &&
        pullFor(state, "amy/errand-rewrite-the-billing-ledger-from-scratch") === undefined,
    ],
  ];
}

function lifecycleChecks(state: State): Check[] {
  const walked = new Set(state.records.flatMap((record) => transitionsOf(record)));

  return [
    [
      "errand.the_lifecycle_walks_in_order",
      transitionsOf(state.change).join(",") === EXPECTED.join(",") &&
        state.trail.every((look) => look.said.split("->").length <= 2) &&
        state.trail.at(-1)?.said.includes("nothing due") === true,
    ],
    [
      // Every arrow the installed diagram draws is one some errand in this
      // run took: nothing is drawn and never walked.
      "errand.every_drawn_edge_is_walked",
      state.diagram.length === 7 && state.diagram.every((edge) => walked.has(edge)),
    ],
    [
      // One terminal state is not a crash and not a fall: the engine said so
      // in its own log, and no look reported a failure.
      "errand.the_run_leaves_nothing_behind",
      !state.leftBehind && state.trail.every((look) => look.code === 0 || look.said.includes("nothing due")),
    ],
  ];
}

function profileChecks(state: State): Check[] {
  const own = path.join(amyHome(state.root), "errand");
  const before = JSON.stringify(state.ledgerBefore);
  const after = JSON.stringify(state.ledgerAfter);
  const ledgerNames = Object.keys(state.ledgerAfter).join(" ");

  return [
    // Its records and queue belong to the profile that drove, and a second
    // profile under the same home is left exactly as it was found.
    [
      "errand.the_profile_keeps_its_own_state",
      fs.existsSync(path.join(own, "records")) &&
        fs.existsSync(path.join(own, "queue")) &&
        state.records.length === 6 &&
        before === after &&
        ![state.taskId, BY_HAND_ID, "refusal-task", "committed-task", "foreign-task", "closed-task"].some(
          (id) => id && ledgerNames.includes(id),
        ),
    ],
    [
      // The same installed binary, and it names the workflow that drove and
      // the plugin that stored the tasks.
      "errand.the_installed_machine_mounts_the_workflow",
      state.version.code === 0 &&
        state.status.code === 0 &&
        state.status.out.includes('"profile": "errand"') &&
        state.workflowList.out.includes("@amykit/workflow-errand") &&
        mountedNames(state.mounted.out).includes("@amykit/plugin-file-tasks") &&
        state.log.some((line) => line.kind === "agent.run"),
    ],
  ];
}

/** Runs the walkthrough, judges it, and writes the report. */
function report(): number {
const state = walkthrough();
const assertions = assertionsFor(state);
const failed = assertions.filter((assertion) => assertion.status === "failed");

for (const assertion of failed) process.stderr.write(`FAILED ${assertion.type}\n`);

fs.writeFileSync(
  reportPath,
  `${JSON.stringify(
    {
      scenario: "errand",
      status: failed.length === 0 ? "passed" : "failed",
      goal:
        "I say a thing in passing and it happens: an errand gets done in the repository it is about, " +
        "a question gets answered, and something the agent will not do comes back to me with the reason " +
        "rather than being retried until it gives up. I want a pull request when something changed, and " +
        "nothing to review when nothing did.",
      artifact: {
        package: "@amykit/cli",
        entry: "the installed executable, driven by `amy btw`, `amy discover` and `amy tick`",
        built_by: "scripts/install.sh",
      },
      observed: {
        assertions_run: assertions.length,
        assertions_failed: failed.length,
        version: state.version.out,
        looks: state.trail.length,
        transitions: transitionsOf(state.change),
        question: transitionsOf(state.question),
        committed: transitionsOf(state.committed),
        refused: transitionsOf(state.refusal),
        declined: transitionsOf(state.foreign),
        agent_calls: state.agentCalls.length,
        gh_calls: state.ghCalls.length,
        pull_requests: Object.fromEntries(
          Object.entries(state.host.repos).map(([repo, entry]) => [repo, entry.pulls.length]),
        ),
        branches: state.originBranches,
        records: state.records.map((record) => `${record.id}:${record.state}`),
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

return failed.length === 0 ? 0 : 1;
}

try {
  process.exitCode = report();
} finally {
  // The whole world is a disposable fixture, and a failed assertion must
  // leave exactly as little behind as a passing one — but only once the
  // assertions have read the queue, the checkouts and the tree it wrote.
  if (!keep && world) fs.rmSync(world, { recursive: true, force: true });
}
