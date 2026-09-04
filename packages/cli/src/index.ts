#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { Command } from "commander";
import { TickResult } from "@amy/plugin-serial-engine";
import { TicketRecord, isConfirmedFor } from "@amy/workflow-ticket-to-qa";
import { isWaiting } from "@amy/workflow-ticket-to-qa";
import {
  BUDGET_WINDOWS,
  Engine,
  FileStopSwitch,
  LogBudget,
  Mounted,
  NodeCommandRunner,
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
  OVERRIDE_PATH,
  refreshFrom,
  specTable,
} from "@amy/model-specs";
import { FileEventLog } from "@amy/plugin-file-log";
// Inspection builds these directly: `amy status` has to work even when a
// plugin will not mount, which is exactly when you want to look.
import { FileQueue } from "@amy/plugin-file-queue";
import { FileStore } from "@amy/plugin-file-store";
import {
  EXAMPLE_CONFIG,
  EXAMPLE_ROSTER,
  confirmRoster,
  loadConfig,
  loadRoster,
  writePluginList,
} from "./config.js";
import { loadEnv } from "./env.js";
import { diagnose } from "./doctor.js";
import { DEFAULT_PLUGINS, load } from "./loader.js";
import { hostPlugin } from "./hostPlugin.js";
import { installedStamp } from "./stamp.js";
import { hostPaths, pluginList, pluginSlices } from "./slices.js";
import { paths } from "./paths.js";

const root = process.cwd();
const runner = new NodeCommandRunner();
// Read once, at the top, and handed to every log this process opens. A
// release that logged `dev` would be a stamp that cannot be joined to
// anything, which is the only thing it is for.
const stamp = installedStamp();
const build = stampId(stamp);
const stopSwitch = new FileStopSwitch(paths(root).stop);

// Before anything reads process.env, so a key kept in .env is picked up.
loadEnv(root);

/**
 * Loads the plugins the config asks for and assembles them.
 *
 * Every refusal happens here, by name, before a ticket is touched: a plugin
 * that will not import, a setting that is not one it has, two plugins
 * claiming the same port, an action the workflow emits that nothing can run.
 */
async function assemble(): Promise<
  { ok: true; engine: Engine; mounted: Mounted } | { ok: false; problems: string[] }
> {
  const config = loadConfig(root);
  const place = paths(root);
  const specs = pluginList(config, DEFAULT_PLUGINS);

  const loaded = await load(specs);
  if (loaded.problems.length > 0) return { ok: false, problems: loaded.problems };

  const outcome = await mount(
    [...loaded.plugins, hostPlugin(() => loadRoster(root))],
    pluginSlices(config),
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

/** Assembles, or prints why it could not and stops. */
async function engineOrExit(): Promise<Engine> {
  const outcome = await assemble();
  if (outcome.ok) return outcome.engine;

  console.error("amy could not start:");
  for (const problem of outcome.problems) console.error(`  ${problem}`);
  process.exitCode = 1;
  process.exit(1);
}

const program = new Command();

program
  .name("amy")
  .description(
    "Drives a work ticket from in-progress to QA handoff, one deterministic move at a time.",
  )
  .version(describeBuild(stamp));

program
  .command("init")
  .description("Write the config and roster templates")
  .action(() => {
    const place = paths(root);
    fs.mkdirSync(place.tickets, { recursive: true });
    fs.mkdirSync(place.queue, { recursive: true });

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
  });

program
  .command("doctor")
  .description("Check everything the machine depends on before it touches a ticket")
  .action(async () => {
    const checks = await diagnose({
      root,
      config: loadConfig(root),
      runner,
      env: process.env,
      now: new Date(),
      readRoster: loadRoster,
    });

    for (const check of checks) {
      const detail = check.detail ? `  ${check.detail}` : "";
      console.log(`${check.ok ? "ok  " : "FAIL"} ${check.label}${detail}`);
    }

    // Asked last, because a mount problem is usually a consequence of one of
    // the checks above rather than a separate fault.
    const assembled = await assemble();
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
  .command("stop")
  .description("Pull the handbrake: end work in flight and start nothing new")
  .argument("[reason]", "why, so the log says something useful later")
  .action((reason: string | undefined) => {
    const why = reason ?? "stopped by hand";
    stopSwitch.request(why);
    new FileEventLog(paths(root).log, undefined, build).append({
      at: new Date().toISOString(),
      kind: "stop.requested",
      detail: { reason: why },
    });
    console.log(`stopped: ${why}`);
    console.log("A run in flight kills its children. `amy start` releases it.");
  });

program
  .command("start")
  .description("Release the handbrake")
  .action(() => {
    if (!stopSwitch.isRequested()) {
      console.log("not stopped");
      return;
    }
    stopSwitch.clear();
    console.log("released, the queue picks up where it left off");
  });

program
  .command("discover")
  .description("Put every ticket in the working status onto the queue")
  .action(async () => {
    const queued = await (await engineOrExit()).discover();
    console.log(queued.length ? `queued ${queued.join(", ")}` : "nothing new to queue");
  });

program
  .command("tick")
  .description("Advance one ticket by one move")
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
  .command("status")
  .description("Show where every ticket stands and what the queue holds")
  .action(() => {
    const place = paths(root);
    const records = new FileStore<TicketRecord>(place.tickets).all();
    const queue = new FileQueue(place.queue);
    const now = new Date();

    if (records.length === 0) console.log("no tickets tracked yet");

    for (const record of records.sort((a: TicketRecord, b: TicketRecord) => a.id.localeCompare(b.id))) {
      const held = isWaiting(record.state) ? "waiting" : "active";
      const pr = record.pullRequestNumber ? `#${record.pullRequestNumber}` : "";
      console.log(
        `${record.id.padEnd(12)} ${record.state.padEnd(18)} ${held.padEnd(8)} ${pr}`,
      );
    }

    console.log(
      `\nqueue: ${queue.ready(now).length} due, ${queue.pending().length} pending, ` +
        `${queue.running().length} in flight, ${queue.completed().length} finished`,
    );

    if (fs.existsSync(place.needsInput)) {
      const waiting = fs.readdirSync(place.needsInput).filter((f) => f.endsWith(".md"));
      if (waiting.length) {
        console.log(`\n${waiting.length} question(s) waiting for you in ${place.needsInput}`);
      }
    }
  });

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

    const log = new FileEventLog(paths(root).log, undefined, build);
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

/** The `budget` setting, from the plugin slice the relay is given. */
function configuredBudget(): unknown {
  const slice = pluginSlices(loadConfig(root))["@amy/plugin-agent-relay"];
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
    const table = specTable(root);

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

    const report = refreshFrom((await response.json()) as ModelsDevCatalog, specTable(root));

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

    const file = path.join(root, OVERRIDE_PATH);
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
    const config = loadConfig(root);
    const specs = pluginList(config, DEFAULT_PLUGINS);
    const source = config.pluginList.length > 0 ? ".amy/config.yaml" : "the built-in set";

    console.log(`${specs.length} plugin(s), from ${source}:\n`);

    const loaded = await load(specs);
    for (const spec of specs) {
      const found = loaded.plugins.find((plugin) => plugin.name === spec);
      console.log(`  ${found ? "ok  " : "FAIL"} ${spec}${found ? `  ${found.version}` : ""}`);
    }
    for (const problem of loaded.problems) console.log(`  ${problem}`);

    const outcome = await assemble();
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
    const config = loadConfig(root);
    const specs = config.pluginList.length > 0 ? config.pluginList : [...DEFAULT_PLUGINS];

    if (specs.includes(spec)) {
      console.log(`${spec} is already mounted`);
      return;
    }

    writePluginList(root, [...specs, spec]);
    console.log(`added ${spec}`);
    console.log("Install it if it is not resolvable yet, then run `amy plugin list`.");
  });

pluginCommand
  .command("remove")
  .description("Stop mounting a plugin")
  .argument("<spec>", "the package name or path to drop")
  .action((spec: string) => {
    const config = loadConfig(root);
    const specs = config.pluginList.length > 0 ? config.pluginList : [...DEFAULT_PLUGINS];

    if (!specs.includes(spec)) {
      console.log(`${spec} is not mounted`);
      return;
    }

    writePluginList(root, specs.filter((name) => name !== spec));
    console.log(`removed ${spec}`);
    console.log("Run `amy doctor`: the workflow may now name an action nothing can run.");
  });

const queueCommand = program.command("queue").description("Inspect and tidy the queue");

queueCommand
  .command("prune")
  .description("Delete finished queue items past their retention")
  .option("--days <n>", "override the configured retention")
  .action((options: { days?: string }) => {
    const config = loadConfig(root);
    const days = options.days ? Number(options.days) : config.retentionDays;
    const removed = new FileQueue(paths(root).queue).prune(days, new Date());
    console.log(`removed ${removed} finished item(s) older than ${days} day(s)`);
  });

queueCommand
  .command("recover")
  .description("Return items abandoned by a dead worker")
  .action(() => {
    const config = loadConfig(root);
    const recovered = new FileQueue(paths(root).queue).recover(config.staleClaimMs, new Date());
    console.log(`returned ${recovered.length} abandoned item(s)`);
  });

const rosterCommand = program.command("roster").description("Who is reviewing today");

rosterCommand
  .command("confirm")
  .description("Stamp the roster with today's date")
  .action(() => {
    const roster = confirmRoster(root, new Date());
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
    const roster = loadRoster(root);
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
