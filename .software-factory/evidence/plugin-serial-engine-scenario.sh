#!/bin/sh
# The `plugin-serial-engine` gate's scenario, as a repeatable run.
#
# Usage: plugin-serial-engine-scenario.sh [report-path]
#
# Mounts the *built* engine and fan-out in a separate process, over a real
# queue directory, a real record store and a real event log, with a real
# `plugin-github` talking to a fake `gh` that can be taken down between ticks.
#
# What this exists to prove only ever happens on a bad day, and it is file
# state *between ticks* that carries it: whether you were warned once or five
# times, and whether a ticket kept its place. No unit test reaches a real
# `mount()`, a fan-out with a channel that genuinely throws, or a log
# directory that genuinely cannot be written.
#
# The `gh` binary and the notification channels are the pretend parts, and
# they have to be: producing an outage on demand means producing one. The
# tracker, the agent and the gate are contributed inline because they are not
# what is under test and the real ones need credentials. The engine, the
# fan-out, the queue, the store, the log and the code host are the artifacts
# somebody would install.
#
# A harness, not the actor. Who invokes it is what the manifest's `actor`
# records, and L3.GATE_HAS_FRESH_EVIDENCE refuses a manifest that credits the
# run to the harness itself.
set -eu

report=${1:-.software-factory/evidence/plugin-serial-engine-run.json}
repo=$(cd "$(dirname "$0")/../.." && pwd)

for pkg in plugins/serial-engine plugins/notify-fanout plugins/file-queue \
  plugins/file-store plugins/file-log plugins/github packages/core; do
  test -f "$repo/$pkg/dist/index.js" ||
    { echo "build it first: npm run build ($pkg)" >&2; exit 1; }
done

work=$(mktemp -d)
trap 'rm -rf "$work"' EXIT

mkdir -p "$work/bin" "$work/checkouts"

# A `gh` that is down exactly while a file exists, so the probe can take the
# code host away in the middle of a run and give it back.
cat > "$work/bin/gh" <<'FAKE'
#!/bin/sh
if [ -f "$AMY_E2E_GH_DOWN" ]; then
  echo "gh: could not connect to api.github.com" >&2
  exit 1
fi
# No pull request for this branch, which is the honest answer here: the
# scenario never gets as far as opening one.
printf '{"data":{"repository":{"pullRequests":{"nodes":[]}}}}\n'
FAKE

chmod +x "$work/bin/gh"

PATH="$work/bin:$PATH" node --input-type=module - "$work" "$repo" "$report" <<'PROBE'
import fs from "node:fs";
import path from "node:path";

const [work, repo, report] = process.argv.slice(2);
const dist = (...where) => path.join(repo, ...where, "dist", "index.js");

const { mount, NodeCommandRunner, checkEvent } = await import(dist("packages", "core"));
const { plugin: queue } = await import(dist("plugins", "file-queue"));
const { plugin: store } = await import(dist("plugins", "file-store"));
const { FileEventLog } = await import(dist("plugins", "file-log"));
const { plugin: github } = await import(dist("plugins", "github"));
const { plugin: engine } = await import(dist("plugins", "serial-engine"));
// The workflow arrives as a plugin now: it registers the order its states
// happen in and contributes how each of its actions runs. The engine holds
// neither, which is what lets this scenario drive the real one rather than a
// copy of it.
const { plugin: workflow } = await import(dist("packages", "workflow-ticket-to-qa"));
const { plugin: fanout, CHANNEL_COLLECTION } = await import(dist("plugins", "notify-fanout"));

const assertions = [];
const record = (type, ok) => assertions.push({ type, status: ok ? "passed" : "failed" });

const state = path.join(work, ".amy");
const logDir = path.join(state, "log");
const ghDown = path.join(work, "gh-is-down");
process.env.AMY_E2E_GH_DOWN = ghDown;

// The probe owns the clock, because the retried item sits behind a five
// minute backoff and nobody is waiting five minutes to find that out.
let clock = new Date("2026-09-03T12:00:00.000Z");
const tick5 = () => (clock = new Date(clock.getTime() + 6 * 60 * 1000));

const ROSTER = {
  confirmedOn: "2026-09-03",
  reviewers: [{ tracker: "ada@example.test", host: "ada", available: true }],
  qa: { tracker: "grace@example.test", host: "grace", available: true },
};

function ticketFor(id) {
  return {
    id,
    title: "The invoice total is wrong",
    team: "PROJ",
    url: `https://tracker.test/${id}`,
    branchName: `ada/${id.toLowerCase()}-invoice-total`,
    status: "In Progress",
    repo: "acme/widgets",
  };
}

/** What the announcements went into, per channel, across the whole run. */
const delivered = { recorder: [] };
const brokenChannel = path.join(work, "channel-is-broken");

/** The tracker, agent, gate and roster the engine needs but is not about. */
const comments = [];
function worldPlugin() {
  return {
    name: "@amy/plugin-e2e-world",
    version: "0.1.0",
    register(registry) {
      registry.port("tracker", {
        inProgress: async () => [],
        get: async (id) => ticketFor(id),
        comment: async (id, body) => void comments.push({ id, body }),
        hasReplyAfter: async () => false,
        setStatus: async () => {},
        assign: async () => {},
        createFollowUp: async () => "PROJ-9999",
      });
      // Never clear, so every ticket's next move is `ask-question`, which is
      // the cheapest real move that reaches the notifier.
      registry.port("agent", {
        triage: async () => ({
          value: { clear: false, questions: ["which total is wrong?"], at: clock.toISOString() },
          run: agentRun(),
        }),
        implement: async () => ({
          value: { ok: true, output: "", at: clock.toISOString() },
          run: agentRun(),
        }),
        addressThreads: async () => ({ value: [], run: agentRun() }),
      });
      registry.port("gate", {
        run: async () => ({ ok: true, output: "", at: clock.toISOString() }),
      });
      registry.contribute("workflow-data", "roster", { read: () => ROSTER });
    },
  };
}

function agentRun() {
  return {
    outcome: "completed",
    harness: "fake",
    model: "fake-1",
    tokens: { input: 1, output: 1, cacheRead: 0, cacheWrite: 0 },
    costUsd: 0.001,
    costSource: "reported",
    durationMs: 10,
    output: "",
  };
}

/** A channel that writes down what it was given, or throws when told to. */
function channelPlugin(name, { throws = false } = {}) {
  return {
    name: `@amy/plugin-e2e-${name}`,
    version: "0.1.0",
    register(registry) {
      registry.contribute(CHANNEL_COLLECTION, name, {
        name,
        deliver: async (announcement) => {
          if (throws && fs.existsSync(brokenChannel)) {
            throw new Error(`${name} cannot reach anybody`);
          }
          (delivered[name] ??= []).push(announcement.text);
        },
      });
    },
  };
}

/** A budget that always refuses, for the one assertion about a park. */
function refusingBudgetPlugin() {
  return {
    name: "@amy/plugin-e2e-budget",
    version: "0.1.0",
    register(registry) {
      registry.port("budget", {
        mayStart: () => ({
          ok: false,
          window: "perFiveHours",
          measure: "costUsd",
          used: 19,
          limit: 20,
          stopAt: 0.9,
          retryAfterMs: 60_000,
          reason: "the perFiveHours budget is nearly spent",
        }),
      });
    },
  };
}

/**
 * A whole host over the same directories, mounted fresh.
 *
 * Fresh every time on purpose: `amy tick` is a new process each run, so
 * anything that only works because one object stayed in memory is not a
 * property this scenario should be able to observe.
 */
async function host({ channels = [channelPlugin("recorder")], extra = [], log } = {}) {
  const outcome = await mount(
    [queue, store, github, fanout, ...channels, worldPlugin(), workflow, ...extra, engine],
    {
      "@amy/plugin-serial-engine": { maxItemAttempts: 5 },
      "@amy/workflow-ticket-to-qa": { repos: ["acme/widgets"], qaStatusName: "In QA" },
    },
    {
      runner: new NodeCommandRunner(),
      now: () => clock,
      log: log ?? new FileEventLog(logDir, () => clock, "e2e"),
      paths: { workspace: path.join(work, "checkouts"), state },
    },
  );

  if (!outcome.ok) throw new Error(outcome.problems.join("; "));
  return outcome.mounted;
}

/**
 * Takes everything currently on the queue out of the way.
 *
 * One tick advances one item, and the stages below are each about a different
 * ticket. Without this, a stage would keep claiming the leftovers of the one
 * before it and prove nothing about its own.
 */
function drain(mounted) {
  const wellPast = new Date(clock.getTime() + 24 * 60 * 60 * 1000);
  for (;;) {
    const item = mounted.queue.claim(wellPast);
    if (!item) break;
    mounted.queue.complete(item);
  }
}

const sentSoFar = () => delivered.recorder.length;
const linesIn = (dir) =>
  fs
    .readdirSync(dir)
    .filter((name) => name.endsWith(".jsonl"))
    .flatMap((name) => fs.readFileSync(path.join(dir, name), "utf-8").split("\n"))
    .filter((line) => line.trim() !== "")
    .map((line) => JSON.parse(line));

const kindsOf = (kind) => linesIn(logDir).filter((event) => event.kind === kind);

// 1. The code host goes down under a claimed ticket. One warning, naming the
// ticket and the failure, and the ticket stays on the queue.
{
  fs.writeFileSync(ghDown, "");
  const mounted = await host();
  mounted.queue.enqueue({ workId: "PROJ-1239", reason: "found in the working status" }, clock);

  const result = await mounted.engine.tick();
  const said = delivered.recorder;

  record(
    "engine.warns_once_on_the_first_failure",
    result.kind === "failed" &&
      said.length === 1 &&
      said[0].includes("PROJ-1239") &&
      said[0].includes("is failing in DISCOVERED") &&
      said[0].includes("api.github.com"),
  );
  record("engine.writes_down_that_the_work_degraded", kindsOf("work.degraded").length === 1);
}

// 2. Still down, two ticks later. Nothing new is said, and the attempt count
// is what carried that silence across two fresh mounts.
{
  const before = sentSoFar();

  for (const _ of [1, 2]) {
    tick5();
    const mounted = await host();
    await mounted.engine.tick();
  }

  const mounted = await host();
  record(
    "engine.stays_quiet_on_the_middle_attempts",
    sentSoFar() === before && mounted.queue.pending()[0]?.attempt === 3,
  );
}

// 3. The code host comes back. One warning that it is moving again, and the
// ticket picks up the move it was going to make from where it stood.
{
  fs.rmSync(ghDown);
  tick5();

  const mounted = await host();
  const result = await mounted.engine.tick();
  const said = delivered.recorder;

  record(
    "engine.warns_once_when_it_recovers",
    said.length === 2 &&
      said[1].includes("PROJ-1239 is moving again in DISCOVERED") &&
      said[1].includes("after 3"),
  );
  record("engine.writes_down_that_the_work_recovered", kindsOf("work.recovered").length === 1);

  const saved = JSON.parse(
    fs.readFileSync(path.join(state, "tickets", "PROJ-1239.json"), "utf-8"),
  );
  record(
    "engine.carries_on_from_where_it_was",
    result.kind === "worked" &&
      result.from === "DISCOVERED" &&
      saved.state === "DISCOVERED" &&
      saved.triage?.clear === false &&
      mounted.queue.pending()[0]?.attempt === 0,
  );
}

// 4. A channel throws. The tick still finishes, the record still moves, and
// the log says what could not be delivered.
{
  fs.writeFileSync(brokenChannel, "");
  tick5();

  const mounted = await host({
    channels: [channelPlugin("recorder"), channelPlugin("broken", { throws: true })],
  });
  const result = await mounted.engine.tick();

  const saved = JSON.parse(
    fs.readFileSync(path.join(state, "tickets", "PROJ-1239.json"), "utf-8"),
  );

  record(
    "engine.finishes_the_tick_when_a_channel_throws",
    result.kind === "worked" && result.to === "CLARIFYING" && saved.state === "CLARIFYING",
  );

  const failed = kindsOf("notify.failed");
  record(
    "engine.records_the_notification_it_could_not_send",
    failed.length === 1 &&
      failed[0].workId === "PROJ-1239" &&
      failed[0].detail.error.includes("broken cannot reach anybody") &&
      failed[0].detail.text.includes("needs an answer"),
  );
  // The working channel still got it, which is the other half of the promise.
  record(
    "engine.one_broken_channel_does_not_stop_the_others",
    delivered.recorder.at(-1).includes("PROJ-1239 needs an answer"),
  );
}

// 5. Every channel throws, so the fan-out itself gives up. That is still not
// a reason for a ticket to stop moving.
{
  tick5();
  const first = await host({ channels: [channelPlugin("broken", { throws: true })] });
  drain(first);
  first.queue.enqueue({ workId: "PROJ-1240", reason: "found in the working status" }, clock);
  await first.engine.tick();

  tick5();
  const mounted = await host({ channels: [channelPlugin("broken", { throws: true })] });
  const result = await mounted.engine.tick();

  const saved = JSON.parse(
    fs.readFileSync(path.join(state, "tickets", "PROJ-1240.json"), "utf-8"),
  );

  record(
    "engine.finishes_the_tick_when_every_channel_throws",
    result.kind === "worked" && result.to === "CLARIFYING" && saved.state === "CLARIFYING",
  );
  record(
    "engine.records_the_notification_when_nothing_could_send_it",
    kindsOf("notify.failed").some(
      (event) => event.workId === "PROJ-1240" && event.detail.error.includes("every notification"),
    ),
  );
  fs.rmSync(brokenChannel);
}

// 6. A ceiling reached while the only channel is down. The item is already
// off the queue by then, so this is the case where an announcement that threw
// used to lose the ticket with nothing saying why.
{
  tick5();
  fs.writeFileSync(ghDown, "");
  fs.writeFileSync(brokenChannel, "");

  const mounted = await host({ channels: [channelPlugin("broken", { throws: true })] });
  drain(mounted);
  mounted.queue.enqueue(
    { workId: "PROJ-1241", reason: "retrying after an error", attempt: 4 },
    clock,
  );
  const result = await mounted.engine.tick();

  // Counted by announcement rather than by line. With one channel that
  // throws there are two lines about the same undelivered text — the channel
  // that could not deliver it, and the whole attempt that could not — and
  // that is two failures recorded at two layers, not two announcements.
  const said = kindsOf("notify.failed").filter((event) => event.workId === "PROJ-1241");
  const texts = new Set(said.map((event) => event.detail.text));

  record(
    "engine.announces_once_at_the_ceiling",
    result.kind === "failed" &&
      texts.size === 1 &&
      [...texts][0].includes("is off the queue") &&
      mounted.queue.pending().every((item) => item.workId !== "PROJ-1241"),
  );

  fs.rmSync(ghDown);
  fs.rmSync(brokenChannel);
}

// 7. A park against a spent budget. The retry budget the failures already
// used must not come back, or the next tick reads attempt zero and announces
// a recovery that never happened.
{
  tick5();
  const mounted = await host({ extra: [refusingBudgetPlugin()] });
  drain(mounted);
  mounted.queue.enqueue({ workId: "PROJ-1242", reason: "retrying", attempt: 2 }, clock);

  const before = sentSoFar();
  const result = await mounted.engine.tick();
  const parked = mounted.queue.pending().find((item) => item.workId === "PROJ-1242");

  record(
    "engine.keeps_the_attempt_count_across_a_park",
    result.kind === "parked" && parked?.attempt === 2 && sentSoFar() === before,
  );
}

// 8. A log that cannot be written. Not a permission trick — a directory whose
// parent is a plain file, so `appendFileSync` gets ENOTDIR for anybody,
// including root.
{
  tick5();
  const broken = path.join(work, "nowhere");
  const brokenLog = new FileEventLog(path.join(broken, "log"), () => clock, "e2e");
  fs.rmSync(broken, { recursive: true, force: true });
  fs.writeFileSync(broken, "not a directory\n");

  const complaints = [];
  const stderr = console.error;
  console.error = (message) => complaints.push(String(message));

  let result;
  try {
    const mounted = await host({ log: brokenLog });
    drain(mounted);
    mounted.queue.enqueue({ workId: "PROJ-1243", reason: "found in the working status" }, clock);
    result = await mounted.engine.tick();
  } finally {
    console.error = stderr;
  }

  record("engine.finishes_the_tick_when_the_log_cannot_be_written", result.kind === "worked");
  record(
    "engine.says_the_log_is_broken_once",
    complaints.filter((line) => line.includes("cannot write its event log")).length === 1,
  );
}

// 9. Every line this run actually wrote, against the declared contract. The
// unit tests check the engine's own lines; this checks what reached the disk.
{
  const written = linesIn(logDir);
  const problems = written.flatMap((event) => checkEvent(event));

  record(
    "engine.every_line_matches_the_contract",
    written.length > 0 && problems.length === 0,
  );
  if (problems.length > 0) for (const problem of problems) console.error(problem);
}

const failed = assertions.filter((a) => a.status !== "passed");

fs.writeFileSync(
  report,
  `${JSON.stringify(
    {
      scenario: "plugin-serial-engine",
      status: failed.length === 0 ? "passed" : "failed",
      goal:
        "This thing runs unattended, so the day GitHub goes down I want one warning on the way down, silence while it is down, one warning when it comes back, and the ticket still standing where it was. And I want to know that a notification channel I misconfigured, or a log directory I cannot write to, never costs a ticket a move.",
      artifact: {
        package: "@amy/plugin-serial-engine",
        entry: "dist/index.js",
        mounted_with: [
          "@amy/plugin-notify-fanout",
          "@amy/plugin-file-queue",
          "@amy/plugin-file-store",
          "@amy/plugin-file-log",
          "@amy/plugin-github",
          "@amy/core",
        ],
      },
      observed: {
        assertions_run: assertions.length,
        assertions_failed: failed.length,
        log_lines_written: linesIn(logDir).length,
        node: process.version,
      },
      assertions,
    },
    null,
    2,
  )}\n`,
  "utf-8",
);

console.log(`${assertions.length - failed.length}/${assertions.length} assertions passed`);
if (failed.length > 0) {
  for (const a of failed) console.error(`FAILED ${a.type}`);
  process.exit(1);
}
PROBE
