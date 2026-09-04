// Drives the installed `amy` through one ticket, from the working status to
// QA, and writes down what the world looked like afterwards.
//
// Usage: node drive.mjs <source-dir> <amy-binary> <report-path> [--keep]
//
// Every command here is one an operator types. Nothing reaches inside amy:
// the only things read back are the tracker, the code host, the repository,
// the files amy left on disk and what it printed. That is the difference
// between proving the lifecycle and proving a mock.
//
// The world only ever moves *after* a look that made no move, which is what
// puts a genuine wait in front of every waiting state instead of letting the
// answer be there before the question was asked.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync, spawn, spawnSync } from "node:child_process";
import {
  BOT,
  BRANCH,
  OTHER_REPO,
  PAST_IMPLEMENTATION,
  REPO,
  SOMEBODY_ELSES,
  TICKET,
  build,
  configure,
  headOf,
  lines,
  read,
  write,
} from "./world.mjs";

const [source, binary, reportPath] = process.argv.slice(2);
const keep = process.argv.includes("--keep");

const MAX_TICKS = 60;
const WAITING = ["CLARIFYING", "COPILOT_WAIT", "HUMAN_REVIEW", "ESCALATED"];

/** Every move the ticket makes, in the order it has to make them. */
const EXPECTED = [
  "DISCOVERED>CLARIFYING",
  "CLARIFYING>READY",
  "READY>IMPLEMENTING",
  "IMPLEMENTING>CHECKED",
  "CHECKED>IMPLEMENTING",
  "IMPLEMENTING>CHECKED",
  "CHECKED>PR_OPEN",
  "PR_OPEN>COPILOT_WAIT",
  "COPILOT_WAIT>COPILOT_FIX",
  "COPILOT_FIX>COPILOT_WAIT",
  "COPILOT_WAIT>REVIEWER_ASSIGNED",
  "REVIEWER_ASSIGNED>HUMAN_REVIEW",
  "HUMAN_REVIEW>HUMAN_FIX",
  "HUMAN_FIX>ESCALATED",
  "ESCALATED>HUMAN_FIX",
  "HUMAN_FIX>RE_REVIEW",
  "RE_REVIEW>HUMAN_REVIEW",
  "HUMAN_REVIEW>APPROVED",
  "APPROVED>QA_HANDOFF",
  "QA_HANDOFF>DONE",
];

/** Blocks the thread. There is nothing to do until the port file appears. */
function pause(ms) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

function waitFor(condition, what, timeoutMs = 10_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (condition()) return;
    pause(50);
  }
  throw new Error(`timed out waiting for ${what}`);
}

/** The stand-in tracker, listening on a port it picks and writes down. */
function startTracker(root) {
  const stateFile = path.join(root, "world", "tracker.json");
  const portFile = path.join(root, "world", "tracker.port");

  fs.mkdirSync(path.join(root, "world"), { recursive: true });
  const child = spawn(process.execPath, [path.join(source, "tracker.mjs"), stateFile, portFile], {
    stdio: "ignore",
  });

  waitFor(() => fs.existsSync(portFile), "the stand-in tracker to listen");
  return { child, endpoint: `http://127.0.0.1:${fs.readFileSync(portFile, "utf-8").trim()}/graphql` };
}

function amy(root, args) {
  const result = spawnSync(binary, args, {
    cwd: path.join(root, "home"),
    encoding: "utf-8",
    env: {
      ...process.env,
      PATH: `${path.join(root, "bin")}:${process.env.PATH}`,
      HOME: path.join(root, "home"),
      AMY_E2E_WORLD: path.join(root, "world"),
      AMY_E2E_ORIGINS: path.join(root, "origins"),
    },
  });

  return {
    code: result.status,
    out: `${result.stdout ?? ""}${result.stderr ?? ""}`.trim(),
  };
}

const recordFile = (root) => path.join(root, "home", ".amy", "tickets", `${TICKET}.json`);

function recordOf(root) {
  const file = recordFile(root);
  return fs.existsSync(file) ? read(file) : null;
}

const stateOf = (root) => recordOf(root)?.state ?? "DISCOVERED";

const hostFile = (root) => path.join(root, "world", "code-host.json");
const trackerFile = (root) => path.join(root, "world", "tracker.json");

/** The ticket's own pull request, as the code host holds it. */
function ticketPull(root) {
  return read(hostFile(root)).repos[REPO].pulls.find(
    (pull) => pull.head === BRANCH && pull.state === "open",
  );
}

function comment(root, userId, body) {
  const state = read(trackerFile(root));
  const issue = state.issues.find((candidate) => candidate.identifier === TICKET);
  issue.comments.push({ body, createdAt: new Date().toISOString(), userId });
  write(trackerFile(root), state);
}

function repliedAfter(root, userId, since) {
  const state = read(trackerFile(root));
  const issue = state.issues.find((candidate) => candidate.identifier === TICKET);
  return issue.comments.some(
    (entry) => entry.userId === userId && new Date(entry.createdAt) > new Date(since),
  );
}

const HUMAN_THREADS = [
  {
    id: "HUM-1",
    author: "ada",
    body: "Read the currency off the invoice rather than hard-coding it.",
    isResolved: false,
    isOutdated: false,
  },
  {
    id: "HUM-2",
    author: "ada",
    body: "While you are here, rename the whole module to `billing-total`.",
    isResolved: false,
    isOutdated: false,
  },
];

const BOT_THREAD = {
  id: "BOT-1",
  author: BOT,
  body: "This file has no trailing newline.",
  isResolved: false,
  isOutdated: false,
};

/**
 * What the outside world does between two looks, keyed by the state amy is
 * waiting in.
 *
 * Each one is asked only after a look that changed nothing, so it answers a
 * question that was actually asked.
 */
function reactions() {
  let ceilingRelieved = false;
  let humanReviews = 0;

  const sawHead = (pull, author, head) =>
    pull.reviews.some(
      (review) => review.author.toLowerCase() === author.toLowerCase() && review.commitSha === head,
    );

  return {
    CLARIFYING(root, record) {
      if (repliedAfter(root, "u-owner", record.triage.at)) return null;
      comment(root, "u-owner", "In BRL, the same as the rest of the invoice.");
      return "a colleague answered the question on the ticket";
    },

    // The bot posts a review even when it found nothing, so it is asked per
    // head rather than once. Only the first one leaves a comment behind.
    COPILOT_WAIT(root) {
      const state = read(hostFile(root));
      const pull = state.repos[REPO].pulls.find((p) => p.head === BRANCH && p.state === "open");
      const head = headOf(root, "widgets", BRANCH);
      if (!pull || sawHead(pull, BOT, head)) return null;

      const first = pull.reviews.every((review) => review.author !== BOT);
      pull.reviews.push({
        author: BOT,
        state: "COMMENTED",
        commitSha: head,
        submittedAt: new Date().toISOString(),
      });
      if (first) pull.threads.push({ ...BOT_THREAD });
      write(hostFile(root), state);

      return first
        ? `the automated reviewer looked at ${head.slice(0, 7)} and left one comment`
        : `the automated reviewer looked at ${head.slice(0, 7)} and had nothing to say`;
    },

    // Somebody else's review lands, which is the only thing that can make
    // room on a reviewer's pile.
    REVIEWER_ASSIGNED(root) {
      if (ceilingRelieved) return null;
      ceilingRelieved = true;

      const state = read(hostFile(root));
      const done = state.repos[REPO].pulls.find((pull) => pull.number === 12);
      done.state = "closed";
      write(hostFile(root), state);

      return "one of ada's other reviews was merged, so she is carrying one";
    },

    HUMAN_REVIEW(root, record) {
      const state = read(hostFile(root));
      const pull = state.repos[REPO].pulls.find((p) => p.head === BRANCH && p.state === "open");
      const head = headOf(root, "widgets", BRANCH);
      if (!pull || !record.reviewer || sawHead(pull, record.reviewer, head)) return null;

      const approving = humanReviews > 0;
      humanReviews += 1;

      pull.reviewDecision = approving ? "APPROVED" : "CHANGES_REQUESTED";
      pull.requestedReviewers = pull.requestedReviewers.filter((who) => who !== record.reviewer);
      pull.reviews.push({
        author: record.reviewer,
        state: approving ? "APPROVED" : "CHANGES_REQUESTED",
        commitSha: head,
        submittedAt: new Date().toISOString(),
      });
      if (!approving) pull.threads.push(...HUMAN_THREADS.map((thread) => ({ ...thread })));
      write(hostFile(root), state);

      return approving
        ? `${record.reviewer} approved ${head.slice(0, 7)}`
        : `${record.reviewer} asked for changes on ${head.slice(0, 7)}`;
    },

    ESCALATED(root, record) {
      if (repliedAfter(root, "u-owner", record.escalation.askedAt)) return null;
      comment(root, "u-owner", "Agreed, leave the rename out of this one. Do the rest.");
      return "the owner settled the disagreement on the ticket";
    },
  };
}

/**
 * One whole run, in its own world.
 *
 * Returns what was observed rather than asserting anything, so two runs can
 * be compared against each other as well as against expectations.
 */
function lifecycle() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "amy-e2e-"));
  const tracker = startTracker(root);
  const world = { root, moves: [], trail: [] };

  try {
    build(root, { source });

    // The morning's commands, in the order the README gives them.
    world.version = amy(root, ["--version"]);
    world.init = amy(root, ["init"]);
    world.initWrote = ["config.yaml", "roster.yaml"].every((file) =>
      fs.existsSync(path.join(root, "home", ".amy", file)),
    );

    configure(root, tracker.endpoint);
    world.doctorStale = amy(root, ["doctor"]);
    world.confirm = amy(root, ["roster", "confirm"]);
    world.doctor = amy(root, ["doctor"]);
    world.discover = amy(root, ["discover"]);

    const react = reactions();
    let previous = null;

    for (let tick = 1; tick <= MAX_TICKS; tick += 1) {
      const before = stateOf(root);
      const result = amy(root, ["tick"]);
      const after = stateOf(root);

      world.trail.push({ before, after, said: result.out, code: result.code });
      if (result.code !== 0) throw new Error(`amy tick exited ${result.code}: ${result.out}`);
      if (after === "DONE" && result.out.includes("nothing due")) break;

      // A look that changed nothing is the machine saying it is somebody
      // else's move. That is when somebody else gets one.
      const stayed = before === after && previous === after;
      previous = after;
      if (!stayed) continue;

      const move = react[after]?.(root, recordOf(root));
      if (move) world.moves.push({ at: new Date().toISOString(), state: after, move });
    }

    world.status = amy(root, ["status"]);
    world.budget = amy(root, ["budget"]);
    world.record = recordOf(root);
    world.tracker = read(trackerFile(root));
    world.pull = ticketPull(root);
    world.ghCalls = lines(path.join(root, "world", "gh.log"));
    world.agentCalls = lines(path.join(root, "world", "claude.log"));
    world.trackerCalls = lines(path.join(root, "world", "tracker.log"));
    world.inbox = fs.existsSync(path.join(root, "home", ".amy", "needs-input"))
      ? fs.readdirSync(path.join(root, "home", ".amy", "needs-input"))
      : [];
    world.branches = execFileSync(
      "git",
      ["--git-dir", path.join(root, "origins", "widgets.git"), "branch", "--format=%(refname:short)"],
      { encoding: "utf-8" },
    )
      .split("\n")
      .filter(Boolean);
    world.commits = execFileSync(
      "git",
      ["--git-dir", path.join(root, "origins", "widgets.git"), "log", "--format=%s", BRANCH],
      { encoding: "utf-8" },
    )
      .split("\n")
      .filter(Boolean);
    world.queueReady = fs.readdirSync(path.join(root, "home", ".amy", "queue", "ready"));

    return world;
  } finally {
    tracker.child.kill();
    if (keep) {
      process.stdout.write(`kept the world in ${root}\n`);
    } else {
      fs.rmSync(root, { recursive: true, force: true });
    }
  }
}

const transitions = (world) =>
  world.trail.filter((look) => look.before !== look.after).map((look) => `${look.before}>${look.after}`);

/** Which states amy looked at without moving, which is what waiting looks like. */
const heldIn = (world) =>
  world.trail.filter((look) => look.before === look.after).map((look) => look.after);

const ghCallsMatching = (world, ...needles) =>
  world.ghCalls.filter((call) => needles.every((needle) => call.argv.join(" ").includes(needle)));

/**
 * The `gh api` calls that hit one endpoint with one method.
 *
 * Matched on the endpoint argument rather than on the whole command line,
 * because `/pulls` is also a prefix of `/pulls/41/requested_reviewers` and a
 * substring match counts a review request as a pull request being opened.
 */
const ghApiCalls = (world, method, endpoint) =>
  world.ghCalls.filter(
    (call) =>
      call.argv[0] === "api" &&
      (call.argv.includes("--method") ? call.argv.includes(method) : method === "GET") &&
      call.argv.some((argument) => endpoint.test(argument)),
  );

const issueIn = (world, identifier) =>
  world.tracker.issues.find((issue) => issue.identifier === identifier);

const statusOf = (world, identifier) => {
  const issue = issueIn(world, identifier);
  const team = world.tracker.teams.find((candidate) => candidate.id === issue.teamId);
  return team.states.find((state) => state.id === issue.stateId).name;
};

const agentCallsFor = (world, step) => world.agentCalls.filter((call) => call.step === step);

/** Monday to Friday, which is the only time the roster is questioned. */
const isWorkday = () => {
  const day = new Date().getUTCDay();
  return day >= 1 && day <= 5;
};

function assertionsFor(first, second) {
  const gateRuns = first.record.lastGate;
  const implementCalls = agentCallsFor(first, "implement");
  const threadCalls = agentCallsFor(first, "address-threads");
  const reviewRequests = ghApiCalls(first, "POST", /\/requested_reviewers$/);
  const pullsOpened = ghApiCalls(first, "POST", /^\/repos\/[^/]+\/[^/]+\/pulls$/);
  const followUp = first.tracker.issues.find((issue) => issue.parentId === "uuid-BILL-4021");
  const questionAsked = issueIn(first, TICKET).comments.find(
    (entry) => entry.userId === "u-amy" && entry.body.includes("currency"),
  );
  const ceilingHold = first.trail.find(
    (look) => look.after === "REVIEWER_ASSIGNED" && look.before === "REVIEWER_ASSIGNED",
  );
  const budgetRuns = /(\d+) run\(s\)/.exec(first.budget.out)?.[1];

  return [
    // Discovery, and the two tickets that look like work and are not.
    [
      "lifecycle.only_the_working_status_is_picked_up",
      first.discover.out.includes(TICKET) &&
        !first.discover.out.includes(PAST_IMPLEMENTATION) &&
        !first.discover.out.includes(SOMEBODY_ELSES),
    ],

    // The question, and that it reached both the ticket and the operator.
    ["lifecycle.a_blocking_question_is_asked_on_the_ticket", Boolean(questionAsked)],
    [
      "lifecycle.the_operator_is_told_where_to_answer",
      first.inbox.some((file) => file.includes(TICKET)),
    ],
    [
      "lifecycle.a_waiting_state_makes_no_move_until_the_world_does",
      WAITING.every((state) => heldIn(first).includes(state)),
    ],
    [
      "lifecycle.the_answer_on_the_ticket_releases_the_work",
      transitions(first).includes("CLARIFYING>READY"),
    ],

    // The gate, which is the only thing that lets work out of the door.
    [
      "lifecycle.a_red_gate_sends_the_work_back_to_the_agent",
      transitions(first).includes("CHECKED>IMPLEMENTING") && implementCalls.length === 2,
    ],
    [
      "lifecycle.the_agent_is_told_what_the_gate_said",
      Boolean(
        implementCalls[1]?.retry &&
          implementCalls[1].prompt.includes('grep -q "currency:" invoice.md') &&
          implementCalls[1].prompt.includes("exited 1"),
      ),
    ],
    [
      "lifecycle.nothing_reaches_a_pull_request_until_the_gate_is_green",
      Boolean(
        gateRuns?.ok &&
          pullsOpened.length === 1 &&
          new Date(pullsOpened[0].at) > new Date(gateRuns.at),
      ),
    ],

    // The repository, which is where the claim "implemented" is settled.
    [
      "lifecycle.the_branch_the_tracker_named_is_what_gets_pushed",
      first.branches.includes(BRANCH) && first.commits.length >= 3,
    ],
    [
      "lifecycle.the_pull_request_is_opened_on_that_branch",
      first.pull?.head === BRANCH &&
        first.pull?.base === "main" &&
        first.pull?.title === `${TICKET}: Show the currency on the invoice total`,
    ],

    // Review, and the two currencies it spends.
    [
      "lifecycle.the_bot_is_answered_before_a_human_is_asked",
      Boolean(
        threadCalls[0]?.prompt.includes("BOT-1") &&
          reviewRequests[0] &&
          new Date(threadCalls[0].at) < new Date(reviewRequests[0].at),
      ),
    ],
    [
      "lifecycle.nobody_is_assigned_while_every_reviewer_is_at_the_ceiling",
      Boolean(ceilingHold?.said.includes("open review(s)")) &&
        first.inbox.length >= 2 &&
        first.moves.some((move) => move.state === "REVIEWER_ASSIGNED"),
    ],
    [
      "lifecycle.review_load_is_counted_across_every_repository",
      first.record.reviewer === "ada" &&
        ghCallsMatching(first, "pr", "list", REPO).length > 0 &&
        ghCallsMatching(first, "pr", "list", OTHER_REPO).length > 0,
    ],
    [
      "lifecycle.a_stale_review_does_not_count",
      // Both looks happened with a review by ada already on the pull request,
      // and both waited, because it was against the head before the fix.
      heldIn(first).filter((state) => state === "HUMAN_REVIEW").length === 2,
    ],
    [
      "lifecycle.a_second_review_is_requested_after_changes",
      reviewRequests.length === 2 && first.record.reviewer === "ada",
    ],

    // The disagreement, which is the one thing that must never be dropped.
    [
      "lifecycle.a_disagreement_goes_to_the_owner_as_a_follow_up",
      Boolean(followUp) && first.record.escalation?.followUpTicketId === followUp?.identifier,
    ],
    [
      "lifecycle.the_owners_answer_reopens_the_judgement",
      threadCalls.filter((call) => call.prompt.includes("HUM-2")).length === 2 &&
        first.record.judged.every((verdict) => verdict.verdict === "fixed"),
    ],

    // The handoff, which is the whole point of the machine.
    [
      "lifecycle.the_ticket_lands_in_qa_owned_by_qa",
      statusOf(first, TICKET) === "In QA" && issueIn(first, TICKET).assigneeId === "u-grace",
    ],
    [
      "lifecycle.the_ticket_walks_the_lifecycle_in_order",
      transitions(first).join(",") === EXPECTED.join(","),
    ],
    [
      "lifecycle.one_look_makes_at_most_one_move",
      first.trail.every((look) => look.said.split("->").length <= 2),
    ],
    [
      "lifecycle.the_machine_settles_instead_of_spinning",
      first.record.state === "DONE" &&
        first.trail.at(-1).said.includes("nothing due") &&
        first.queueReady.length === 0,
    ],
    [
      "lifecycle.what_the_agents_spent_is_read_off_the_log",
      budgetRuns === String(first.agentCalls.length) && first.budget.out.includes("allowed"),
    ],

    // Reproducible, which is the only way any of the above stays true.
    [
      "lifecycle.the_same_run_twice_leaves_the_same_trail",
      transitions(second).join(",") === transitions(first).join(","),
    ],

    // Extras: true every day, and reported rather than required.
    [
      "lifecycle.init_writes_the_config_and_the_roster",
      first.initWrote && first.init.out.includes("wrote"),
    ],
    [
      "lifecycle.confirming_the_roster_says_who_is_in",
      first.confirm.out.includes("ada") &&
        first.confirm.out.includes("alan") &&
        first.confirm.out.includes("grace"),
    ],
    [
      "lifecycle.doctor_passes_before_a_ticket_is_touched",
      first.doctor.code === 0 && first.doctor.out.includes("ready"),
    ],
    [
      "lifecycle.the_roster_is_only_questioned_on_a_workday",
      isWorkday()
        ? first.doctorStale.code !== 0 && first.doctorStale.out.includes("roster confirmed for today")
        : first.doctorStale.code === 0,
    ],
    [
      "lifecycle.a_personal_key_is_sent_raw",
      first.trackerCalls.every((call) => !call.authorization.startsWith("Bearer ")),
    ],
    [
      "lifecycle.status_says_where_the_work_stands",
      first.status.out.includes("DONE") && first.status.out.includes(`#${first.pull.number}`),
    ],
  ].map(([type, ok]) => ({ type, status: ok ? "passed" : "failed" }));
}

const first = lifecycle();
// A second world, from scratch, because "it worked once" and "it works" are
// different claims and only one of them is worth a gate.
const second = lifecycle();

const assertions = assertionsFor(first, second);
const failed = assertions.filter((assertion) => assertion.status === "failed");

for (const assertion of failed) process.stderr.write(`FAILED ${assertion.type}\n`);

fs.writeFileSync(
  reportPath,
  `${JSON.stringify(
    {
      scenario: "ticket-to-qa",
      status: failed.length === 0 ? "passed" : "failed",
      goal:
        "One of my tickets is in progress with a question hanging over it. I want to find it in QA, " +
        "owned by whoever is on QA today, with a pull request that a person who was not already buried " +
        "reviewed and approved, the automated reviewer's comments answered, and the one comment I had to " +
        "settle brought to me instead of guessed at. I want to be told once when it needs me, and I do not " +
        "want to watch it.",
      artifact: {
        package: "@amy/cli",
        entry: "the installed executable, driven by `amy discover` and `amy tick`",
        built_by: "scripts/install.sh",
      },
      observed: {
        assertions_run: assertions.length,
        assertions_failed: failed.length,
        version: first.version.out,
        looks: first.trail.length,
        transitions: transitions(first),
        held_in: heldIn(first),
        what_the_world_did: first.moves.map((move) => move.move),
        agent_calls: first.agentCalls.map((call) => call.step),
        gh_calls: first.ghCalls.length,
        tracker_calls: first.trackerCalls.length,
        commits_on_the_branch: first.commits,
        reviewer: first.record.reviewer,
        follow_up: first.record.escalation?.followUpTicketId,
        final_status: statusOf(first, TICKET),
        budget: first.budget.out.split("\n").at(-1),
        second_run_transitions: transitions(second).length,
      },
      assertions,
    },
    null,
    2,
  )}\n`,
  "utf-8",
);

process.stdout.write(
  `${assertions.length - failed.length}/${assertions.length} assertions passed in ${first.trail.length} looks\n`,
);
process.exit(failed.length === 0 ? 0 : 1);
