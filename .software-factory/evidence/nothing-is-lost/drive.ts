// Drives the built `amy` and the built plugins from separate processes, and
// writes down what the machine looked like afterwards.
//
// Usage: tsx drive.ts <source-dir> <amy-binary> <report-path> [--keep]
//
// Nothing here reaches inside amy: the notes, tasks, records and locks are
// files on this disk, and every call to amy is the command an operator types.
// The concurrency claims run in processes of their own, because the defects
// they name happened between processes. Each claim drives the product it
// names — the bot through the Telegram build, the stalled call through Slack's
// and Linear's, the release through the installed `amy look`.
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

/** The state directory the installed command is driven against, so its files are this gate's own. */
const AMY_HOME = path.join(scratch, "amy");
const env: NodeJS.ProcessEnv = { ...process.env, AMY_HOME };

/** The built modules, imported the way another process would find them. */
const BUILT = {
  note: path.join(repo, "examples/workflow-note-to-plan/dist/note-file.js"),
  task: path.join(repo, "examples/workflow-errand/dist/task-file.js"),
  store: path.join(repo, "plugins/file-store/dist/FileStore.js"),
  lock: path.join(repo, "packages/core/dist/process-lock.js"),
  http: path.join(repo, "packages/core/dist/http.js"),
  telegramApi: path.join(repo, "plugins/telegram/dist/BotApi.js"),
  telegram: path.join(repo, "plugins/telegram/dist/TelegramConversation.js"),
  slack: path.join(repo, "plugins/slack/dist/SlackApi.js"),
  linear: path.join(repo, "plugins/linear/dist/HttpGraphQLClient.js"),
};

interface Said {
  code: number | null;
  out: string;
  err: string;
}

function run(command: string, args: readonly string[], childEnv: NodeJS.ProcessEnv = process.env): Promise<Said> {
  return new Promise((resolve) => {
    const child = spawn(command, args, { env: childEnv, stdio: ["ignore", "pipe", "pipe"] });
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

/** The records directory of the profile the installed command wrote, found by looking rather than by assuming a name. */
function recordsUnder(root: string): string | undefined {
  if (!fs.existsSync(root)) return undefined;
  return fs
    .readdirSync(root, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && fs.existsSync(path.join(root, entry.name, "records")))
    .map((entry) => path.join(root, entry.name, "records"))
    .find((directory) => fs.readdirSync(directory).some((name) => name.endsWith(".json")));
}

async function runPicksUpAFoundTicket(): Promise<{ picked: boolean; said: string }> {
  const workflow = process.env.NOTHING_IS_LOST_WORKFLOW;
  if (!workflow) return { picked: false, said: "NOTHING_IS_LOST_WORKFLOW is not set" };
  // The installed command, on a profile the install wrote: one pass, as an
  // operator would type it. Before the fix this printed nothing to queue.
  const added = await run(binary, ["add", workflow], env);
  const ran = await run(binary, ["run", "--workflow", "finds-a-ticket", "--max", "1"], env);
  const said = `${added.out}${added.err}${ran.out}${ran.err}`;
  return { picked: said.includes("queued TICKET-1"), said };
}

/**
 * A `gaveUp` an operator clears while the engine is working stays cleared.
 *
 * The engine read the record before the release and saves the work it planned
 * from, marker included. The release is the installed command's, not this
 * gate's: `amy look W-1` is what a person types, and the record it writes is
 * the one the engine's save must not undo.
 */
async function aLookLosesNothing(records: string | undefined): Promise<boolean> {
  if (records === undefined) return false;
  const released = { at: "2026-11-15T12:00:00.000Z", reason: "ceiling" };
  fs.writeFileSync(path.join(records, "W-1.json"), JSON.stringify({ id: "W-1", state: "WORKING", updatedAt: released.at, attempts: {}, history: [], gaveUp: released }), "utf-8");

  const store = JSON.stringify(pathToFileURL(BUILT.store).href);
  const engine = path.join(scratch, "engine.mjs");
  fs.writeFileSync(
    engine,
    `import fs from "node:fs";\nconst { FileStore } = await import(${store});\nconst directory = ${JSON.stringify(records)};\n${wait}\n` +
      `const records = new FileStore(directory, false);\n` +
      `// Read first, as a pass does: what is saved is the record this process planned from.\n` +
      `const record = records.load("W-1");\n` +
      `fs.writeFileSync(directory + "/ready", "");\n` +
      `const by = Date.now() + 20_000;\nwhile (!fs.existsSync(directory + "/looked") && Date.now() < by) wait(5);\n` +
      `records.save({ ...record, state: "DONE", attempts: { moved: 1 }, gaveUp: record.gaveUp });\n`,
    "utf-8",
  );
  const moved = run(process.execPath, [engine], env);
  const readyBy = Date.now() + 15_000;
  while (!fs.existsSync(path.join(records, "ready")) && Date.now() < readyBy) await new Promise((resolve) => setTimeout(resolve, 5));
  const looked = await run(binary, ["look", "W-1", "--workflow", "finds-a-ticket"], env);
  fs.writeFileSync(path.join(records, "looked"), "", "utf-8");
  const saved = await moved;
  if (looked.code !== 0 || saved.code !== 0) return false;

  const record = JSON.parse(fs.readFileSync(path.join(records, "W-1.json"), "utf-8")) as { attempts?: unknown; gaveUp?: unknown };
  // The move kept, and the release still released: the engine wrote the state
  // it planned from, but not the marker an operator cleared meanwhile.
  return JSON.stringify(record.attempts) === JSON.stringify({ moved: 1 }) && record.gaveUp === undefined;
}

/**
 * The bot's hold, taken by the Telegram plugin's own build.
 *
 * Each process calls `chat()`, which holds the bot across its `getUpdates`
 * call. The stand-in server counts the calls in flight: two at once is two
 * holders, which is what a stale lock used to let happen.
 */
async function oneBotAfterAStaleLock(): Promise<boolean> {
  const directory = path.join(scratch, "bot");
  fs.mkdirSync(path.join(directory, "lock"), { recursive: true });
  fs.writeFileSync(path.join(directory, "lock/owner"), "gone", { mode: 0o600 });
  const old = new Date(Date.now() - 3_600_000);
  fs.utimesSync(path.join(directory, "lock"), old, old);

  let inside = 0;
  let conflict = false;
  const server = http.createServer((request, response) => {
    inside += 1;
    if (inside > 1) conflict = true;
    setTimeout(() => {
      inside -= 1;
      request.resume();
      response.writeHead(200, { "content-type": "application/json" });
      response.end(JSON.stringify({ ok: true, result: [] }));
    }, 60);
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const api = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;

  fs.writeFileSync(
    path.join(scratch, "hold.mjs"),
    `import fs from "node:fs";\n` +
      `const { BotApi } = await import(${JSON.stringify(pathToFileURL(BUILT.telegramApi).href)});\n` +
      `const { TelegramConversation } = await import(${JSON.stringify(pathToFileURL(BUILT.telegram).href)});\n` +
      `const [directory, server] = process.argv.slice(2);\n` +
      `const api = new BotApi("gate-token", { server, deadlineMs: 5_000, maxRateLimitRetries: 1 });\n` +
      `const conversation = new TelegramConversation(api, { operator: "1", directory, shared: directory, topics: false, leaseMs: 1000, lockWaitMs: 20_000 });\n` +
      `await conversation.chat();\n`,
    "utf-8",
  );
  const holders = ["a", "b", "c", "d"];
  const finished = await Promise.all(holders.map(() => run(process.execPath, [path.join(scratch, "hold.mjs"), directory, api])));
  server.closeAllConnections();
  await new Promise((resolve) => server.close(resolve));
  return finished.every((one) => one.code === 0) && !conflict;
}

/**
 * A stalled call made through the Slack and Linear plugins' own builds.
 *
 * Each plugin builds its request the way its product does; the socket under
 * it is this gate's, so the host it waited on is a `127.0.0.1` port that never
 * answers. Both settle at the deadline and say which host and how long.
 */
async function aStalledCallEnds(): Promise<{ ended: boolean; said: string }> {
  const said: string[] = [];
  for (const built of [BUILT.slack, BUILT.linear]) {
    const server = http.createServer(() => {
      // Headers never arrive: the shape Slack and Linear waited on forever.
    });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const host = `127.0.0.1:${(server.address() as AddressInfo).port}`;
    said.push(await stalledThrough(built, host));
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
  }
  const ended = said.every((one) => one.includes("did not answer within 300 ms"));
  return { ended, said: said.join("; ") };
}

/** One plugin, its own build, and this gate's socket underneath it. */
async function stalledThrough(built: string, host: string): Promise<string> {
  const core = (await import(pathToFileURL(BUILT.http).href)) as {
    fetchTransport: (request: { url: string; method: "GET" | "POST"; headers: Record<string, string>; body?: string; deadlineMs: number }) => Promise<unknown>;
  };
  const transport = (request: { url: string; method: "GET" | "POST"; headers: Record<string, string>; body?: string; deadlineMs?: number }) =>
    core.fetchTransport({ ...request, url: `http://${host}${new URL(request.url).pathname}`, deadlineMs: 300 });

  const started = Date.now();
  const said = await (built === BUILT.slack ? stalledSlack(built, transport) : stalledLinear(built, transport, host));
  return Date.now() - started < 3_000 ? said : `${said}, and it took ${Date.now() - started} ms`;
}

async function stalledSlack(
  built: string,
  transport: (request: { url: string; method: "GET" | "POST"; headers: Record<string, string>; body?: string }) => Promise<unknown>,
): Promise<string> {
  const module = (await import(pathToFileURL(built).href)) as {
    SlackApi: new (token: string, options: { transport: typeof transport; deadlineMs: number }) => {
      call(method: string, args: Record<string, string>): Promise<unknown>;
    };
  };
  const api = new module.SlackApi("xoxb-gate", { transport, deadlineMs: 300 });
  return api.call("conversations.replies", { channel: "C1", ts: "1.0" }).then(
    () => "answered",
    (error: unknown) => (error instanceof Error ? error.message : String(error)),
  );
}

async function stalledLinear(
  built: string,
  transport: (request: { url: string; method: "GET" | "POST"; headers: Record<string, string>; body?: string }) => Promise<unknown>,
  host: string,
): Promise<string> {
  const module = (await import(pathToFileURL(built).href)) as {
    HttpGraphQLClient: new (endpoint: string, key: string, options: { transport: typeof transport; deadlineMs: number }) => {
      request<T>(query: string): Promise<T>;
    };
  };
  const client = new module.HttpGraphQLClient(`http://${host}/graphql`, "lin_api_gate", { transport, deadlineMs: 300 });
  return client.request("query { viewer { id } }").then(
    () => "answered",
    (error: unknown) => (error instanceof Error ? error.message : String(error)),
  );
}

const notes = await twoAtOneInstant("note");
const tasks = await twoAtOneInstant("task");
const ran = await runPicksUpAFoundTicket();
const look = await aLookLosesNothing(recordsUnder(AMY_HOME));
const bot = await oneBotAfterAStaleLock();
const stalled = await aStalledCallEnds();

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
        "Nothing a process writes is lost to another process: two notes or tasks of one instant are two, `amy look` " +
        "does not erase an engine's move and the engine's save does not undo the release `amy look` made, the " +
        "Telegram plugin's bot holds after a stale lock, a stalled call made through the Slack and Linear plugins " +
        "ends at its deadline, and a pass of `amy run` picks up a ticket sitting in the world.",
      artifact: {
        package: "@amykit/cli",
        entry:
          "the installed executable, driven by `amy add`, `amy run` and `amy look`, with the built plugins " +
          "(file-store, telegram, slack, linear) run in processes of their own",
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
