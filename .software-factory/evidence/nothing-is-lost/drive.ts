// Drives the built `amy` and the built packages from separate processes, and
// writes down what the machine looked like afterwards.
//
// Usage: tsx drive.ts <source-dir> <amy-binary> <report-path> [--keep]
//
// Nothing here reaches inside amy: the notes, tasks, records and locks are
// files on this disk, and the one call to amy is the command an operator
// types. The concurrency claims run in processes of their own, because the
// defects they name happened between processes: an in-process interleaving
// would prove the wrong thing.
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { spawn } from "node:child_process";
import type { AddressInfo } from "node:net";

function usage(): never {
  throw new Error("usage: drive.ts <source-dir> <amy-binary> <report-path> [--keep]");
}

const [source = usage(), binary = usage(), reportPath = usage()] = process.argv.slice(2);
const keep = process.argv.includes("--keep");
const repo = path.resolve(source, "..", "..", "..");
const scratch = fs.mkdtempSync(path.join(repo, ".tmp-nothing-is-lost-"));

/** The built modules, imported the way another process would find them. */
const BUILT = {
  note: path.join(repo, "examples/workflow-note-to-plan/dist/note-file.js"),
  task: path.join(repo, "examples/workflow-errand/dist/task-file.js"),
  store: path.join(repo, "plugins/file-store/dist/FileStore.js"),
  lock: path.join(repo, "packages/core/dist/process-lock.js"),
  http: path.join(repo, "packages/core/dist/http.js"),
};

interface Said {
  code: number | null;
  out: string;
  err: string;
}

function run(command: string, args: readonly string[], env: NodeJS.ProcessEnv = process.env): Promise<Said> {
  return new Promise((resolve) => {
    const child = spawn(command, args, { env, stdio: ["ignore", "pipe", "pipe"] });
    let out = "";
    let err = "";
    child.stdout.on("data", (chunk: Buffer) => (out += chunk.toString()));
    child.stderr.on("data", (chunk: Buffer) => (err += chunk.toString()));
    child.on("close", (code) => resolve({ code, out, err }));
  });
}

const wait = "const wait = (ms) => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);";

async function twoAtOneInstant(kind: "note" | "task"): Promise<{ kept: boolean; said: readonly Said[] }> {
  const directory = path.join(scratch, kind);
  fs.mkdirSync(directory, { recursive: true });
  const writer =
    kind === "note"
      ? `const { writeNoteFile } = await import(${JSON.stringify(pathToFileURL(BUILT.note).href)});\n` +
        `writeNoteFile(directory, { repo: "acme/one", source: "gate", text: "note " + who }, new Date("2026-11-15T12:00:00.000Z"));`
      : `const { writeTaskFile } = await import(${JSON.stringify(pathToFileURL(BUILT.task).href)});\n` +
        `writeTaskFile(directory, { repo: "acme/one", source: "gate", text: "task " + who }, new Date("2026-11-15T12:00:00.000Z"));`;
  const script = `import fs from "node:fs";\nconst directory = ${JSON.stringify(directory)};\nconst who = process.argv[2];\n${wait}\nwhile (!fs.existsSync(directory + "/go")) wait(1);\n${writer}\n`;
  fs.writeFileSync(path.join(scratch, `${kind}.mjs`), script, "utf-8");
  const started = ["0", "1"].map((who) => run(process.execPath, [path.join(scratch, `${kind}.mjs`), directory, who]));
  await new Promise((resolve) => setTimeout(resolve, 150));
  fs.writeFileSync(path.join(directory, "go"), "", "utf-8");
  const finished = await Promise.all(started);
  const kept = finished.every((one) => one.code === 0) && fs.readdirSync(directory).filter((name) => name.endsWith(".md")).length === 2;
  return { kept, said: finished };
}

async function aLookLosesNothing(): Promise<boolean> {
  const directory = path.join(scratch, "record");
  fs.mkdirSync(directory, { recursive: true });
  fs.writeFileSync(path.join(directory, "W-1.json"), JSON.stringify({ id: "W-1", state: "WORKING", attempts: 0, gaveUp: "ceiling" }), "utf-8");

  const store = JSON.stringify(pathToFileURL(BUILT.store).href);
  fs.writeFileSync(
    path.join(scratch, "look.mjs"),
    `import fs from "node:fs";\nconst { FileStore } = await import(${store});\nconst directory = ${JSON.stringify(directory)};\n${wait}\nwhile (!fs.existsSync(directory + "/ready")) wait(1);\nconst records = new FileStore(directory, false);\nrecords.update("W-1", (record) => { const { gaveUp, ...rest } = record; wait(40); return rest; });\n`,
    "utf-8",
  );
  fs.writeFileSync(
    path.join(scratch, "engine.mjs"),
    `import fs from "node:fs";\nconst { FileStore } = await import(${store});\nconst directory = ${JSON.stringify(directory)};\n${wait}\nconst records = new FileStore(directory, false);\nrecords.save({ id: "W-1", state: "WORKING", attempts: 1, gaveUp: "ceiling" });\nfs.writeFileSync(directory + "/ready", "");\nwait(10);\nrecords.save({ id: "W-1", state: "WORKING", attempts: 2 });\n`,
    "utf-8",
  );
  const [looked, moved] = await Promise.all([
    run(process.execPath, [path.join(scratch, "look.mjs")]),
    run(process.execPath, [path.join(scratch, "engine.mjs")]),
  ]);
  if (looked.code !== 0 || moved.code !== 0) return false;
  const record = JSON.parse(fs.readFileSync(path.join(directory, "W-1.json"), "utf-8")) as { attempts: number };
  return record.attempts === 2;
}

async function oneBotAfterAStaleLock(): Promise<boolean> {
  const directory = path.join(scratch, "bot");
  fs.mkdirSync(path.join(directory, "lock"), { recursive: true });
  fs.writeFileSync(path.join(directory, "lock/owner"), "gone", { mode: 0o600 });
  const old = new Date(Date.now() - 3_600_000);
  fs.utimesSync(path.join(directory, "lock"), old, old);

  fs.writeFileSync(
    path.join(scratch, "hold.mjs"),
    `import fs from "node:fs";\nconst { takeLock } = await import(${JSON.stringify(pathToFileURL(BUILT.lock).href)});\nconst directory = process.argv[2];\nconst me = process.argv[3];\n${wait}\nlet held = takeLock(directory + "/lock", { leaseMs: 1000 });\nwhile (!held) { wait(5); held = takeLock(directory + "/lock", { leaseMs: 1000 }); }\nfs.writeFileSync(directory + "/holder", me);\nwait(30);\nif (fs.readFileSync(directory + "/holder", "utf-8") !== me) fs.writeFileSync(directory + "/conflict", me);\nheld.release();\n`,
    "utf-8",
  );
  const holders = ["a", "b", "c", "d"];
  const finished = await Promise.all(holders.map((me) => run(process.execPath, [path.join(scratch, "hold.mjs"), directory, me])));
  return finished.every((one) => one.code === 0) && !fs.existsSync(path.join(directory, "conflict"));
}

async function aStalledCallEnds(): Promise<{ ended: boolean; said: string }> {
  const server = http.createServer(() => {
    // Headers never arrive: the shape Slack and Linear waited on forever.
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const host = `127.0.0.1:${(server.address() as AddressInfo).port}`;
  const started = Date.now();
  const core = (await import(pathToFileURL(BUILT.http).href)) as {
    fetchTransport: (request: { url: string; method: "GET"; headers: Record<string, string>; deadlineMs: number }) => Promise<unknown>;
  };
  const said = await core.fetchTransport({ url: `http://${host}/stall`, method: "GET", headers: {}, deadlineMs: 300 }).then(
    () => "answered",
    (error: unknown) => (error instanceof Error ? error.message : String(error)),
  );
  const ended = said.includes(host) && said.includes("300 ms") && Date.now() - started < 3_000;
  server.closeAllConnections();
  await new Promise((resolve) => server.close(resolve));
  return { ended, said };
}

async function runPicksUpAFoundTicket(): Promise<{ picked: boolean; said: string }> {
  const workflow = process.env.NOTHING_IS_LOST_WORKFLOW;
  if (!workflow) return { picked: false, said: "NOTHING_IS_LOST_WORKFLOW is not set" };
  // The installed command, on a profile the install wrote: one pass, as an
  // operator would type it. Before the fix this printed nothing to queue.
  const added = await run(binary, ["add", workflow]);
  const ran = await run(binary, ["run", "--workflow", "finds-a-ticket", "--max", "1"]);
  const said = `${added.out}${added.err}${ran.out}${ran.err}`;
  return { picked: said.includes("queued TICKET-1"), said };
}

const notes = await twoAtOneInstant("note");
const tasks = await twoAtOneInstant("task");
const look = await aLookLosesNothing();
const bot = await oneBotAfterAStaleLock();
const stalled = await aStalledCallEnds();
const ran = await runPicksUpAFoundTicket();

const checks: [string, boolean][] = [
  ["lost.two_notes_at_one_instant_are_two", notes.kept],
  ["lost.two_tasks_at_one_instant_are_two", tasks.kept],
  ["lost.a_look_loses_no_engine_move", look],
  ["lost.one_bot_holds_after_a_stale_lock", bot],
  ["lost.a_stalled_call_ends", stalled.ended],
  ["lost.run_picks_up_a_found_ticket", ran.picked],
];

const assertions = checks.map(([type, ok]) => ({ type, status: ok ? "passed" : "failed" }));
const failed = assertions.filter((one) => one.status === "failed");
for (const one of failed) process.stderr.write(`FAILED ${one.type}\n`);

fs.writeFileSync(
  reportPath,
  `${JSON.stringify(
    {
      scenario: "nothing-is-lost",
      status: failed.length === 0 ? "passed" : "failed",
      goal:
        "Nothing a process writes is lost to another process: two notes or tasks of one instant are two, a look " +
        "does not erase an engine's move, one bot holds after a stale lock, a call to a server that never answers " +
        "ends at its deadline, and a pass of `amy run` picks up a ticket sitting in the world.",
      artifact: {
        package: "@amykit/cli",
        entry: "the installed executable, driven by `amy add` and `amy run`, with the built packages run in processes of their own",
        built_by: "scripts/install.sh",
      },
      observed: {
        assertions_run: assertions.length,
        assertions_failed: failed.length,
        notes: fs.readdirSync(path.join(scratch, "note")).filter((name) => name.endsWith(".md")).length,
        tasks: fs.readdirSync(path.join(scratch, "task")).filter((name) => name.endsWith(".md")).length,
        stalled: stalled.said,
        run: ran.said.trim().split("\n").slice(-4),
      },
      assertions,
    },
    null,
    2,
  )}\n`,
  "utf-8",
);

if (!keep) fs.rmSync(scratch, { recursive: true, force: true });
process.stdout.write(`${assertions.length - failed.length}/${assertions.length} assertions passed\n`);
process.exit(failed.length === 0 ? 0 : 1);
