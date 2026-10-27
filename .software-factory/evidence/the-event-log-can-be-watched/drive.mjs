// Watches the event log from one process while another writes it the way
// the daemon does, and writes down what the watcher saw.
//
// Usage: node drive.mjs <repo> <report-path>
//        node drive.mjs <repo> --write <log-directory>   (the writer's half)
//
// What is real: the built FileEventLog on both sides, a real directory, two
// processes and the filesystem between them. The writer appends through the
// same class `amy daemon` opens, and writes the one half line by hand,
// because a crash mid-append is the thing a class never does on purpose.
//
// Every assertion is read off what the watcher was handed, timed on arrival
// against the instant the writer stamped just before appending.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import { setTimeout as pause } from "node:timers/promises";
import { fileURLToPath, pathToFileURL } from "node:url";

const [repo, second, third] = process.argv.slice(2);
const { FileEventLog } = await import(pathToFileURL(path.join(repo, "plugins/file-log/dist/index.js")).href);

const BEFORE_MIDNIGHT = "2026-10-27T23:59:59.500Z";
const AFTER_MIDNIGHT = "2026-10-28T00:00:00.250Z";

if (second === "--write") {
  const log = new FileEventLog(third);
  const write = (at, kind, workId) => log.append({ at, kind, workId, detail: { writtenAt: Date.now() } });

  write(BEFORE_MIDNIGHT, "work.advanced", "W-1");
  await pause(300);
  write(BEFORE_MIDNIGHT, "work.waiting", "W-2");
  await pause(300);

  // Half a line, then the rest of it long after: the watcher must wait.
  const half = JSON.stringify({ at: BEFORE_MIDNIGHT, kind: "work.advanced", workId: "W-3", detail: { writtenAt: 0 } });
  const file = path.join(third, `${BEFORE_MIDNIGHT.slice(0, 10)}.jsonl`);
  fs.appendFileSync(file, half.slice(0, 40));
  await pause(1_200);
  process.stdout.write("still-half\n");
  await pause(100);
  fs.appendFileSync(file, half.slice(40).replace('"writtenAt":0', `"writtenAt":${Date.now()}`) + "\n");
  await pause(300);

  // The next day's file does not exist until this line creates it.
  write(AFTER_MIDNIGHT, "work.advanced", "W-4");
  await pause(300);
  write(AFTER_MIDNIGHT, "work.settled", "W-5");
  await pause(1_000);
  process.stdout.write("stopping\n");
  await pause(300);
  write(AFTER_MIDNIGHT, "work.advanced", "W-6");
  process.exit(0);
}

const reportPath = second;
const directory = fs.mkdtempSync(path.join(os.tmpdir(), "amy-watch-"));
const assertions = [];
const record = (type, ok, detail) =>
  assertions.push({ type, status: ok ? "passed" : "failed", ...(ok || detail === undefined ? {} : { detail }) });

const seen = [];
const watcher = new FileEventLog(directory);
let stop = watcher.watch(new Date(0), (event) => seen.push({ event, lagMs: Date.now() - Number(event.detail?.writtenAt) }));
let whileHalf = null;

const writer = spawn(process.execPath, [fileURLToPath(import.meta.url), repo, "--write", directory], { stdio: ["ignore", "pipe", "inherit"] });
let delivered = -1;
writer.stdout.on("data", (chunk) => {
  // Over a second after the half line went down, and before the rest of it.
  if (String(chunk).includes("still-half")) whileHalf = seen.map((s) => s.event.workId);
  if (String(chunk).includes("stopping")) {
    stop();
    delivered = seen.length;
    stop = () => undefined;
  }
});
const exitCode = await new Promise((resolve) => writer.on("exit", resolve));
await pause(1_000);
stop();

const ids = seen.map((s) => s.event.workId);
const lags = Object.fromEntries(seen.map((s) => [s.event.workId, s.lagMs]));
const onDisk = fs.readFileSync(path.join(directory, "2026-10-28.jsonl"), "utf-8").includes('"W-6"');

record("watch.the_writer_is_another_process", exitCode === 0 && writer.pid !== process.pid, { exitCode });
record("watch.a_work_advanced_arrives_within_a_second", seen.length > 0 && seen.every((s) => s.lagMs >= 0 && s.lagMs < 1_000), { lags });
record("watch.each_line_once_in_order", JSON.stringify(ids.slice(0, 5)) === JSON.stringify(["W-1", "W-2", "W-3", "W-4", "W-5"]), { ids });
record(
  "watch.a_partial_line_is_never_delivered",
  JSON.stringify(whileHalf) === JSON.stringify(["W-1", "W-2"]) && ids.filter((id) => id === "W-3").length === 1 && lags["W-3"] < 1_000,
  { whileHalf, lags },
);
record("watch.the_next_day_is_followed_without_resubscribing", ids.includes("W-4") && ids.includes("W-5"), { ids });
record("watch.stopping_ends_delivery", onDisk && delivered === 5 && !ids.includes("W-6"), { delivered, ids, onDisk });

fs.rmSync(directory, { recursive: true, force: true });
const failed = assertions.filter((assertion) => assertion.status !== "passed");
fs.writeFileSync(
  reportPath,
  `${JSON.stringify(
    {
      scenario: "the-event-log-can-be-watched",
      status: failed.length === 0 ? "passed" : "failed",
      goal: "Prove that a process watching the event log sees a work.advanced another process wrote within a second of it being written, across a day boundary, once and in order, never a partial line, and nothing after it stops watching.",
      artifact: { package: "@amykit/plugin-file-log", entry: "dist/index.js, in the watcher and in the writer" },
      observed: { assertions_run: assertions.length, assertions_failed: failed.length, node: process.version },
      assertions,
    },
    null,
    2,
  )}\n`,
);
console.log(`${assertions.length - failed.length}/${assertions.length} assertions passed`);
for (const assertion of failed) console.log(`failed: ${assertion.type} ${JSON.stringify(assertion.detail)}`);
if (failed.length) process.exit(1);
