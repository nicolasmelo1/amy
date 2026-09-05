#!/bin/sh
# The `plugin-file-queue` gate's scenario, as a repeatable run.
#
# Usage: plugin-file-queue-scenario.sh [report-path]
#
# Drives the *built* plugin from a separate process against a real directory,
# which is what the unit tests deliberately do not do: they exercise the class,
# this exercises the artifact somebody would install. Emits the report that
# .software-factory/evidence/plugin-file-queue.json cites.
#
# A harness, not the actor. Who invokes it is what the manifest's `actor`
# records, and L3.GATE_HAS_FRESH_EVIDENCE refuses a manifest that credits the
# run to the harness itself.
set -eu

report=${1:-.software-factory/evidence/plugin-file-queue-run.json}
repo=$(cd "$(dirname "$0")/../.." && pwd)
dist="$repo/plugins/file-queue/dist/index.js"
test -f "$dist" || { echo "build it first: npm run build" >&2; exit 1; }

work=$(mktemp -d)
trap 'rm -rf "$work"' EXIT

node --input-type=module - "$work" "$dist" "$report" <<'PROBE'
import fs from "node:fs";
import path from "node:path";

const [work, dist, report] = process.argv.slice(2);
const { FileQueue } = await import(dist);

const assertions = [];
const record = (type, ok) => assertions.push({ type, status: ok ? "passed" : "failed" });

const at = (iso) => new Date(iso);
const T0 = at("2026-09-03T12:00:00.000Z");
const T5 = at("2026-09-03T12:05:00.000Z");

const dir = path.join(work, "queue");
const queue = new FileQueue(dir);

// 1. What goes in comes back out, and the queue is a directory anyone can read.
queue.enqueue({ workId: "W-1", reason: "discovered" }, T0);
const claimed = queue.claim(T0);
record("queue.claims_what_was_enqueued", claimed?.workId === "W-1");
record("queue.is_a_directory_of_files", fs.existsSync(path.join(dir, "running")));

// 2. Two workers cannot take the same item. This is the whole point of rename.
record("queue.refuses_a_second_claim", queue.claim(T0) === null);

// 3. Finishing takes it out of circulation without deleting the record.
queue.complete(claimed);
record("queue.completing_clears_the_pending_set", queue.pending().length === 0);

// 4. A held item is invisible until its time, which is how waiting states back off.
queue.enqueue({ workId: "W-2", reason: "waiting on review", delayMs: 5 * 60 * 1000 }, T0);
record("queue.holds_an_item_until_it_is_due", queue.claim(T0) === null);
record("queue.hands_it_over_once_due", queue.claim(T5)?.workId === "W-2");

// 5. A worker that dies leaves a claim behind, and the item must come back.
const muchLater = new Date(Date.now() + 60 * 60 * 1000);
record("queue.recovers_what_a_dead_worker_left", queue.recover(30 * 60 * 1000, muchLater).length === 1);
record("queue.recovered_item_is_claimable_again", queue.claim(muchLater)?.workId === "W-2");

// 6. Chaining: the look that just finished enqueues the next one, with no
// schedule anywhere. A step that took an hour chains the moment it ends.
const anHourOn = new Date(T0.getTime() + 60 * 60 * 1000);
queue.enqueue({ workId: "W-3", reason: "run the gate" }, anHourOn);
record("queue.chains_the_next_look_immediately", queue.claim(anHourOn)?.reason === "run the gate");

// 7. Finished items are swept, and unfinished work is never swept.
const pendingBefore = queue.pending().length + queue.running().length;
const removed = queue.prune(0, new Date(Date.now() + 24 * 60 * 60 * 1000));
record("queue.prunes_finished_items", removed > 0);
record("queue.never_prunes_unfinished_work", queue.pending().length + queue.running().length === pendingBefore);

// 8. It survives the process that made it, which a queue on disk must.
queue.enqueue({ workId: "W-4", reason: "persisted" }, T0);
const reopened = new FileQueue(dir);
record("queue.survives_a_restart", reopened.claim(T0)?.workId === "W-4");

// 9. Bringing a look forward, which is how an event arriving early collapses
// a wait. The hazard is not that it fails to move.
//
// It is that it moves by adding a second look, and then one piece of work has
// two chains, each enqueueing its own successor and each spending an agent.
// That is the exactly-once property above, lost from the other side.
const poked = new FileQueue(path.join(work, "queue-poked"));
poked.enqueue({ workId: "P-1", reason: "waiting on review", delayMs: 5 * 60 * 1000 }, T0);
record("queue.holds_a_look_until_it_is_poked", poked.claim(T0) === null);
record("queue.brings_a_held_look_forward", poked.promote("P-1", T0) === 1);
record("queue.promoting_leaves_one_look", poked.pending().length === 1);
record("queue.promoted_look_is_claimable_now", poked.claim(T0)?.workId === "P-1");

// Ordering is what a promotion written in place gets wrong: an id begins with
// the instant an item became due, and `claim` takes the first name in sorted
// order, so the item brought forward would be handed out last.
const ordered = new FileQueue(path.join(work, "queue-order"));
const aMinuteOn = new Date(T0.getTime() + 60 * 1000);
ordered.enqueue({ workId: "P-2", reason: "waiting on review", delayMs: 10 * 60 * 1000 }, T0);
ordered.promote("P-2", aMinuteOn);
ordered.enqueue({ workId: "P-3", reason: "discovered" }, new Date(T0.getTime() + 2 * 60 * 1000));
record(
  "queue.promoted_look_is_ordered_by_its_new_time",
  ordered.claim(new Date(T0.getTime() + 3 * 60 * 1000))?.workId === "P-2",
);

const failed = assertions.filter((a) => a.status !== "passed");

fs.writeFileSync(
  report,
  `${JSON.stringify(
    {
      scenario: "plugin-file-queue",
      status: failed.length === 0 ? "passed" : "failed",
      goal:
        "I am about to trust this queue with work that takes hours. Prove the built artifact claims exactly once, holds an item until it is due, gives back what a dead worker left, sweeps only finished items, survives the process that made it, and brings a held look forward without leaving a second one behind.",
      artifact: { package: "@amykit/plugin-file-queue", entry: "dist/index.js" },
      observed: {
        assertions_run: assertions.length,
        assertions_failed: failed.length,
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
