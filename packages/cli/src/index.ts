#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import { Command } from "commander";
// Type-only: the CLI reports what a tick returned and mounts no engine itself.
import type { TickResult } from "@amy/plugin-serial-engine";
import { isConfirmedFor } from "@amy/workflow-ticket-to-qa";
import { FileNotes } from "@amy/plugin-file-notes";
import { FileTasks } from "@amy/plugin-file-tasks";
import {
  BUDGET_WINDOWS,
  Engine,
  FileStopSwitch,
  LogBudget,
  Mounted,
  NodeCommandRunner,
  WorkRecord,
  ceilingFor,
  describeBuild,
  mount,
  parseBudget,
  spendSince,
  stampId,
  unmetNeeds,
} from "@amy/core";
import {
  MODELS_DEV_URL,
  ModelsDevCatalog,
  OVERRIDE_FILE,
  refreshFrom,
  specTable,
} from "@amy/model-specs";
import { FileEventLog } from "@amy/plugin-file-log";
// Inspection builds these directly: `amy status` has to work even when a
// plugin will not mount, which is exactly when you want to look.
import { FileQueue } from "@amy/plugin-file-queue";
import { FileStore } from "@amy/plugin-file-store";
import {
  AmyConfig,
  EXAMPLE_CONFIG,
  EXAMPLE_ROSTER,
  confirmRoster,
  loadConfig,
  loadRoster,
  removeProfile,
  writeProfilePlugins,
} from "./config.js";
import { loadEnv } from "./env.js";
import { diagnose } from "./doctor.js";
import { NOT_INSTALLED, installedPlugins, load } from "./loader.js";
import { Profile, profiles, recommendedFor, resolveProfile } from "./profiles.js";
import { hostPlugin } from "./hostPlugin.js";
import { installedStamp } from "./stamp.js";
import { hostPaths, pluginList, pluginSlices } from "./slices.js";
import { clearDaemon, running, writeDaemon } from "./daemon.js";
import { Harness as HarnessTarget, install, installedHarnesses } from "./harnesses.js";
import { shipped } from "./skills.js";
import { amyHome } from "./home.js";
import { paths, profilePaths } from "./paths.js";

// One amy per machine, not one per directory: it is reached from whichever
// harness you are in, from wherever you happen to be standing.
const home = amyHome();
const runner = new NodeCommandRunner();
// Read once, at the top, and handed to every log this process opens. A
// release that logged `dev` would be a stamp that cannot be joined to
// anything, which is the only thing it is for.
const stamp = installedStamp();
const build = stampId(stamp);
const stopSwitch = new FileStopSwitch(paths(home).stop);

// Before anything reads process.env, so a key kept in .env is picked up. The
// state directory first, then the directory the command was typed in — a
// project's own key beats the machine's, which is what a `.env` is for.
loadEnv(home);
loadEnv(process.cwd());

/**
 * Loads the plugins the config asks for and assembles them.
 *
 * Every refusal happens here, by name, before a ticket is touched: a plugin
 * that will not import, a setting that is not one it has, two plugins
 * claiming the same port, an action the workflow emits that nothing can run.
 */
async function assemble(
  profile: Profile,
): Promise<
  { ok: true; engine: Engine; mounted: Mounted } | { ok: false; problems: string[] }
> {
  const config = loadConfig(home);
  const place = profilePaths(home, profile.name);
  const specs = pluginList(config, profile);

  const loaded = await load(specs);
  if (loaded.problems.length > 0) return { ok: false, problems: loaded.problems };

  const outcome = await mount(
    [...loaded.plugins, hostPlugin(() => loadRoster(home))],
    pluginSlices(config, profile),
    {
      runner,
      now: () => new Date(),
      log: new FileEventLog(place.log, undefined, build),
      paths: hostPaths(config, place.base),
    },
  );

  if (!outcome.ok) return { ok: false, problems: outcome.problems };

  const { mounted } = outcome;
  if (!mounted.engine) {
    return { ok: false, problems: ["no plugin mounted an engine, so nothing can advance work"] };
  }
  if (!mounted.workflow) {
    return { ok: false, problems: ["no plugin mounted a workflow, so there is no order to follow"] };
  }

  const unmet = unmetNeeds(mounted, mounted.workflow);
  if (unmet.length > 0) return { ok: false, problems: unmet };

  return { ok: true, engine: mounted.engine, mounted };
}

/**
 * Which workflow this invocation drives.
 *
 * A global option rather than a second executable, because everything a
 * profile needs is already in this one install. `mount()` still claims a
 * single workflow, so the profile is what chooses which.
 */
function selected(config: AmyConfig = loadConfig(home)): Profile {
  const resolution = resolveProfile(config, program.opts<{ workflow?: string }>().workflow);
  if (resolution.ok) return resolution.profile;

  console.error(resolution.problem);
  process.exit(1);
}

/** Assembles, or prints why it could not and stops. */
async function engineOrExit(): Promise<Engine> {
  const outcome = await assemble(selected());
  if (outcome.ok) return outcome.engine;

  console.error("amy could not start:");
  for (const problem of outcome.problems) console.error(`  ${problem}`);

  // Once, rather than beside every missing plugin: the list is the same one
  // each time, and what makes a typo visible is seeing the near miss next to
  // the name that was asked for.
  if (outcome.problems.some((problem) => problem.includes(NOT_INSTALLED))) {
    console.error(`\nInstalled: ${installed()}`);
  }

  process.exitCode = 1;
  process.exit(1);
}

/** What this machine has, for a refusal to be answerable rather than final. */
function installed(): string {
  const found = installedPlugins();
  return found.length > 0 ? found.join(", ") : "nothing that looks like a plugin";
}

const program = new Command();

program
  .name("amy")
  .description(
    "Drives a work ticket from in-progress to QA handoff, one deterministic move at a time.",
  )
  .option("--workflow <name>", "which workflow to drive, by the name the config gives it")
  .version(describeBuild(stamp));

program
  .command("init")
  .description("Write the config and roster templates")
  .action(() => {
    const place = paths(home);
    // The watched directory, made now rather than on the first note, so it is
    // somewhere to drop a file into before anything has ever run.
    fs.mkdirSync(place.notes, { recursive: true });

    for (const profile of Object.values(profiles(loadConfig(home)))) {
      const own = profilePaths(home, profile.name);
      fs.mkdirSync(own.records, { recursive: true });
      fs.mkdirSync(own.queue, { recursive: true });
    }

    for (const [file, content] of [
      [place.config, EXAMPLE_CONFIG],
      [place.roster, EXAMPLE_ROSTER],
    ] as const) {
      if (fs.existsSync(file)) {
        console.log(`kept   ${file}`);
        continue;
      }
      fs.writeFileSync(file, content, "utf-8");
      console.log(`wrote  ${file}`);
    }

    console.log("\nEdit both, then run `amy roster confirm` and `amy doctor`.");
    console.log(`Friction goes in ${place.notes}, or through \`amy note\`.`);

    // Nothing but the command itself is installed with it. What a workflow
    // needs is a recommendation, and a machine that has no use for a plugin
    // has no reason to carry one.
    const suggested = Object.values(profiles(loadConfig(home))).flatMap(recommendedFor);
    const absent = [...new Set(suggested)].filter((name) => !installedPlugins().includes(name));
    if (absent.length > 0) {
      console.log(`\nThese are not installed yet:\n  npm install -g ${absent.join(" ")}`);
    }
  });

program
  .command("doctor")
  .description("Check everything the machine depends on before it touches a ticket")
  .action(async () => {
    const config = loadConfig(home);
    const profile = selected(config);
    const loaded = await load(pluginList(config, profile));

    const checks = await diagnose({
      home,
      config,
      runner,
      env: process.env,
      now: new Date(),
      readRoster: loadRoster,
      cwd: process.cwd(),
      schemas: Object.fromEntries(
        loaded.plugins.flatMap((plugin) => (plugin.configSchema ? [[plugin.name, plugin.configSchema]] : [])),
      ),
    });

    for (const check of checks) {
      const detail = check.detail ? `  ${check.detail}` : "";
      console.log(`${check.ok ? "ok  " : "FAIL"} ${check.label}${detail}`);
    }

    // Asked last, because a mount problem is usually a consequence of one of
    // the checks above rather than a separate fault.
    const assembled = await assemble(profile);
    if (!assembled.ok) {
      for (const problem of assembled.problems) console.log(`FAIL ${problem}`);
    } else {
      console.log(`ok   ${assembled.mounted.plugins.length} plugin(s) assembled`);
    }

    const broken = checks.filter((check) => !check.ok).length + (assembled.ok ? 0 : 1);
    if (broken > 0) {
      console.log(`\n${broken} problem(s) to fix before running.`);
      process.exitCode = 1;
      return;
    }
    console.log("\nready");
  });

program
  .command("pause")
  .description("Pull the handbrake: end work in flight and start nothing new")
  .argument("[reason]", "why, so the log says something useful later")
  .action((reason: string | undefined) => {
    const why = reason ?? "paused by hand";
    stopSwitch.request(why);
    new FileEventLog(paths(home).log, undefined, build).append({
      at: new Date().toISOString(),
      kind: "stop.requested",
      detail: { reason: why },
    });
    console.log(`paused: ${why}`);
    console.log("A run in flight kills its children. `amy resume` releases it.");
  });

program
  .command("resume")
  .description("Release the handbrake")
  .action(() => {
    if (!stopSwitch.isRequested()) {
      console.log("not paused");
      return;
    }
    stopSwitch.clear();
    console.log("released, the queue picks up where it left off");
  });

program
  .command("start")
  .description("Start the loop in the background, and keep it running")
  .option("--every <seconds>", "how long to wait after finding nothing to do", "60")
  .action((options: { every: string }) => {
    const place = paths(home);
    const already = running(place.pid);
    if (already) {
      console.log(`already running: pid ${already.pid}, driving ${already.workflow}`);
      return;
    }

    const profile = selected();
    // Detached, with its output on a file rather than this terminal: the
    // point of starting it is that it outlives the session that started it,
    // and a child holding this terminal's stdout would not.
    const out = fs.openSync(path.join(place.base, "daemon.log"), "a");
    const child = spawn(
      process.execPath,
      [process.argv[1]!, "--workflow", profile.name, "daemon", "--every", options.every],
      { detached: true, stdio: ["ignore", out, out], env: process.env },
    );
    child.unref();

    writeDaemon(place.pid, {
      pid: child.pid ?? 0,
      workflow: profile.name,
      startedAt: new Date().toISOString(),
    });

    console.log(`started ${profile.name}: pid ${child.pid}`);
    console.log(`Watch it: tail -f ${path.join(place.base, "daemon.log")}`);
  });

program
  .command("stop")
  .description("Stop the background loop")
  .action(() => {
    const place = paths(home);
    const record = running(place.pid);
    if (!record) {
      console.log("nothing running");
      return;
    }

    // The handbrake first, so a run in the middle of an agent call ends its
    // children rather than being killed with them still going, and then the
    // loop itself. Cleared afterwards: pausing is a separate thing an
    // operator does, and stopping should not leave the machine held.
    stopSwitch.request("stopped by hand");
    process.kill(record.pid, "SIGTERM");
    stopSwitch.clear();
    clearDaemon(place.pid);

    console.log(`stopped ${record.workflow}: pid ${record.pid}`);
  });

program
  .command("daemon")
  .description("The loop itself, in the foreground. `amy start` runs this for you")
  .option("--every <seconds>", "how long to wait after finding nothing to do", "60")
  .action(async (options: { every: string }) => {
    const engine = await engineOrExit();
    const idleMs = Math.max(1, Number(options.every)) * 1000;
    let stopping = false;

    for (const signal of ["SIGTERM", "SIGINT"] as const) {
      process.on(signal, () => {
        stopping = true;
        runner.killAll();
      });
    }

    console.log(`${new Date().toISOString()} loop up, looking every ${idleMs / 1000}s`);

    while (!stopping) {
      if (stopSwitch.isRequested()) {
        await sleep(idleMs);
        continue;
      }

      // Discovery every pass, because work appears in the world rather than
      // being handed over: a ticket moved into the working status while
      // nothing was due is exactly what this loop exists to notice.
      await engine.discover();
      const result = (await engine.tick()) as TickResult;
      report(result);

      if (result.kind === "idle" || result.kind === "stopped") await sleep(idleMs);
    }

    console.log(`${new Date().toISOString()} loop down`);
  });

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

program
  .command("discover")
  .description("Put every piece of work the workflow can find onto the queue")
  .action(async () => {
    const queued = await (await engineOrExit()).discover();
    console.log(queued.length ? `queued ${queued.join(", ")}` : "nothing new to queue");
  });

program
  .command("tick")
  .description("Advance one piece of work by one move")
  .action(async () => {
    report((await (await engineOrExit()).tick()) as TickResult);
  });

program
  .command("run")
  .description("Keep advancing until nothing is due")
  .option("--max <n>", "stop after this many moves", "100")
  .action(async (options: { max: string }) => {
    const engine = await engineOrExit();
    const max = Number(options.max);

    // Refusing the next tick is not stopping while an agent call is still
    // running, so the watcher ends the children the moment the brake is
    // pulled rather than at the next boundary.
    const unwatch = stopSwitch.watch((reason) => {
      const killed = runner.killAll();
      console.error(`stopping: ${reason}${killed ? ` (ended ${killed} child process(es))` : ""}`);
    });

    try {
      for (let move = 0; move < max; move += 1) {
        const result = (await engine.tick()) as TickResult;
        report(result);
        if (result.kind === "idle" || result.kind === "stopped") return;
      }

      console.log(`stopped after ${max} moves`);
    } finally {
      unwatch();
    }
  });

program
  .command("note")
  .description("Write a piece of friction down, and put it on the queue")
  .argument("<text>", "what went wrong, in your own words")
  .option("--repo <owner/name>", "the repository it is about")
  .option("--source <who>", "who noticed", "somebody at a keyboard")
  .action((text: string, options: { repo?: string; source: string }) => {
    const config = loadConfig(home);
    const repo = options.repo ?? config.plans.repos[0];

    if (!repo) {
      console.error("no repository: pass --repo, or list one under `plans.repos`.");
      process.exitCode = 1;
      return;
    }

    const profile = profileThat("takesNotes", config, "notes");
    if (!profile) {
      process.exitCode = 1;
      return;
    }

    const place = profilePaths(home, profile.name);
    const now = new Date();

    // Written and queued in one step, with nothing resolved against anything.
    // That is the point of the command: a piece of work reaches the queue
    // without existing in a tracker, and the machine advances it from there.
    const note = new FileNotes(place.notes, { defaultRepo: repo }).write(
      { repo, text, source: options.source },
      now,
    );

    new FileQueue(place.queue).enqueue({ workId: note.id, reason: "written down by hand" }, now);

    console.log(`noted ${note.id} about ${repo}`);
    console.log(`\`amy --workflow ${profile.name} tick\` moves it along.`);
  });

/**
 * Which profile a thing written down goes to.
 *
 * The config says so — `notes: true`, `tasks: true` — rather than these
 * commands knowing a workflow's name. Two profiles claiming it is not a
 * failure to guess at: `--workflow` settles it, and the message says so.
 */
function profileThat(
  takes: "takesNotes" | "takesTasks",
  config: AmyConfig,
  what: string,
): Profile | undefined {
  const asked = program.opts<{ workflow?: string }>().workflow;
  if (asked) return selected(config);

  const takers = Object.values(profiles(config)).filter((profile) => profile[takes]);
  if (takers.length === 1) return takers[0];

  console.error(
    takers.length === 0
      ? `no workflow takes ${what}: mark one with \`${what}: true\` under \`workflows:\`.`
      : `more than one workflow takes ${what}, so name one: ${takers.map((t) => t.name).join(", ")}`,
  );
  return undefined;
}

program
  .command("btw")
  .description("Something to do, said in passing. Goes on the queue, never becomes a ticket")
  .argument("<text>", "what to do, in your own words")
  .option("--repo <owner/name>", "the repository it is in")
  .option("--source <who>", "who asked", "somebody at a keyboard")
  .action((text: string, options: { repo?: string; source: string }) => {
    const config = loadConfig(home);
    const repo = options.repo ?? config.repos[0];

    if (!repo) {
      console.error("no repository: pass --repo, or list one under `repos`.");
      process.exitCode = 1;
      return;
    }

    const profile = profileThat("takesTasks", config, "tasks");
    if (!profile) {
      process.exitCode = 1;
      return;
    }

    const place = profilePaths(home, profile.name);
    const now = new Date();

    // Written and queued in one step, and nothing is resolved against
    // anything. That is the whole point of the command: the cost of capturing
    // a thing you said in passing has to be close to zero, or it does not get
    // captured.
    const task = new FileTasks(path.join(place.base, "tasks"), { defaultRepo: repo }).add(
      { repo, text, source: options.source },
      now,
    );

    new FileQueue(place.queue).enqueue({ workId: task.id, reason: "said in passing" }, now);

    console.log(`noted ${task.id} in ${repo}`);
    console.log(`\`amy --workflow ${profile.name} tick\` picks it up.`);
  });

program
  .command("status")
  .description("Show where every piece of work stands and what the queue holds")
  .option("--json", "the same thing as data, for something else to render")
  .action(async (options: { json?: boolean }) => {
    const profile = selected();
    const place = profilePaths(home, profile.name);
    const queue = new FileQueue(place.queue);
    const now = new Date();

    // Assembled only to ask the workflow which of its states are waiting
    // ones. A mount that will not come up is exactly when somebody wants to
    // look, so the records are still reported, without that column.
    const assembled = await assemble(profile);
    const workflow = assembled.ok ? assembled.mounted.workflow : undefined;
    const waiting = workflow?.waitingStates;

    const records = new FileStore<AnyRecord>(place.records)
      .all()
      .sort((a, b) => a.id.localeCompare(b.id));

    const live = running(place.pid);
    const held = stopSwitch.isRequested() ? stopSwitch.reason() : null;
    const notes = countIn(place.notes);
    const asked = countIn(place.needsInput);

    if (options.json) {
      console.log(JSON.stringify(snapshot(), null, 2));
      return;
    }

    reportRecords(records, waiting);

    console.log(
      `\nqueue: ${queue.ready(now).length} due, ${queue.pending().length} pending, ` +
        `${queue.running().length} in flight, ${queue.completed().length} finished`,
    );

    console.log(
      live
        ? `loop:  running since ${live.startedAt}, driving ${live.workflow}, pid ${live.pid}` +
            `${held ? ` (paused: ${held})` : ""}`
        : `loop:  not running${held ? ` (paused: ${held})` : ""}`,
    );

    if (notes) console.log(`notes: ${notes} written down`);
    if (asked) console.log(`\n${asked} question(s) waiting for you in ${place.needsInput}`);

    /**
     * Everything above, as data.
     *
     * Its own function because the two renderings share every fact and
     * neither should be able to drift from the other: what a page shows has
     * to be what the terminal would have said.
     */
    function snapshot() {
      return {
        at: now.toISOString(),
        home,
        profile: profile.name,
        workflow: profile.workflow,
        mounted: assembled.ok,
        problems: assembled.ok ? [] : assembled.problems,
        states: workflow?.states ?? [],
        waitingStates: waiting ?? [],
        terminalStates: workflow?.terminalStates ?? [],
        records: records.map((record) => ({
          id: record.id,
          state: record.state,
          waiting: waiting ? waiting.includes(record.state) : null,
          repo: record.repo ?? null,
          pullRequest: record.pullRequestNumber ?? null,
          updatedAt: record.updatedAt,
          attempts: record.attempts,
          history: record.history,
        })),
        queue: {
          due: queue.ready(now).length,
          pending: queue.pending().length,
          running: queue.running().length,
          finished: queue.completed().length,
        },
        loop: live ?? null,
        paused: held,
        notes,
        needsInput: asked,
      };
    }
  });

/** How many markdown files a directory holds, and none when there is none. */
function countIn(directory: string): number {
  if (!fs.existsSync(directory)) return 0;
  return fs.readdirSync(directory).filter((name) => name.endsWith(".md")).length;
}

program
  .command("budget")
  .description("What the agents have spent, and how close that is to the ceiling")
  .action(() => {
    const parsed = parseBudget(configuredBudget());
    if (!parsed.ok) {
      for (const problem of parsed.problems) console.error(problem);
      process.exitCode = 1;
      return;
    }

    const log = new FileEventLog(paths(home).log, undefined, build);
    const now = new Date();

    for (const window of BUDGET_WINDOWS) {
      const since = new Date(now.getTime() - window.ms);
      const spend = spendSince(log.read(since), since);
      const ceiling = ceilingFor(parsed.limits, window.name);

      console.log(
        `${window.name.padEnd(14)} ${String(spend.runs).padStart(4)} run(s)  ` +
          `${against(spend.tokens, ceiling?.tokens, "tokens")}  ` +
          `${against(spend.costUsd, ceiling?.costUsd, "USD")}`,
      );
    }

    const decision = new LogBudget(log, parsed.limits).mayStart(now);
    console.log(
      decision.ok
        ? "\nnew work: allowed"
        : `\nnew work: parked, ${decision.reason} (room again in ${Math.round(decision.retryAfterMs / 60000)} min)`,
    );
  });

/**
 * Every record the profile holds, in whatever shape its workflow gave them.
 *
 * The core's `WorkRecord` is all this reads, plus two fields a workflow may
 * or may not carry. That is the difference between a status command and a
 * status command per workflow.
 */
type AnyRecord = WorkRecord & { pullRequestNumber?: number; repo?: string };

function reportRecords(records: readonly AnyRecord[], waiting: readonly string[] | undefined): void {
  if (records.length === 0) console.log("nothing tracked yet");

  for (const record of records) {
    const held = waiting ? (waiting.includes(record.state) ? "waiting" : "active") : "?";
    const pr = record.pullRequestNumber ? `#${record.pullRequestNumber}` : "";
    console.log(
      `${record.id.padEnd(28)} ${record.state.padEnd(18)} ${held.padEnd(8)} ` +
        `${(record.repo ?? "").padEnd(30)} ${pr}`.trimEnd(),
    );
  }
}

/** The `budget` setting, from the plugin slice the relay is given. */
function configuredBudget(): unknown {
  const config = loadConfig(home);
  const slice = pluginSlices(config, selected(config))["@amy/plugin-agent-relay"];
  return slice && typeof slice === "object" ? (slice as Record<string, unknown>).budget : undefined;
}

/** `1,234 / 2,000 tokens (62%)`, or the spend alone when nothing caps it. */
function against(used: number, limit: number | undefined, unit: string): string {
  const spent = unit === "USD" ? `$${used.toFixed(2)}` : used.toLocaleString();
  if (limit === undefined) return `${spent} ${unit} (no ceiling)`;

  const cap = unit === "USD" ? `$${limit.toFixed(2)}` : limit.toLocaleString();
  const share = limit === 0 ? 100 : Math.round((used / limit) * 100);
  return `${spent} of ${cap} ${unit} (${share}%)`;
}

const modelsCommand = program
  .command("models")
  .description("What each model is believed to cost");

modelsCommand
  .command("show")
  .description("The price table in force")
  .action(() => {
    const table = specTable(home);

    console.log(`source: ${table.source}\n`);
    for (const spec of table.models) {
      const tier = spec.thresholdTokens
        ? `  (above ${spec.thresholdTokens.toLocaleString()} input tokens every rate changes)`
        : "";
      console.log(
        `  ${spec.model.padEnd(22)} in ${perMillion(spec.inputPerToken)}  ` +
          `out ${perMillion(spec.outputPerToken)}  ` +
          `cache r/w ${perMillion(spec.cacheReadPerToken)}/${perMillion(spec.cacheWritePerToken)}${tier}`,
      );
    }
    console.log(`\n${table.note}`);
  });

modelsCommand
  .command("refresh")
  .description("Take the base rates from models.dev, keeping what it does not carry")
  .option("--dry-run", "say what would change and write nothing")
  .action(async (options: { dryRun?: boolean }) => {
    const response = await fetch(MODELS_DEV_URL);
    if (!response.ok) {
      console.error(`${MODELS_DEV_URL} answered ${response.status}`);
      process.exitCode = 1;
      return;
    }

    const report = refreshFrom((await response.json()) as ModelsDevCatalog, specTable(home));

    if (report.changed.length === 0) {
      console.log("nothing changed");
    }
    for (const change of report.changed) {
      console.log(
        `  ${change.model} ${change.field}: ${perMillion(change.was)} -> ${perMillion(change.now)}`,
      );
    }
    for (const model of report.unmatched) {
      console.log(`  ${model}: models.dev does not know it, left as it was`);
    }

    if (options.dryRun) {
      console.log("\nnothing written");
      return;
    }

    const file = path.join(home, OVERRIDE_FILE);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, `${JSON.stringify(report.table, null, 2)}\n`, "utf-8");
    console.log(`\nwrote ${file}`);
    console.log("Long-context tiering was kept: models.dev does not publish it.");
  });

/**
 * Dollars per million tokens, which is how a price list is written.
 *
 * Four decimals, because two rounds $0.025 and $0.03 to the same string and
 * a diff nobody can see is a diff nobody can check.
 */
function perMillion(perToken: number | undefined): string {
  if (perToken === undefined) return "—";
  const dollars = perToken * 1_000_000;
  const decimals = Number.isInteger(dollars * 100) ? 2 : 4;
  return `$${dollars.toFixed(decimals)}`;
}

const pluginCommand = program.command("plugin").description("What is mounted, and what is not");

pluginCommand
  .command("list")
  .description("The plugins this install mounts, and what they assembled into")
  .action(async () => {
    const config = loadConfig(home);
    const profile = selected(config);
    const specs = pluginList(config, profile);
    const source = profile.plugins.length > 0 ? ".amy/config.yaml" : "what this workflow needs";

    console.log(`${specs.length} plugin(s) to mount, from ${source}:\n`);

    const loaded = await load(specs);
    for (const spec of specs) {
      const found = loaded.plugins.find((plugin) => plugin.name === spec);
      console.log(`  ${found ? "ok  " : "FAIL"} ${spec}${found ? `  ${found.version}` : ""}`);
    }
    for (const problem of loaded.problems) console.log(`  ${problem}`);

    // Installed and mounted are different questions, and the answer to the
    // second is useless without the first: a plugin on disk that no config
    // names does nothing, and a config naming one that is not there is a
    // boot refusal waiting to happen.
    const present = installedPlugins();
    const idle = present.filter((name) => !specs.includes(name));
    console.log(`\n${present.length} installed, ${specs.length} mounted`);
    if (idle.length > 0) console.log(`installed but not mounted: ${idle.join(", ")}`);

    const outcome = await assemble(profile);
    if (!outcome.ok) {
      console.log("\nassembled: no");
      for (const problem of outcome.problems) console.log(`  ${problem}`);
      process.exitCode = 1;
      return;
    }

    const { mounted } = outcome;
    console.log(
      `\nassembled: ${mounted.ports.size} port(s), ${mounted.actions.size} action(s), ` +
        `${mounted.observers.size} observation(s), ` +
        `${[...mounted.contributions.values()].reduce((n, c) => n + c.size, 0)} contribution(s)`,
    );
    console.log(`workflow: ${mounted.workflow?.name ?? "none"}`);
  });

pluginCommand
  .command("add")
  .description("Mount a plugin, by package name or path")
  .argument("<spec>", "anything Node can import: a package name, or a path")
  .action((spec: string) => {
    const config = loadConfig(home);
    const profile = selected(config);
    const specs = pluginList(config, profile);

    if (specs.includes(spec)) {
      console.log(`${spec} is already mounted by ${profile.name}`);
      return;
    }

    writeProfilePlugins(home, profile.name, [...specs, spec], config);
    console.log(`added ${spec} to ${profile.name}`);
    console.log("Install it if it is not resolvable yet, then run `amy plugin list`.");
  });

pluginCommand
  .command("remove")
  .description("Stop mounting a plugin")
  .argument("<spec>", "the package name or path to drop")
  .action((spec: string) => {
    const config = loadConfig(home);
    const profile = selected(config);
    const specs = pluginList(config, profile);

    if (!specs.includes(spec)) {
      console.log(`${spec} is not mounted by ${profile.name}`);
      return;
    }

    writeProfilePlugins(home, profile.name, specs.filter((name) => name !== spec), config);
    console.log(`removed ${spec} from ${profile.name}`);
    console.log("Run `amy doctor`: the workflow may now name an action nothing can run.");
  });

program
  .command("skills")
  .description("Install amy's skills into the harnesses on this machine")
  .option("--all", "every harness found, without asking")
  .option("--harness <name>", "one harness by name, without asking")
  .option("--dir <path>", "a directory, for a harness this does not know")
  .action((options: { all?: boolean; harness?: string; dir?: string }) => {
    const skills = shipped();
    const found = installedHarnesses();

    if (options.dir) {
      wrote(install(options.dir, skills), options.dir);
      return;
    }

    if (found.length === 0) {
      console.error("no harness found. Pass --dir to write them somewhere anyway.");
      process.exitCode = 1;
      return;
    }

    const chosen = options.all
      ? found
      : options.harness
        ? found.filter((harness) => harness.name === options.harness)
        : ask(found);

    if (chosen.length === 0) {
      console.error(`no such harness here. Found: ${found.map((h) => h.name).join(", ")}`);
      process.exitCode = 1;
      return;
    }

    for (const harness of chosen) wrote(install(harness.skills, skills), harness.name);
    console.log(`\n${skills.length} skill(s): ${skills.map(([name]) => `/${name}`).join(", ")}`);

    function wrote(files: string[], where: string): void {
      console.log(`${where}: ${files.length} skill(s)`);
      for (const file of files) console.log(`  ${file}`);
    }
  });

/**
 * Which harnesses to write to.
 *
 * There is deliberately no silent default when something can be asked: these
 * are amy's skills, and writing them into a harness somebody did not name is
 * a decision nobody made. With nothing to ask on — a script, CI, a pipe —
 * every harness found is the useful answer, and it says so.
 */
function ask(found: readonly HarnessTarget[]): HarnessTarget[] {
  if (!process.stdin.isTTY) {
    console.log("nothing to ask on, so: every harness found.");
    return [...found];
  }

  console.log("Which harnesses?\n");
  found.forEach((harness, index) => console.log(`  ${index + 1}  ${harness.name.padEnd(8)} ${harness.skills}`));
  console.log(`  a  all of them\n`);

  const answer = (readAnswer("[a] ") || "a").toLowerCase();
  if (answer === "a") return [...found];

  return answer
    .split(/[\s,]+/)
    .map((token) => found[Number(token) - 1])
    .filter((harness): harness is HarnessTarget => Boolean(harness));
}

/** One line from the terminal, synchronously, because this is a prompt. */
function readAnswer(prompt: string): string {
  process.stdout.write(prompt);
  const buffer = Buffer.alloc(1024);
  try {
    const read = fs.readSync(0, buffer, 0, buffer.length, null);
    return buffer.toString("utf-8", 0, read).trim();
  } catch {
    return "";
  }
}

const workflowCommand = program
  .command("workflow")
  .description("What this install can drive, and what it keeps");

workflowCommand
  .command("list", { isDefault: true })
  .description("Every workflow this install can drive")
  .action(async () => {
    const config = loadConfig(home);
    const known = profiles(config);
    const asked = resolveProfile(config, undefined);
    const present = installedPlugins();
    const live = running(paths(home).pid);

    for (const profile of Object.values(known)) {
      const place = profilePaths(home, profile.name);
      const held = fs.existsSync(place.records) ? fs.readdirSync(place.records).length : 0;
      const marks = [
        asked.ok && asked.profile.name === profile.name ? "default" : "",
        live?.workflow === profile.name ? "running" : "",
        present.includes(profile.workflow) ? "" : "not installed",
      ].filter(Boolean);

      console.log(
        `${profile.name.padEnd(18)} ${profile.workflow.padEnd(32)} ` +
          `${String(held).padStart(3)} record(s)  ${marks.join(", ")}`,
      );
    }
  });

workflowCommand
  .command("rm")
  .description("Delete a workflow's records, its queue and its entry in the config")
  .argument("<name>", "the profile to forget")
  .option("--yes", "actually delete, rather than saying what would go")
  .action((name: string, options: { yes?: boolean }) => {
    const config = loadConfig(home);
    const resolution = resolveProfile(config, name);
    if (!resolution.ok) {
      console.error(resolution.problem);
      process.exitCode = 1;
      return;
    }

    const live = running(paths(home).pid);
    if (live?.workflow === name) {
      console.error(`${name} is running as pid ${live.pid}. Run \`amy stop\` first.`);
      process.exitCode = 1;
      return;
    }

    const place = profilePaths(home, name);
    const going = [place.records, place.queue].filter((directory) => fs.existsSync(directory));

    for (const directory of going) {
      const held = fs.readdirSync(directory).length;
      console.log(`${options.yes ? "deleting" : "would delete"} ${directory} (${held} file(s))`);
    }
    console.log(`${options.yes ? "dropping" : "would drop"} \`${name}\` from the config`);

    // The log is not on that list and will not be. It is append-only because
    // the budget is measured off it, so deleting what a workflow spent would
    // move a ceiling rather than tidy a directory.
    console.log(`The log keeps what ${name} did: nothing here touches it.`);

    if (!options.yes) {
      console.log("\nNothing was deleted. Add --yes to do it.");
      return;
    }

    for (const directory of going) fs.rmSync(directory, { recursive: true, force: true });
    fs.rmSync(path.join(home, name), { recursive: true, force: true });
    removeProfile(home, name, config);
    console.log(`\nforgot ${name}`);
  });

const queueCommand = program.command("queue").description("Inspect and tidy the queue");

queueCommand
  .command("prune")
  .description("Delete finished queue items past their retention")
  .option("--days <n>", "override the configured retention")
  .action((options: { days?: string }) => {
    const config = loadConfig(home);
    const days = options.days ? Number(options.days) : config.retentionDays;
    const removed = new FileQueue(profilePaths(home, selected().name).queue).prune(days, new Date());
    console.log(`removed ${removed} finished item(s) older than ${days} day(s)`);
  });

queueCommand
  .command("recover")
  .description("Return items abandoned by a dead worker")
  .action(() => {
    const config = loadConfig(home);
    const recovered = new FileQueue(profilePaths(home, selected().name).queue).recover(
      config.staleClaimMs,
      new Date(),
    );
    console.log(`returned ${recovered.length} abandoned item(s)`);
  });

const rosterCommand = program.command("roster").description("Who is reviewing today");

rosterCommand
  .command("confirm")
  .description("Stamp the roster with today's date")
  .action(() => {
    const roster = confirmRoster(home, new Date());
    console.log(`confirmed for ${roster.confirmedOn}`);
    for (const reviewer of roster.reviewers) {
      console.log(`  ${reviewer.available ? "in " : "out"} ${reviewer.host}`);
    }
    console.log(`  qa  ${roster.qa.available ? "in " : "out"} ${roster.qa.host}`);
  });

rosterCommand
  .command("show")
  .description("Print the roster and whether it is current")
  .action(() => {
    const roster = loadRoster(home);
    const current = isConfirmedFor(roster, new Date());
    console.log(`confirmed on ${roster.confirmedOn}${current ? " (current)" : " (stale)"}`);
    for (const reviewer of roster.reviewers) {
      console.log(`  ${reviewer.available ? "in " : "out"} ${reviewer.host}  ${reviewer.tracker}`);
    }
    console.log(`  qa  ${roster.qa.available ? "in " : "out"} ${roster.qa.host}  ${roster.qa.tracker}`);
  });

function report(result: TickResult): void {
  switch (result.kind) {
    case "idle":
      console.log("nothing due");
      break;
    case "stopped":
      console.log(`stopped: ${result.reason}`);
      break;
    case "worked": {
      const move = result.from === result.to ? result.from : `${result.from} -> ${result.to}`;
      const held = result.retryAfterMs ? ` (looking again in ${result.retryAfterMs / 1000}s)` : "";
      console.log(`${result.workId}  ${move}  ${result.why}${held}`);
      break;
    }
    case "parked":
      console.log(
        `${result.workId}  ${result.state}  parked: ${result.reason} ` +
          `(looking again in ${Math.round(result.retryAfterMs / 1000)}s)`,
      );
      break;
    case "failed":
      console.error(`${result.workId}  ${result.state}  failed: ${result.error}`);
      process.exitCode = 1;
      break;
  }
}

program.parseAsync(process.argv).catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
