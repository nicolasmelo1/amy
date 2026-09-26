#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { spawn, spawnSync } from "node:child_process";
import { Command } from "commander";
// Type-only: the CLI reports what a tick returned and mounts no engine itself.
import type { TickResult } from "@amykit/plugin-serial-engine";
import { FileNotes } from "@amykit/plugin-file-notes";
import { FileTasks } from "@amykit/plugin-file-tasks";
import {
  BUDGET_WINDOWS,
  BriefStore,
  CommandRunner,
  Engine,
  FileStopSwitch,
  Mounted,
  NodeCommandRunner,
  WorkRecord,
  Worktree,
  describeBuild,
  mount,
  parseBudget,
  renderBrief,
  stampId,
  unmetNeeds,
} from "@amykit/core";
import {
  MODELS_DEV_URL,
  ModelsDevCatalog,
  OVERRIDE_FILE,
  refreshFrom,
  specTable,
} from "@amykit/model-specs";
import { FileEventLog } from "@amykit/plugin-file-log";
import { WorktreeManager } from "@amykit/plugin-file-worktree";
// Inspection builds these directly: `amy status` has to work even when a
// plugin will not mount, which is exactly when you want to look.
import { FileQueue } from "@amykit/plugin-file-queue";
import { FileStore } from "@amykit/plugin-file-store";
import { recordsToShow, standing } from "./status-view.js";
import {
  AmyConfig,
  EXAMPLE_CONFIG,
  EXAMPLE_ROSTER,
  configuredAutoUpdateProblems,
  confirmRoster,
  loadConfig,
  loadRoster,
  removeExtraPlugin,
  removeProfile,
  writeExtraPlugins,
  writeProfilePlugins,
  writeWorkflowProfile,
} from "./config.js";
import { budgetLines } from "./budget.js";
import { loadEnv } from "./env.js";
import { diagnose } from "./doctor.js";
import { LoadResult, NOT_INSTALLED, installedPlugins, load, pluginsRootResolver } from "./loader.js";
import { describePoke, poke } from "./poke.js";
import { Profile, profiles, resolveProfile } from "./profiles.js";
import { hostPlugin } from "./hostPlugin.js";
import { installedStamp } from "./stamp.js";
import { hostPaths, pluginList, pluginSlices } from "./slices.js";
import { ensurePluginsRoot, installIntoPluginsRoot, shellCommand } from "./install.js";
import {
  BootCheck,
  Picked,
  importPluginBySpec,
  installedPackageNames,
  nameInstalledPackage,
  uninstallFromPluginsRoot,
  unmetAction,
  whatBoots,
  whatMountingSays,
  whatPackageIs,
  withoutSpec,
  workflowProfileConflict,
  workflowProfileName,
} from "./add.js";
import { claimDaemonBoundary, claimExitedDaemon, clearDaemon, readDaemon, running, writeDaemon } from "./daemon.js";
import { Harness as HarnessTarget, harnesses, install, installedHarnesses } from "./harnesses.js";
import { shipped } from "./skills.js";
import { amyHome } from "./home.js";
import { paths, profilePaths } from "./paths.js";
import { packageEntrySpecifier } from "./spec.js";
import { Carrier, carriedBy, configWithout, stillMounted } from "./remove.js";
import { checkWorkflow, localWorkflow, workflowsDirectory, writeWorkflow } from "./workflow.js";
import { Held, held, isRange, line, move, restore, roots } from "./update.js";
import { beginAutoUpdateInvocation, finishDaemonUpdate, hasDaemonUpdate, markDaemonUpdate, runWithAutoUpdate, takeDaemonUpdate } from "./auto-update.js";
import { recordWrite, writeSkills } from "./skills-record.js";

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
 * Every load resolves the same way, or a workflow of your own exists only for
 * the command that mounts it.
 *
 * One resolver for every command, built once from the state directory: the
 * local workflow directory wins, the plugin root answers a package name, and
 * a spec that is already a file or URL passes through. A resolver passed at
 * one call site and not the others is what made `plugin list` report a
 * directory `amy workflow new` had just written as `FAIL`.
 */
function loadMountable(specs: readonly string[]): Promise<LoadResult> {
  return load(specs, pluginsRootResolver(home, paths(home).plugins), paths(home).plugins);
}

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

  const loaded = await loadMountable(specs);
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

/** Runs this executable's update command and returns its exact exit status. */
function scheduledUpdate(): Promise<number> {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [process.argv[1]!, "update"], {
      stdio: "inherit",
      env: process.env,
    });
    child.once("error", (error) => {
      console.error(`could not start amy update: ${error.message}`);
      resolve(1);
    });
    child.once("exit", (code) => resolve(code ?? 1));
  });
}

/** Applies the persisted schedule around one foreground workflow invocation. */
async function aroundWorkflow(profile: Profile, work: () => Promise<void>): Promise<void> {
  const config = loadConfig(home);
  const problems = configuredAutoUpdateProblems(config);
  if (problems.length > 0) throw new Error(problems.join("; "));
  await runWithAutoUpdate({ home, profile: profile.name, config, update: scheduledUpdate, work });
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
  const config = loadConfig(home);
  const scheduleProblems = configuredAutoUpdateProblems(config);
  if (scheduleProblems.length > 0) {
    console.error("amy could not start:");
    for (const problem of scheduleProblems) console.error(`  ${problem}`);
    process.exitCode = 1;
    process.exit(1);
  }

  const outcome = await assemble(selected(config));
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
  const found = installedPlugins(paths(home).plugins);
  return found.length > 0 ? found.join(", ") : "nothing that looks like a plugin";
}

const program = new Command();

program
  .name("amy")
  .description(
    "A state machine you leave running. Everything in it is a plugin, and the workflow is yours.",
  )
  .option("--workflow <name>", "which workflow to drive, by the name the config gives it")
  .version(describeBuild(stamp));

program
  .command("init")
  .description("Write the config and roster templates, and install what they need")
  .option("--install", "install the missing packages without asking")
  .option("--no-install", "only print what is missing")
  .action(async (options: { install?: boolean }) => {
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

    // Nothing but the command itself is installed with it, so what a
    // configured workflow needs is worked out here rather than carried by
    // the CLI: a machine with no use for a plugin has no reason to hold one.
    //
    // What each profile *will mount*, not what is recommended for it: a
    // config naming a plugin nobody here shipped is exactly the case worth
    // installing, and the recommendation cannot know about it. A config with
    // no workflow declares nothing, installs nothing, and says which is
    // which — a bare machine is the machine being set up, not one being
    // rebuilt.
    const config = loadConfig(home);
    const wanted = Object.values(profiles(config)).flatMap((profile) =>
      pluginList(config, profile),
    );
    const absent = [...new Set(wanted)].filter((name) => !localWorkflow(home, name) && !installedPlugins(place.plugins).includes(name));
    if (absent.length === 0) {
      if (wanted.length === 0) {
        console.log("\nkept the plugins it did not need: nothing is mounted yet.");
        console.log("Name a workflow and `amy init` installs only what it asks for.");
      }
      return;
    }

    await supply(absent, options.install);
  });

/**
 * Installs what the config asks for and this machine has not got.
 *
 * Asked rather than assumed, because installing packages is a change to amy's
 * own state directory and consent is how it is given. With nothing to ask on —
 * a script, a pipe, CI — it prints the command instead of running it: a setup
 * step that silently installed twenty packages in somebody's pipeline would be
 * a surprise nobody consented to, and `--install` is how a pipeline consents.
 *
 * Into `<home>/plugins`, amy's own npm root, rather than a global prefix: the
 * packages are amy's, resolved through the root the loader reads, and nothing
 * outside `.amy` changes when one is added.
 */
async function supply(absent: readonly string[], chosen?: boolean): Promise<void> {
  console.log(`\nThese are not installed yet:`);
  for (const name of absent) console.log(`  ${name}`);

  const wanted = chosen ?? (process.stdin.isTTY ? confirm() : false);

  if (!wanted) {
    console.log(`\nInstall them with:\n  ${shellCommand("npm", ["install", "--prefix", paths(home).plugins, "--", ...absent])}`);
    return;
  }

  ensurePluginsRoot(paths(home).plugins);
  console.log(`\nInstalling ${absent.length} package(s) into ${paths(home).plugins}…`);
  const outcome = await installIntoPluginsRoot(runner, paths(home).plugins, absent);

  if (!outcome.ok) {
    console.error(`\n${outcome.command} failed:`);
    console.error(outcome.output || "it said nothing");
    console.error("\nInstall them by hand, then run `amy doctor`.");
    process.exitCode = 1;
    return;
  }

  const still = absent.filter((name) => !installedPlugins(paths(home).plugins).includes(name));
  if (still.length > 0) {
    // npm exited zero and the packages are not in the root it was handed,
    // which means the root npm wrote is not the one this command reads.
    // Saying so beats a green install followed by a mount that refuses by
    // name.
    console.error(`\nnpm succeeded, but these still do not resolve: ${still.join(", ")}`);
    console.error(`Check what is in ${paths(home).plugins} against the root npm wrote.`);
    process.exitCode = 1;
    return;
  }

  console.log(`installed ${absent.length} package(s). Now run \`amy doctor\`.`);
}

function confirm(): boolean {
  const answer = readAnswer("\nInstall them now? [Y/n] ").toLowerCase();
  return answer === "" || answer === "y" || answer === "yes";
}

program
  .command("doctor")
  .description("Check everything the machine depends on before it touches a ticket")
  .action(async () => {
    const config = loadConfig(home);

    // A machine that has not named a workflow yet is the machine doctor is
    // for: it reports everything else it can see, then names the one thing
    // that is missing in the words the operator can act on — rather than
    // exiting at the selection step with nothing reported.
    const resolution = resolveProfile(config, program.opts<{ workflow?: string }>().workflow);
    if (!resolution.ok) {
      await doctorReport(
        config,
        { name: "", workflow: "", plugins: [], takesNotes: false, takesTasks: false },
        resolution.problem,
      );
      process.exitCode = 1;
      return;
    }

    await doctorReport(config, resolution.profile);
  });

/**
 * Runs the checks for one profile, then the mount itself, and says what to
 * fix.
 *
 * The empty-profile call is how a bare install is diagnosed: everything that
 * does not depend on a workflow is still checked, and the missing workflow is
 * reported in the selection's own words instead of ending the command before
 * anything was said.
 *
 * It assembles only once so checks and the final report describe one machine.
 */
async function doctorReport(config: AmyConfig, profile: Profile, problem?: string): Promise<void> {
  const assembled = problem
    ? { ok: false as const, problems: [problem] }
    : await assemble(profile);
  const mounted = assembled.ok ? assembled.mounted : undefined;
  const loaded = problem
    ? { plugins: [], problems: [] }
    : await loadMountable(pluginList(config, profile));

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
    workflow: mounted?.workflow,
    // Mounted, then asked: whether a notification target is reachable is
    // the channel's own knowledge, and a mount that did not happen is its
    // own answer to report.
    notifyPort: mounted?.ports.get("notify"),
  });

  for (const check of checks) {
    const detail = check.detail ? `  ${check.detail}` : "";
    console.log(`${check.ok ? "ok  " : "FAIL"} ${check.label}${detail}`);
  }

  if (problem) {
    console.log(`FAIL ${problem}`);
  }

  // Asked last, because a mount problem is usually a consequence of one of
  // the checks above rather than a separate fault.
  if (!assembled.ok) {
    for (const p of assembled.problems) console.log(`FAIL ${p}`);
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
}

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

/** Waits until the daemon is gone, so an after update never sees a live loop. */
async function waitForDaemonExit(pid: number): Promise<void> {
  for (let attempt = 0; attempt < 200; attempt += 1) {
    try {
      process.kill(pid, 0);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ESRCH") return;
      throw error;
    }
    await sleep(50);
  }
  throw new Error(`daemon ${pid} did not exit after SIGTERM`);
}

program
  .command("start")
  .description("Start the loop in the background, and keep it running")
  .option("--every <seconds>", "how long to wait after finding nothing to do", "60")
  .action(async (options: { every: string }) => {
    const place = paths(home);
    const already = running(place.pid);
    if (already) {
      console.log(`already running: pid ${already.pid}, driving ${already.workflow}`);
      return;
    }

    const config = loadConfig(home);
    const problems = configuredAutoUpdateProblems(config);
    if (problems.length > 0) throw new Error(problems.join("; "));
    const profile = selected(config);
    // A detached reaper still owns the dead record and its after-timed
    // update. Starting another loop must not clear that record before the
    // reaper can claim it, or silently lose the scheduled maintenance.
    if (hasDaemonUpdate(home, profile.name)) {
      throw new Error("the previous daemon is settling its scheduled update; try start again when it finishes");
    }
    const schedule = beginAutoUpdateInvocation(home, profile.name, config);
    if (schedule.due && schedule.timing === "before" && await scheduledUpdate() !== 0) {
      throw new Error("amy update failed");
    }

    // The claim spans only the moment the loop becomes visible: an update
    // refused to move packages while a child was between its spawn and its
    // pid record. A due before-update runs unclaimed above, because it is
    // an `amy update` itself and owns the boundary inside its own process.
    const release = claimDaemonBoundary(place.pid);
    if (!release) {
      console.error("the loop is starting or amy update is running; try again when it finishes");
      process.exitCode = 1;
      return;
    }
    try {
      const current = running(place.pid);
      if (current) {
        console.log(`already running: pid ${current.pid}, driving ${current.workflow}`);
        return;
      }

      // Detached, with its output on a file rather than this terminal: the
      // point of starting it is that it outlives the session that started it.
      const out = fs.openSync(path.join(place.base, "daemon.log"), "a");
      const child = spawn(
        process.execPath,
        [process.argv[1]!, "--workflow", profile.name, "daemon", "--scheduled", "--every", options.every],
        { detached: true, stdio: ["ignore", out, out], env: process.env },
      );
      child.unref();
      writeDaemon(place.pid, {
        pid: child.pid ?? 0,
        workflow: profile.name,
        startedAt: new Date().toISOString(),
      });

      if (schedule.due && schedule.timing === "after") {
        markDaemonUpdate(home, profile.name);
        const reaper = spawn(
          process.execPath,
          [process.argv[1]!, "after-daemon", String(child.pid), profile.name],
          { detached: true, stdio: ["ignore", out, out], env: process.env },
        );
        reaper.unref();
      }

      console.log(`started ${profile.name}: pid ${child.pid}`);
      console.log(`Watch it: tail -f ${path.join(place.base, "daemon.log")}`);
    } finally {
      release();
    }
  });

program
  .command("stop")
  .description("Stop the background loop")
  .action(async () => {
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
    await waitForDaemonExit(record.pid);
    stopSwitch.clear();
    // The detached reaper owns an after-timed update, including a crash or
    // direct signal. Do not race it by consuming the marker here.
    if (!hasDaemonUpdate(home, record.workflow)) clearDaemon(place.pid);
    console.log(`stopped ${record.workflow}: pid ${record.pid}`);
  });

program
  .command("after-daemon")
  .description("Internal: update after a started daemon has exited")
  .argument("<pid>")
  .argument("<workflow>")
  .action(async (pidText: string, workflow: string) => {
    const pid = Number(pidText);
    if (!Number.isSafeInteger(pid) || pid <= 0) throw new Error(`invalid daemon pid ${pidText}`);
    await waitForDaemonExit(pid);
    if (!claimExitedDaemon(paths(home).pid, pid)) return;
    if (!takeDaemonUpdate(home, workflow)) return;
    try {
      if (await scheduledUpdate() !== 0) process.exitCode = 1;
    } finally {
      finishDaemonUpdate(home, workflow);
    }
  });

program
  .command("daemon")
  .description("The loop itself, in the foreground. `amy start` runs this for you")
  .option("--every <seconds>", "how long to wait after finding nothing to do", "60")
  .option("--scheduled", "internal: the parent start command already scheduled this lifecycle")
  .action(async (options: { every: string; scheduled?: boolean }) => {
    const profile = selected();
    const drive = async () => {
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
    };
    if (options.scheduled) await drive();
    else await visibleForegroundDaemon(profile, drive);
  });

/** Makes a directly invoked foreground daemon visible to concurrent update. */
async function visibleForegroundDaemon(profile: Profile, drive: () => Promise<void>): Promise<void> {
  const config = loadConfig(home);
  const problems = configuredAutoUpdateProblems(config);
  if (problems.length > 0) throw new Error(problems.join("; "));
  const schedule = beginAutoUpdateInvocation(home, profile.name, config);
  // A before update settles before this foreground process becomes the daemon;
  // an after update settles after its record is removed.
  if (schedule.due && schedule.timing === "before" && await scheduledUpdate() !== 0) {
    throw new Error("amy update failed");
  }
  const file = paths(home).pid;
  const release = claimDaemonBoundary(file);
  if (!release) throw new Error("the loop is starting or amy update is running; try again when it finishes");
  try {
    const live = running(file);
    if (live) throw new Error(`already running: pid ${live.pid}, driving ${live.workflow}`);
    writeDaemon(file, { pid: process.pid, workflow: profile.name, startedAt: new Date().toISOString() });
  } finally {
    release();
  }
  try {
    await drive();
  } finally {
    // Do not erase a record a later owner wrote after this process ended.
    if (readDaemon(file)?.pid === process.pid) clearDaemon(file);
  }
  if (schedule.due && schedule.timing === "after" && await scheduledUpdate() !== 0) {
    throw new Error("amy update failed");
  }
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

program
  .command("poke")
  .description("Look at one piece of work now, rather than when it was next due")
  .argument("<workId>", "the work to bring forward, such as a ticket key")
  .action((workId: string) => {
    const queue = new FileQueue(profilePaths(home, selected().name).queue);
    console.log(describePoke(workId, poke(queue, workId, new Date())));
  });

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
    const profile = selected();
    await aroundWorkflow(profile, async () => {
      report((await (await engineOrExit()).tick()) as TickResult);
    });
  });

program
  .command("run")
  .description("Keep advancing until nothing is due")
  .option("--max <n>", "stop after this many moves", "100")
  .action(async (options: { max: string }) => {
    const profile = selected();
    await aroundWorkflow(profile, async () => {
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
  .command("brief")
  .description("The current statement of a feature, as the workflow keeps it")
  .argument("<id>", "the brief id, as the workflow named it")
  .option("--json", "the same snapshot as data, for something else to render")
  .action(async (id: string, options: { json?: boolean }) => {
    const profile = selected();

    // Assembled, because the store is a mounted port rather than a path:
    // `amy brief show` resolves the adapter the same way a tick does, and a
    // caller never learns where the files live. A mount that will not come
    // up is exactly when somebody wants to look, so the refusal is reported
    // rather than thrown.
    const assembled = await assemble(profile);
    const store = assembled.ok ? (assembled.mounted.ports.get("brief") as BriefStore | undefined) : undefined;

    if (!store) {
      const why = assembled.ok
        ? "nothing mounted the `brief` port"
        : `amy could not start: ${assembled.problems.join("; ")}`;
      console.error(`there is no brief \`${id}\`: ${why}`);
      process.exitCode = 1;
      return;
    }

    // One snapshot, both renderings, the way `amy status` does: the person
    // and the machine read the same brief at the same revision, so they
    // cannot disagree about what it currently says.
    const record = await store.get(id);
    if (!record) {
      console.error(`there is no brief \`${id}\``);
      process.exitCode = 1;
      return;
    }
    const view = renderBrief(record);

    if (options.json) {
      console.log(JSON.stringify({ id: record.id, revision: view.revision, explains: record.explains, updatedAt: record.updatedAt, text: view.text }, null, 2));
      return;
    }

    console.log(`${record.id}, revision ${view.revision}, explaining ${record.explains.join(", ")}`);
    console.log();
    console.log(view.text);
  });

program
  .command("status")
  .description("Show where every piece of work stands and what the queue holds")
  .option("--json", "the same thing as data, for something else to render")
  .option("--all", "include work that has finished")
  .action(async (options: { json?: boolean; all?: boolean }) => {
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
    const terminal = workflow?.terminalStates;

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

    reportRecords(records, waiting, terminal, options.all ?? false);

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
          finished: terminal ? terminal.includes(record.state) : null,
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

    // Read once, over the longest window any ceiling could be set on, rather
    // than once per window: two reads of a growing file can disagree, and a
    // report whose windows disagree is worse than a slower one.
    const longest = Math.max(...BUDGET_WINDOWS.map((window) => window.ms));
    const events = log.read(new Date(now.getTime() - longest));

    for (const line of budgetLines(events, parsed.limits, now)) console.log(line);
  });

/**
 * Where an added package lands in the config, from what mounting it said.
 *
 * A workflow becomes a profile — the name read out of the package name, the
 * way `amy workflow new` names one — and a plugin joins the machine-wide
 * list. One edit each, so the write is a read of what came back rather than
 * a decision made beside it.
 */
async function writeAddedEntry(
  home: string,
  config: AmyConfig,
  picked: Picked,
  workflow: boolean,
): Promise<{ message: string; profile?: string }> {
  if (workflow) {
    const name = workflowProfileName(picked.imported);
    const conflict = workflowProfileConflict(config.workflows, picked.imported);
    if (conflict) throw new Error(conflict);
    writeWorkflowProfile(home, name, picked.imported, config);
    return { message: `added ${picked.imported} as the workflow \`${name}\``, profile: name };
  }

  writeExtraPlugins(home, [...config.extraPlugins, picked.imported]);
  return { message: `added ${picked.imported} to every profile` };
}

/**
 * One command for both kinds, because adding a workflow and adding a plugin
 * are the same act from the operator's side and only differ in what came
 * back. Which of the two it is, is asked of the machine — mounting the
 * package alone into a throwaway registry — rather than assumed from a name
 * convention or a manifest field.
 *
 * The order is the order of an undo: install, import, probe, write, boot. A
 * package that fails to mount is uninstalled again; a half-added workflow
 * that only shows up as a boot refusal three commands later is worse than a
 * command that failed.
 */
async function addCommand(home: string, spec: string): Promise<void> {
  const config = loadConfig(home);
  const place = paths(home);
  const runner = new NodeCommandRunner();

  // Before anything is run: a path that is not a package is refused here,
  // with its package.json named, rather than by npm's own refusal an
  // install later.
  const picked = whatPackageIs(spec, process.cwd(), place.plugins);

  // Already named is already mounted: a repeat of a name, a URL that
  // produced the same name, or a path the config already carries, is one
  // install and says so. Judged on the imported form, which is what the
  // config carries — the same package by two specs is still one. Judged
  // without a profile: `add` is what writes the first one, so a machine with
  // nothing configured is the machine this command is for.
  const declared = Object.values(config.workflows).map((entry) => entry.workflow);
  const importAlreadyNamed = [
    ...config.extraPlugins,
    ...declared,
  ].includes(picked.imported);

  if (importAlreadyNamed) {
    console.log(`${picked.imported} is already mounted`);
    return;
  }

  const outcome = await addInstalled(runner, home, config, picked, declared);
  if (outcome instanceof AddRefused) {
    console.error(outcome.why);
    process.exitCode = 1;
    return;
  }

  let added: { message: string; profile?: string };
  try {
    added = await writeAddedEntry(home, config, outcome.picked, outcome.workflow);
  } catch (error) {
    const why = error instanceof Error ? error.message : String(error);
    console.error(why);
    await rollback(runner, place.plugins, outcome.picked, outcome.before, why);
    process.exitCode = 1;
    return;
  }
  console.log(added.message);

  // The rest of the machine. A workflow's recommended set is derived at
  // every read, so a bare machine now names plugins it has never seen —
  // installed here, by the same command, the way `amy init --install`
  // installs what a config names. A plugin add installs nothing extra: it
  // joined a set that already boots.
  if (outcome.workflow) {
    const fresh = loadConfig(home);
    const resolution = resolveProfile(fresh, added.profile);
    if (!resolution.ok) throw new Error(resolution.problem);
    const wanted = pluginList(fresh, resolution.profile);
    const missing = wanted.filter((name) => !localWorkflow(home, name) && !pickedIsInstalled(place.plugins, name));
    if (missing.length > 0) {
      console.log(`\ninstalling what the workflow asks for: ${missing.join(", ")}`);
      const supplied = await installIntoPluginsRoot(runner, place.plugins, missing);
      if (!supplied.ok) {
        console.error(`${supplied.command} failed:`);
        console.error(supplied.output || "it said nothing");
        console.error("Install them by hand, then run `amy doctor`.");
        process.exitCode = 1;
        return;
      }
    }
  }

  // Confirm the resulting machine rather than assuming the config write did.
  const booted = await bootsAfterAdd(home, outcome.workflow, added.profile);
  if (!booted.ok) {
    console.error("amy does not boot with the entry written:");
    for (const problem of booted.problems) console.error(`  ${problem}`);
    console.error(`Fix the config, or run \`amy remove ${picked.imported}\`.`);
    process.exitCode = 1;
    return;
  }

  console.log("the machine boots: run `amy doctor`, then `amy tick`.");
}

/**
 * The refusals `add` answers before it writes: already the workflow this
 * profile drives, unable to import, and unable to mount.
 *
 * A class rather than a union member: every refusal but the first uninstalls
 * what the install put down, and a caller that forgets that distinction is
 * the half-added package this command exists to prevent.
 */
class AddRefused {
  constructor(readonly why: string) {}
}

/**
 * Install, import and probe one package, undoing the install when any of the
 * three fails.
 *
 * The probe answers what the package is; a package already carried as a
 * profile's workflow is refused here rather than after the write, so a
 * refusal never leaves an entry behind to uninstall.
 */
interface Added {
  picked: Picked;
  workflow: boolean;
  /** Complete root snapshot, so a refusal never removes an older package. */
  before: readonly string[];
}

/** Boots the profile the write just created; a bare plugin was already probed alone. */
async function bootsAfterAdd(home: string, workflow: boolean, name?: string) {
  const config = loadConfig(home);
  if (Object.keys(config.workflows).length === 0) return { ok: true as const, problems: [] };
  return whatBoots(async () => {
    const profile = workflow ? resolveProfile(config, name) : { ok: true as const, profile: selected(config) };
    if (!profile.ok) return { ok: false, problems: [profile.problem] };
    const assembled = await assemble(profile.profile);
    return assembled.ok
      ? { ok: true as const, problems: [], mounted: assembled.mounted }
      : { ok: false as const, problems: assembled.problems };
  });
}

async function addInstalled(
  runner: NodeCommandRunner,
  home: string,
  config: AmyConfig,
  picked: Picked,
  declared: readonly string[],
): Promise<AddRefused | Added> {
  const place = paths(home);
  const before = installedPackageNames(place.plugins);

  console.log(`installing ${picked.install} into ${place.plugins}…`);
  const install = await installIntoPluginsRoot(runner, place.plugins, [picked.install]);
  if (!install.ok) {
    console.error(`${install.command} failed:`);
    console.error(install.output || "it said nothing");
    return new AddRefused("the install failed");
  }

  let completed: Picked;
  try {
    completed =
      picked.kind === "git" || picked.kind === "tarball"
        ? { ...picked, imported: nameInstalledPackage(place.plugins, before) }
        : picked;
  } catch (error) {
    return rollback(
      runner,
      place.plugins,
      picked,
      before,
      error instanceof Error ? error.message : String(error),
    );
  }

  // The probe imports the package where it actually is: a path add imports
  // the directory's own entry, because the name it will carry is not in the
  // plugins root yet — the install below is what puts it there. Everything
  // else resolves through the root, the way the next boot will.
  const probeImport =
    completed.kind === "path" ? packageEntrySpecifier(completed.absolute!) : completed.imported;
  const loaded = await importPluginBySpec(
    probeImport,
    completed.kind === "path" ? (spec) => spec : pluginsRootResolver(home, place.plugins),
  );
  if (!loaded.ok) return rollback(runner, place.plugins, completed, before, loaded.problem);

  const probe = await whatMountingSays(loaded.plugin, place.plugins);
  if (!probe.ok) {
    return rollback(
      runner,
      place.plugins,
      completed,
      before,
      `${completed.imported} does not mount:\n${probe.problems.map((problem) => `  ${problem}`).join("\n")}`,
    );
  }

  const alreadyDrives = declared.includes(completed.imported);
  if (alreadyDrives) {
    return rollback(
      runner,
      place.plugins,
      completed,
      before,
      `${completed.imported} is the workflow a profile already drives`,
    );
  }

  return { picked: completed, workflow: probe.workflow, before };
}

/**
 * The packages this add introduced, preserving packages the root already had.
 *
 * `npm install` is allowed to succeed when the named package was already in
 * the private root. A later failed probe must leave that package alone: this
 * command did not introduce it, even though it was not yet named in config.
 */
export function packagesIntroducedSince(before: readonly string[], after: readonly string[]): string[] {
  return after.filter((name) => !before.includes(name));
}

/** Uninstalls only what this add introduced, then returns one refusal. */
async function rollback(
  runner: NodeCommandRunner,
  root: string,
  picked: Picked,
  before: readonly string[],
  why: string,
): Promise<AddRefused> {
  const introduced = packagesIntroducedSince(before, installedPackageNames(root));
  if (introduced.length === 0) return new AddRefused(why);

  const outcome = await uninstallFromPluginsRoot(runner, root, introduced);
  if (outcome.ok) console.log(`uninstalled ${picked.install} again`);
  else {
    console.error(`${outcome.command} failed:`);
    console.error(outcome.output || "it said nothing");
    console.error("Remove it by hand, or leave it unmounted.");
  }
  return new AddRefused(why);
}

/**
 * The machine the config would become with one package dropped from it, as
 * the tick would mount it.
 *
 * Every place the config could carry the name is emptied for the trial — the
 * profile that declares it, the selected profile's own list, the machine-wide
 * list and the slice the mount would hand it — and the remaining machine is
 * mounted for real. A trial that refuses means the removal refuses, with the
 * mount's own problems carried back out.
 */
async function mountingWithout(
  home: string,
  config: AmyConfig,
  profile: Profile,
  spec: string,
  carrier: Carrier,
): Promise<BootCheck> {
  const trialConfig = configWithout(config, profile, spec, carrier);

  // Extras mount under every profile. The trial is therefore all remaining
  // profiles, not merely the one selected by this invocation.
  for (const trialProfile of Object.values(profiles(trialConfig))) {
    const trialSlices = { ...pluginSlices(trialConfig, trialProfile) };
    delete trialSlices[spec];
    const loaded = await loadMountable(pluginList(trialConfig, trialProfile));
    if (loaded.problems.length > 0) return { ok: false, problems: loaded.problems };

    const outcome = await mount(
      [...loaded.plugins, hostPlugin(() => loadRoster(home))],
      trialSlices,
      {
        runner,
        now: () => new Date(),
        log: new FileEventLog(paths(home).log, undefined, build),
        paths: hostPaths(trialConfig, profilePaths(home, trialProfile.name).base),
      },
    );
    if (!outcome.ok) return { ok: false, problems: outcome.problems };
    if (!outcome.mounted.engine) {
      return { ok: false, problems: ["no plugin mounted an engine, so nothing can advance work"] };
    }
    if (!outcome.mounted.workflow) {
      return { ok: false, problems: ["no plugin mounted a workflow, so there is no order to follow"] };
    }
    const unmet = unmetNeeds(outcome.mounted, outcome.mounted.workflow);
    if (unmet.length > 0) return { ok: false, problems: unmet, mounted: outcome.mounted };
  }

  // Removing the sole workflow returns the machine to its bare, valid state.
  return { ok: true, problems: [] };
}

/**
 * `amy remove`, the same command in reverse: drop the entry, uninstall from
 * the root, and never touch records, queue or log.
 *
 * Refuses first, in the order the machine would hit the problems: a name the
 * config does not carry, a workflow that is running, and then the boot the
 * remaining machine would have to survive — with the action that would have
 * no port named, the refusal the mount writes, moved to the moment somebody
 * can still change their mind.
 */

/**
 * Refuses what would make the removal a bad idea, in the order a person
 * would want to hear them: a name the config never carried, and a workflow
 * that is running right now.
 */
function refuseRemoval(
  home: string,
  config: AmyConfig,
  profile: Profile,
  spec: string,
  carrier: Carrier,
): string | undefined {
  const carried =
    Object.values(config.workflows).some((entry) => entry.workflow === spec) ||
    Object.values(profiles(config)).some((candidate) => pluginList(config, candidate).includes(spec));

  if (!carried) return `the config does not name ${spec}`;

  const live = running(paths(home).pid);
  if (live && carrier.profile === live.workflow) {
    return `${carrier.profile} is running as pid ${live.pid}. Run \`amy stop\` first.`;
  }

  return undefined;
}

/**
 * Drops the entry the config carried the spec in, and says which.
 *
 * The config first, so an uninstall that fails leaves the machine able to
 * boot into the old shape rather than unable to boot at all — a config that
 * names what is not installed is a boot refusal, and that refusal has to be
 * recoverable by editing the config.
 */
function removeFromConfig(
  home: string,
  config: AmyConfig,
  profile: Profile,
  spec: string,
  carrier: Carrier,
): void {
  if (carrier.place === "extras") {
    removeExtraPlugin(home, spec);
    console.log(`removed ${spec} from the machine-wide list`);
    return;
  }

  // A carried workflow takes its whole profile with it: the profile exists
  // to name it, and a profile pointing at an uninstalled workflow is a boot
  // refusal waiting three commands ahead.
  if (carrier.place === "workflow" && carrier.profile) {
    removeProfile(home, carrier.profile, config);
    console.log(`removed the \`${carrier.profile}\` profile for ${spec}`);
    return;
  }

  const name = carrier.profile ?? profile.name;
  const target = profiles(config)[name] ?? profile;
  const own = target.plugins.length > 0
    ? target.plugins
    : pluginList(config, target).filter((name) => !config.extraPlugins.includes(name));
  const clearsBriefStore =
    (spec === "@amykit/plugin-file-brief-store" && !target.briefStore) || target.briefStore === spec;
  writeProfilePlugins(home, name, withoutSpec(own, spec), config, clearsBriefStore ? "" : target.briefStore);
  console.log(`removed ${spec} from ${name}`);
}

/**
 * Uninstalls the package the config stopped naming.
 *
 * Records, queue and log are never touched here — that sentence is the
 * command's last word, and everything above it kept it.
 */
async function uninstallRemoved(
  runner: NodeCommandRunner,
  root: string,
  spec: string,
): Promise<void> {
  if (!pickedIsInstalled(root, spec)) return;

  const outcome = await uninstallFromPluginsRoot(runner, root, [spec]);
  if (!outcome.ok) {
    console.error(`${outcome.command} failed:`);
    console.error(outcome.output || "it said nothing");
    console.error("Uninstall it by hand; the config no longer names it.");
    process.exitCode = 1;
    return;
  }
  console.log(`uninstalled ${spec}`);
}

async function removeCommand(home: string, spec: string): Promise<void> {
  const config = loadConfig(home);
  const runner = new NodeCommandRunner();
  // Machine-wide plugins may exist before the first workflow. They were
  // probed alone at add time, and removal must not require a profile merely
  // to reverse that durable config entry.
  if (Object.keys(config.workflows).length === 0) {
    if (!config.extraPlugins.includes(spec)) {
      console.error(`the config does not name ${spec}`);
      process.exitCode = 1;
      return;
    }
    removeExtraPlugin(home, spec);
    await uninstallRemoved(runner, paths(home).plugins, spec);
    console.log(`removed ${spec} from the machine-wide list`);
    return;
  }
  const profile = selected(config);
  const carrier = carriedBy(config, profile, spec);

  const refusal = refuseRemoval(home, config, profile, spec, carrier);
  if (refusal) {
    console.error(refusal);
    process.exitCode = 1;
    return;
  }

  const booted = await whatBoots(() => mountingWithout(home, config, profile, spec, carrier));

  if (!booted.ok) {
    // The action first when the mount still holds the workflow: it is the
    // machine's own refusal about its remaining order, and the port it names
    // is the thing the removal would have left unmounted.
    const lead = booted.mounted ? unmetAction(booted.mounted, booted.problems) : booted.problems[0];
    console.error(`removing ${spec} would leave the machine unable to boot — ${lead}:`);
    for (const problem of booted.problems) console.error(`  ${problem}`);
    process.exitCode = 1;
    return;
  }

  removeFromConfig(home, config, profile, spec, carrier);
  if (!stillMounted(loadConfig(home), spec)) await uninstallRemoved(runner, paths(home).plugins, spec);
  else console.log(`${spec} remains mounted by another profile`);

  console.log("records, queue and log are kept: nothing here touches them.");
}

/** Whether the package root holds this name, by its manifest. */
function pickedIsInstalled(root: string, name: string): boolean {
  const manifest = path.join(root, "node_modules", ...name.split("/"), "package.json");
  try {
    return JSON.parse(fs.readFileSync(manifest, "utf-8")) !== null;
  } catch {
    return false;
  }
}

/**
 * Every record the profile holds, in whatever shape its workflow gave them.
 *
 * The core's `WorkRecord` is all this reads, plus two fields a workflow may
 * or may not carry. That is the difference between a status command and a
 * status command per workflow.
 */
type AnyRecord = WorkRecord & { pullRequestNumber?: number; repo?: string };

function reportRecords(
  records: readonly AnyRecord[],
  waiting: readonly string[] | undefined,
  terminal: readonly string[] | undefined,
  all: boolean,
): void {
  const view = recordsToShow(records, terminal, all);

  if (records.length === 0) console.log("nothing tracked yet");
  else if (view.shown.length === 0) console.log("nothing open");

  for (const record of view.shown) {
    const held = standing(record.state, waiting, terminal);
    const pr = record.pullRequestNumber ? `#${record.pullRequestNumber}` : "";
    console.log(
      `${record.id.padEnd(28)} ${record.state.padEnd(18)} ${held.padEnd(8)} ` +
        `${(record.repo ?? "").padEnd(30)} ${pr}`.trimEnd(),
    );
  }

  if (view.finished) {
    console.log(`\n${view.finished} finished, not shown. \`amy status --all\` lists them.`);
  }
}

/** The `budget` setting, from the plugin slice the relay is given. */
function configuredBudget(): unknown {
  const config = loadConfig(home);
  const slice = pluginSlices(config, selected(config))["@amykit/plugin-agent-relay"];
  return slice && typeof slice === "object" ? (slice as Record<string, unknown>).budget : undefined;
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

program
  .command("add")
  .description("Add a workflow or a plugin: install it, mount it, and check the machine boots")
  .argument("<spec>", "a package name, a URL, a git URL, or a path")
  .action(async (spec: string) => {
    try {
      await addCommand(home, spec);
    } catch (error) {
      console.error(error instanceof Error ? error.message : String(error));
      process.exitCode = 1;
    }
  });

program
  .command("remove")
  .description("Remove a workflow or a plugin, refusing what the machine would not survive")
  .argument("<spec>", "the name the config carries")
  .action(async (spec: string) => {
    await removeCommand(home, spec);
  });

/**
 * `amy update`: move an install forward without leaving it half-moved.
 *
 * The two roots are read, every range in them is resolved again, and the
 * packages that would move are named. `--check` stops there. Otherwise each
 * one is installed, imported as a probe, and — when every configured profile
 * mounts at the new version — declared done. A version that will not import
 * or mount is rolled back to the version that did, which is knowable
 * because the old one was resolvable a second ago. The loop is refused
 * first: swapping a package under a running daemon is the one thing that
 * turns a deterministic machine into a flaky one.
 */
program
  .command("update")
  .description("Move this install forward: both roots, refusing to leave the machine half-updated")
  .option("--check", "name every package that would move, and to what, without moving anything")
  .argument("[package]", "one package to update, by the name the root's manifest carries")
  .action(async (pkg: string | undefined, options: { check?: boolean }) => {
    try {
      process.exitCode = await updateCommand(home, runner, pkg, options.check === true, {
        mountProfiles: assembleProfiles,
        skillsInto: rewriteSkillsInto,
      });
    } catch (error) {
      console.error(error instanceof Error ? error.message : String(error));
      process.exitCode = 1;
    }
  });

/** Claims package mutation before inspecting the daemon state. */
function updateBoundary(home: string): () => void {
  const release = claimDaemonBoundary(paths(home).pid);
  if (release) return release;
  throw new Error("the loop is starting or amy update is already running; try again when it finishes");
}

/** The update's command body, kept apart from its declaration so a test can drive it. */
export async function updateCommand(
  home: string,
  runner: CommandRunner,
  pkg: string | undefined,
  check: boolean,
  deps: {
    /** Whether every configured profile still boots, with the problems named. */
    mountProfiles: () => Promise<{ ok: true } | { ok: false; problems: string[] }>;
    /** Rewrites the skills into the harnesses they were written into before. */
    skillsInto: () => string[];
    /** Where the install root is; the running CLI's own answer by default. */
    installRoot?: string;
  },
): Promise<number> {
    const release = updateBoundary(home);
    try {
    const refused = refuseWhileRunning(home);
    if (refused !== undefined) return refused;

    const where = roots(home);
    const installRoot = deps.installRoot ?? where.install;
    const everything = await held(runner, home, installRoot);

    if (pkg !== undefined && !everything.some((held) => held.name === pkg)) {
      console.error(`no package named ${pkg} in either root`);
      return 1;
    }

    const moving = everything.filter((one) => (pkg === undefined || one.name === pkg) && one.want !== undefined && one.want !== one.have);

    reportWhatIsHeld(everything, installRoot);

    const unresolvedFailure = reportUnresolved(everything, pkg);
    if (unresolvedFailure !== undefined) return unresolvedFailure;

    if (check) return reportOnly(moving);
    if (moving.length === 0) return nothingMoved(deps);

    return moveEverything(runner, where.plugins, installRoot, moving, deps);
    } finally {
      release();
    }
}

/**
 * Moves every package and settles the machine the moves leave behind.
 *
 * The boot check runs after the moves: an update that leaves a config that
 * cannot boot has not worked, and everything that moved goes back. The
 * skills rewrite comes after the boot check for the same reason — a rollback
 * would otherwise leave skills describing a CLI the machine no longer runs,
 * the exact failure this plan exists to end. The rewrite is a postcondition
 * of a CLI move: a refusal fails the update and rolls the CLI move back.
 */
async function moveEverything(
    runner: CommandRunner,
    pluginsRoot: string,
    installRoot: string | undefined,
    moving: readonly Held[],
    deps: MountProfiles & SkillsInto,
): Promise<number> {
    const movedList = await moveEach(runner, pluginsRoot, installRoot, moving);
    if (movedList.failed > 0) {
      // A refusal partway through the list leaves the earlier moves in
      // place: a machine of mixed versions is not the "versions that boot
      // are still in place" the message promises, so everything that moved
      // is put back before the command fails.
      await rollBackAll(runner, pluginsRoot, installRoot, movedList.moved);
      console.error(`\n${movedList.failed} package(s) refused to move; every move is rolled back.`);
      return 1;
    }

    // Every configured profile mounts before the update is called done: an
    // update that leaves a config that cannot boot has not worked, and
    // finding that out at the next tick means finding it out from the daemon.
    const booted = await deps.mountProfiles();
    if (!booted.ok) {
      reportUnbootable(booted.problems);
      await rollBackAll(runner, pluginsRoot, installRoot, movedList.moved);
      return 1;
    }

    if (movedList.moved.some((one) => one.root === "install" && one.name === "@amykit/cli")) {
      const rewrite = await rewriteSkillsOrRollBack(runner, pluginsRoot, installRoot, movedList.moved, deps);
      if (rewrite !== undefined) return rewrite;
      for (const line of rewriteSkillsSaid) console.log(line);
    }

    console.log(`\n${movedList.moved.length} package(s) moved; every configured profile mounts. Run \`amy doctor\`, then \`amy start\`.`);
    return 0;
}

/**
 * Runs the skills rewrite after a CLI move, or rolls the whole move back.
 *
 * The CLI itself moved, so the skills travel with it, into every harness
 * they were written into before — the record under ~/.amy, not a guess from
 * what is installed now. The rewrite is a postcondition of the move, not
 * decoration: a new CLI that cannot write its own skills leaves a machine
 * whose skills lie about what is installed, so a refusal rolls the CLI move
 * back and returns the update's exit status; success returns nothing, with
 * the rewrite's lines in `rewriteSkillsSaid` for the caller to print.
 */
let rewriteSkillsSaid: string[] = [];

async function rewriteSkillsOrRollBack(
    runner: CommandRunner,
    pluginsRoot: string,
    installRoot: string | undefined,
    moved: readonly Held[],
    deps: SkillsInto,
): Promise<number | undefined> {
    const said = deps.skillsInto();
    rewriteSkillsSaid = said;
    if (said.length > 0) return undefined;
    console.error("\nthe updated CLI could not rewrite its skills; rolling the CLI move back.");
    await rollBackAll(runner, pluginsRoot, installRoot, moved);
    return 1;
}

/**
 * The refusal that comes before anything is read, or nothing when it may run.
 *
 * Swapping a package under a running loop is the one thing that turns a
 * deterministic machine into a flaky one, so it is the first question and
 * it names the pid it is refusing to interrupt.
 */
function refuseWhileRunning(home: string): number | undefined {
    const live = running(paths(home).pid);
    if (!live) return undefined;
    console.error(`the loop is running as pid ${live.pid}, driving ${live.workflow}. Run \`amy stop\` first.`);
    return 1;
}

/** The one-line report of everything the two roots hold. */
function reportWhatIsHeld(everything: readonly Held[], installRoot: string | undefined): void {
    console.log(`${everything.length} package(s) in ${installRoot ? "both roots" : "the plugins root"}${installRoot ? "" : " (running from a checkout, so no CLI half to move)"}`);
    for (const one of everything) console.log(`  ${line(one)}`);
}

/** Refuses an update whose registry target could not be resolved. */
function reportUnresolved(everything: readonly Held[], pkg: string | undefined): number | undefined {
    const unresolved = everything.filter(
      (one) => (pkg === undefined || one.name === pkg) && isRange(one.range) && one.want === undefined,
    );
    if (unresolved.length === 0) return undefined;
    console.error(`\ncould not resolve ${unresolved.length} package(s) from the registry; nothing moved:`);
    for (const one of unresolved) console.error(`  ${one.name} (${one.range})`);
    return 1;
}

/** `--check`'s whole answer: what would move, and nothing does. */
function reportOnly(moving: readonly Held[]): number {
    if (moving.length === 0) {
      console.log("nothing to move");
      return 0;
    }
    console.log(`\n${moving.length} package(s) would move. Run \`amy update\` to move them.`);
    return 0;
}

/** The zero-move case, which still has to answer for a machine that will not boot. */
async function nothingMoved(deps: MountProfiles & SkillsInto): Promise<number> {
    // The boot check runs even when nothing moved: an update on a machine
    // whose config already does not boot must say so, not report success
    // over a config the next tick would refuse.
    const booted = await deps.mountProfiles();
    if (!booted.ok) {
      reportUnbootable(booted.problems);
      console.error("\nNothing moved; the config is what needs attention.");
      return 1;
    }
    console.log("nothing to move");
    return 0;
}

/** What the update depends on beyond the move itself, in one named shape. */
interface UpdateDeps {
    mountProfiles: () => Promise<{ ok: true } | { ok: false; problems: string[] }>;
    skillsInto: () => string[];
}

type MountProfiles = Pick<UpdateDeps, "mountProfiles">;
type SkillsInto = Pick<UpdateDeps, "skillsInto">;

/**
 * Moves every package, probing each copy npm wrote, and counts the refusals.
 *
 * One package at a time on purpose: a later package's move must not be
 * blocked by an earlier one's refusal, because the operator reads the whole
 * list once and decides once. The command body rolls every earlier move
 * back when the list ends with a refusal, so a refusal mid-list never
 * leaves a mixed-version machine behind.
 */
async function moveEach(
    runner: CommandRunner,
    pluginsRoot: string,
    installRoot: string | undefined,
    moving: readonly Held[],
): Promise<{ moved: Held[]; failed: number }> {
    const moved: Held[] = [];
    let failed = 0;

    for (const one of moving) {
      console.log(`\nupdating ${one.name}: ${one.have} -> ${one.want}`);
      const root = one.root === "plugins" ? pluginsRoot : installRoot!;
      const installed = await move(runner, root, one.name, one.range, one.want!);
      if (!installed.ok) {
        console.error(`${installed.command} failed:`);
        console.error(installed.output || "it said nothing");
        if (installed.installed) {
          // npm replaced the copy even though the outcome failed — a
          // manifest range that could not be put back is the shape this
          // takes — so the machine is already changed past its manifest
          // and the caller's rollback has to count this move.
          moved.push(one);
        }
        failed += 1;
        continue;
      }

      // The import probe: the copy npm just wrote has to load. The probe
      // imports through a counter query, so it reads the new files even
      // when an earlier move in this update put that URL in the ESM cache.
      //
      // A moved CLI cannot be probed by import — mounting its module here
      // would re-run this very program — so the NEW CLI answers for itself
      // as its own process, the same way the boot check's mounts answer
      // for the plugins: a CLI that will not run is a bad version, and the
      // move is rolled back.
      const probe = one.root === "plugins"
        ? await moduleProbe(root, one.name, true)
        : one.name === "@amykit/cli"
          ? await cliProbe(root, one.name)
          : await moduleProbe(root, one.name, false);
      if (!probe.ok) {
        console.error(`${one.name} ${one.want} does not import:`);
        for (const problem of probe.problems) console.error(`  ${problem}`);
        const rolledBack = await restore(runner, root, one.name, one.have);
        console.log(rolledBack.ok ? `rolled back to ${one.have}` : `rollback failed — restore by hand with ${rolledBack.command}`);
        failed += 1;
        continue;
      }
      console.log(`updated ${one.name}`);
      moved.push(one);
    }

    return { moved, failed };
}

/** Runs a package import out of process, so a hung top-level await can be killed. */
export async function moduleProbe(
  root: string,
  name: string,
  needsPlugin: boolean,
  timeoutMs = 10_000,
): Promise<{ ok: true } | { ok: false; problems: string[] }> {
  let entry: string;
  try {
    entry = packageEntrySpecifier(path.join(root, "node_modules", ...name.split("/")));
  } catch (error) {
    const why = error instanceof Error ? error.message : String(error);
    return { ok: false, problems: [`${name}: could not resolve its entry — ${why}`] };
  }
  const source = needsPlugin
    ? `const m = await import(${JSON.stringify(entry)}); if (!m.plugin) process.exit(2);`
    : `await import(${JSON.stringify(entry)});`;
  return spawnedProbe(name, ["--input-type=module", "--eval", source], timeoutMs);
}

/** A bounded child probe: a package that never settles is a failed update. */
async function spawnedProbe(
  name: string,
  args: readonly string[],
  timeoutMs: number,
): Promise<{ ok: true } | { ok: false; problems: string[] }> {
  return new Promise((resolve) => {
    let settled = false;
    const child = spawn(process.execPath, [...args], { stdio: "ignore" });
    const finish = (result: { ok: true } | { ok: false; problems: string[] }) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(result);
    };
    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      finish({ ok: false, problems: [`${name}: probe timed out after ${timeoutMs}ms`] });
    }, timeoutMs);
    child.once("error", (error) => finish({ ok: false, problems: [`${name}: probe could not start — ${error.message}`] }));
    child.once("exit", (status) => finish(
      status === 0 ? { ok: true } : { ok: false, problems: [`${name}: probe exited with status ${status}`] },
    ));
  });
}

/**
 * Whether the CLI npm just wrote runs, asked of the new copy itself.
 *
 * The probe spawns the moved package's own bin with `--version`: the one
 * question whose answer proves the new CLI runs, from the files npm wrote.
 * The spawn is a child of this old process — the running module is never
 * re-imported, so there is nothing to un-cache — and its nonzero exit, its
 * error, or a bin whose manifest names nothing answer "the CLI is broken",
 * which rolls the move back like any other bad version.
 */
async function cliProbe(root: string, name: string): Promise<{ ok: true } | { ok: false; problems: string[] }> {
  const bin = binOf(root, name);
  if (!bin) return { ok: false, problems: [`${name}: its manifest names no bin`] };
  return spawnedProbe(name, [bin, "--version"], 10_000);
}

/** The moved package's own bin file, by its manifest, or nothing. */
function binOf(root: string, name: string): string | undefined {
  try {
    const directory = path.join(root, "node_modules", ...name.split("/"));
    const manifest = JSON.parse(fs.readFileSync(path.join(directory, "package.json"), "utf-8")) as {
      bin?: Record<string, string> | string;
    };
    // npm links a string bin under the package's own short name — the scope
    // is stripped — so the key can be the full name, the short one, or, on
    // a package with a single bin, the only entry there is.
    const short = name.split("/").pop()!;
    const map = typeof manifest.bin === "string" ? { [short]: manifest.bin } : manifest.bin;
    if (!map) return undefined;
    const relative = map[name] ?? map[short] ?? (Object.keys(map).length === 1 ? map[Object.keys(map)[0]!] : undefined);
    if (typeof relative !== "string") return undefined;
    return path.join(directory, relative);
  } catch {
    return undefined;
  }
}

/** The boot refusal's own words, with the profile named on each line. */
function reportUnbootable(problems: readonly string[]): void {
    console.error("\nthe machine does not boot after the update:");
    for (const problem of problems) console.error(`  ${problem}`);
    console.error("\nRolling back every move to the versions that did boot.");
}

/** Rolls every moved package back to the version that was on disk. */
async function rollBackAll(
    runner: CommandRunner,
    pluginsRoot: string,
    installRoot: string | undefined,
    moved: readonly Held[],
): Promise<void> {
    for (const one of moved) {
      const root = one.root === "plugins" ? pluginsRoot : installRoot!;
      const rolledBack = await restore(runner, root, one.name, one.have);
      console.log(rolledBack.ok ? `rolled back ${one.name} to ${one.have}` : `rollback failed for ${one.name} — restore by hand with ${rolledBack.command}`);
    }
}

/**
 * Assembles every configured profile, and reports the mount's own refusals.
 *
 * All of them, not only the selected one, because `update` changes the
 * packages under the whole machine: a profile the operator has not driven
 * this week is still one the next tick may pick, and finding it broken three
 * commands later is the failure this check exists to prevent.
 */
async function assembleProfiles(): Promise<{ ok: true } | { ok: false; problems: string[] }> {
  const config = loadConfig(home);
  const problems: string[] = [];
  for (const profile of Object.values(profiles(config))) {
    const booted = await assemble(profile);
    if (!booted.ok) problems.push(...booted.problems.map((problem) => `${profile.name}: ${problem}`));
  }
  return problems.length > 0 ? { ok: false, problems } : { ok: true };
}

/** Rewrites the skills into the harnesses and directories the record names. */
function rewriteSkillsInto(): string[] {
  // The NEW CLI writes its own skills. The old process rewriting them would
  // write the old bodies into the harnesses — the exact failure this
  // command exists to end — so the new binary is spawned to do it, reading
  // the same machine record under ~/.amy and its own shipped skills.
  const result = spawnSync(process.execPath, [process.argv[1]!, "skills", "--recorded"], {
    encoding: "utf-8",
    env: process.env,
  });
  const lines = (result.stdout ?? "").split("\n").filter(Boolean);
  if (result.status !== 0) {
    const said = (result.stderr ?? "").split("\n").filter(Boolean);
    console.error("the updated CLI could not rewrite its skills:");
    for (const line of said.length > 0 ? said : ["it said nothing"]) console.error(`  ${line}`);
    return [];
  }
  return lines;
}

pluginCommand
  .command("list")
  .description("The plugins this install mounts, and what they assembled into")
  .action(async () => {
    const config = loadConfig(home);
    const profile = selected(config);
    const specs = pluginList(config, profile);
    const source = profile.plugins.length > 0 ? ".amy/config.yaml" : "what this workflow needs";

    console.log(`${specs.length} plugin(s) to mount, from ${source}:\n`);

    const loaded = await loadMountable(specs);
    for (const spec of specs) {
      const found = loaded.bySpec.get(spec);
      console.log(`  ${found ? "ok  " : "FAIL"} ${spec}${found ? `  ${found.version}` : ""}`);
    }
    for (const problem of loaded.problems) console.log(`  ${problem}`);

    // Installed and mounted are different questions, and the answer to the
    // second is useless without the first: a plugin on disk that no config
    // names does nothing, and a config naming one that is not there is a
    // boot refusal waiting to happen.
    const present = installedPlugins(paths(home).plugins);
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
  .option("--recorded", "rewrite into the harnesses `amy skills` wrote to before, and nothing else")
  .action((options: { all?: boolean; harness?: string; dir?: string; recorded?: boolean }) => {
    const skills = shipped();

    // The update's half: every harness the record names, and nothing else.
    // A harness that is installed but was never written to is not written to
    // now — writing skills into a harness somebody did not choose is a
    // decision nobody made.
    if (options.recorded) {
      const wrote = writeSkills(home, install, () => skills, (name) =>
        harnesses().find((harness) => harness.name === name)?.skills,
      );
      if (wrote.length === 0) console.log("nowhere recorded: run `amy skills` once, by hand, first.");
      return;
    }

    const found = installedHarnesses();

    if (options.dir) {
      // Resolved once, before both the install and the record: a relative
      // `--dir` recorded as typed would later be interpreted by `amy update`
      // against whatever directory it runs from, rewriting a directory the
      // operator never named.
      const directory = path.resolve(options.dir);
      wrote(install(directory, skills), directory);
      recordWrite(home, { directory });
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
    for (const harness of chosen) recordWrite(home, { harness: harness.name });
    console.log(`\n${skills.length} skill(s): ${skills.map(([name]) => `/${name}`).join(", ")}`);
    console.log("Recorded, so the next `amy update` rewrites them into the same places.");

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
  .command("new")
  .description("Write an editable workflow under ~/.amy/workflows")
  .argument("<name>", "one directory name, such as oncall")
  .action((name: string) => {
    try {
      const directory = writeWorkflow(home, name, loadConfig(home));
      console.log(`wrote ${directory}`);
      console.log(`check it with: amy workflow check ${name}`);
    } catch (error) {
      console.error(error instanceof Error ? error.message : String(error));
      process.exitCode = 1;
    }
  });

workflowCommand
  .command("check")
  .description("Drive a workflow's lifecycle against its stub world")
  .argument("<name>", "the configured workflow to check")
  .action(async (name: string) => {
    const problems = await checkWorkflow(home, name, loadConfig(home), pluginsRootResolver(home, paths(home).plugins));
    if (problems.length === 0) {
      console.log(`${name} settles: its walkthrough is green`);
      return;
    }
    console.error(`${name} does not pass its walkthrough:`);
    for (const problem of problems) console.error(`  ${problem}`);
    process.exitCode = 1;
  });

workflowCommand
  .command("list", { isDefault: true })
  .description("Every workflow this install can drive")
  .action(async () => {
    const config = loadConfig(home);
    const known = profiles(config);
    const asked = resolveProfile(config, undefined);
    const present = installedPlugins(paths(home).plugins);
    const live = running(paths(home).pid);

    for (const profile of Object.values(known)) {
      const place = profilePaths(home, profile.name);
      const held = fs.existsSync(place.records) ? fs.readdirSync(place.records).length : 0;
      const marks = [
        asked.ok && asked.profile.name === profile.name ? "default" : "",
        live?.workflow === profile.name ? "running" : "",
        localWorkflow(home, profile.workflow) ? `local: ${workflowsDirectory(home)}` : "",
        present.includes(profile.workflow) || localWorkflow(home, profile.workflow) ? "" : "not installed",
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
  .action(async (options: { days?: string }) => {
    const config = loadConfig(home);
    const days = options.days ? Number(options.days) : config.retentionDays;
    const now = new Date();
    const removed = new FileQueue(profilePaths(home, selected().name).queue).prune(days, now);
    const assembled = await assemble(selected());
    const briefStore = assembled.ok ? (assembled.mounted.ports.get("brief") as BriefStore | undefined) : undefined;
    const records = assembled.ok ? assembled.mounted.store : undefined;
    const terminal = assembled.ok ? new Set(assembled.mounted.workflow?.terminalStates ?? []) : new Set<string>();
    const retired = briefStore && records
      ? await briefStore.retired((id) => terminal.has(records.load(id)?.state ?? ""), days * 86_400_000, now)
      : [];
    await Promise.all(retired.map((id) => briefStore!.remove(id)));
    console.log(`removed ${removed} finished item(s) and ${retired.length} retired brief(s) older than ${days} day(s)`);
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

/**
 * The worktree manager, built the way a mount would build it.
 *
 * The list and the remove are inspection and recovery, not work: they read
 * the trees on disk and the records beside them, and never need the whole
 * machine to come up — which is exactly when somebody wants to look. The
 * workflow's terminal states are asked of a mount when one can be assembled
 * and answered with none when it cannot, so a broken machine can still be
 * tidied by hand.
 */
async function worktreeManager(config: AmyConfig): Promise<Worktree> {
  const profile = selected();
  const place = profilePaths(home, profile.name);
  const assembled = await assemble(profile);

  return new WorktreeManager(runner, {
    root: config.worktrees.root || path.join(home, "worktrees"),
    workflow: profile.name,
    defaultBranch: config.defaultBranch,
    baseBranch: config.baseBranch,
    retentionDays: config.worktrees.retentionDays,
    record: (workId) => {
      const file = path.join(place.records, `${workId}.json`);
      try {
        return JSON.parse(fs.readFileSync(file, "utf-8")) as { state: string };
      } catch {
        return null;
      }
    },
    terminalStates: assembled.ok
      ? (assembled.mounted.workflow?.terminalStates ?? [])
      : [],
    log: new FileEventLog(paths(home).log, undefined, build),
  });
}

const worktreesCommand = program
  .command("worktrees")
  .description("Inspect and tidy the isolated checkouts work runs in");

worktreesCommand
  .command("list", { isDefault: true })
  .description("Name every worktree: state, workflow, work id, repo, branch, cleanliness, retention")
  .action(async () => {
    const config = loadConfig(home);
    const manager = await worktreeManager(config);
    const states = await manager.states();

    if (states.length === 0) {
      console.log("no worktrees");
      return;
    }

    const orphaned = states.filter((state) => state.state === "orphaned").length;
    for (const state of states) {
      const clean = state.clean ? "clean" : "dirty";
      const retention = state.retentionEligible ? "past retention" : "held";
      console.log(
        `${state.workId}  ${state.workflow}  ${state.repo}  ${state.branch || "(detached)"}  ` +
          `${state.state}  ${clean}  ${retention}`,
      );
      console.log(`  ${state.path}`);
    }

    if (orphaned > 0) {
      console.log(`\n${orphaned} tree(s) name work the store no longer holds.`);
      console.log("Recover with `amy worktrees remove <workId> --force`, or prune them by hand.");
    }
  });

worktreesCommand
  .command("remove")
  .description("Remove one worktree, refusing an in-flight or dirty one unless --force")
  .argument("<workId>", "the work whose tree is to go")
  .option("--force", "remove it even though the refusal above applies")
  .action(async (workId: string, options: { force?: boolean }) => {
    const config = loadConfig(home);
    const manager = await worktreeManager(config);
    const states = await manager.states();
    const found = states.filter((state) => state.workId === workId);

    if (found.length === 0) {
      console.log(`no worktree for ${workId}`);
      process.exitCode = 1;
      return;
    }

    let removed = 0;
    for (const state of found) {
      try {
        if (await manager.release(workId, state.repo, { force: options.force })) removed += 1;
      } catch (error) {
        console.error(error instanceof Error ? error.message : String(error));
        process.exitCode = 1;
      }
    }

    if (removed > 0) console.log(`removed ${removed} tree(s) for ${workId}`);
  });

worktreesCommand
  .command("prune")
  .description("Remove every terminal, clean tree past its retention, and nothing else")
  .action(async () => {
    const config = loadConfig(home);
    const manager = await worktreeManager(config);
    const removed = await manager.prune(new Date());
    console.log(removed.length ? `removed ${removed.join(", ")}` : "nothing to prune");
  });

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
    const now = new Date();
    // Confirmed today is the claim, Monday through Friday: a weekend holds,
    // because people do not confirm a roster they are not using.
    const workday = now.getUTCDay() >= 1 && now.getUTCDay() <= 5;
    const current =
      !workday || roster.confirmedOn === now.toISOString().slice(0, 10);
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
