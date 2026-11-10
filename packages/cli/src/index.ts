#!/usr/bin/env node
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { Console } from "node:console";
import { spawn, spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { Command } from "commander";
// Type-only: the CLI reports what a tick returned and mounts no engine itself.
import type { TickResult } from "@amykit/plugin-serial-engine";
import {
  BriefStore,
  Check,
  CommandRunner,
  ConfigSchema,
  Engine,
  FileStopSwitch,
  Mounted,
  NodeCommandRunner,
  WorkRecord,
  Workflow,
  answerTheChat,
  type Budget,
  type ChatDesk,
  callPath,
  callStanding,
  laneStanding,
  describeBuild,
  mount,
  parseBudget,
  renderBrief,
  stampId,
  unmetNeeds,
  WORKSPACE_PORT,
} from "@amykit/core";
import { FileEventLog } from "@amykit/plugin-file-log";
// Inspection builds these directly: `amy status` has to work even when a
// plugin will not mount, which is exactly when you want to look.
import { FileQueue } from "@amykit/plugin-file-queue";
import { FileStore } from "@amykit/plugin-file-store";
import { renderText } from "@amykit/ui";
import { specTable } from "@amykit/model-specs";
import { USAGE_COLLECTION, type UsageReader, type UsageResult } from "@amykit/agent-kit";
import { statusView, usageThenNow, type StatusRecord, type StatusSnapshot, type SubscriptionUsage } from "./status-page.js";
import {
  AmyConfig,
  configuredAutoUpdateProblems,
  configuredChatProblems,
  loadConfig,
  loadConfigFrom,
  addModeFor,
  profileSettingsFrom,
  removeExtraPlugin,
  removeProfile,
  writeExtraPlugins,
  writeProfilePlugins,
  writeWorkflowProfile,
} from "./config.js";
import { budgetReport } from "./budget.js";
import { loadEnv } from "./env.js";
import { diagnose, supervisorCheck } from "./doctor.js";
import { CHAT_COMMANDS, chatAct } from "./chat-action.js";
import { LoopSpec, MachineFacts, RESTART_EXIT, findSupervisor, labelFor } from "./supervisor/index.js";
import { LoadResult, NOT_INSTALLED, installedPlugins, isFilesystemWorkflow, load, pluginsRootResolver, pluginVersion } from "./loader.js";
import { describePoke, poke } from "./poke.js";
import { Profile, profiles, resolveProfile } from "./profiles.js";
import { Assembled, ChatParts, assembleChat, assembleProfile, chatPartsOf } from "./assemble.js";
import { pricedForTheCeiling } from "./chat-pricing.js";
import { parseSetupFlags, resolveSetupPlugin, runSetupWalk } from "./setup.js";
import { PhaseBrief, asksForABrief, briefMoved, briefsOf, checkBrief, operationsOffered, phasesOf, sectionsOf, withSection } from "./project.js";
import { installedStamp } from "./stamp.js";
import { explainReport } from "./config-explain.js";
import { hostPaths, pluginList, pluginSlices } from "./slices.js";
import { installIntoPluginsRoot } from "./install.js";
import {
  BootCheck,
  Picked,
  addFork,
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
import { claimDaemonBoundary, claimExitedDaemon, clearDaemon, readDaemon, runLoop, running, runningForWorkflow, writeDaemon } from "./daemon.js";
import { Harness as HarnessTarget, harnesses, install, installedHarnesses } from "./harnesses.js";
import { shipped } from "./skills.js";
import { amyHome } from "./home.js";
import { paths, profileDaemonPids, profilePaths } from "./paths.js";
import { packageEntrySpecifier } from "./spec.js";
import { Carrier, carriedBy, configWithout, dropFork, stillMounted } from "./remove.js";
import { removeProfileAndState as forgetProfile } from "./removal.js";
import {
  CommandEnvironment,
  Contribution,
  checks as pluginChecks,
  gather,
  migrateRootFiles,
  runSetup,
  writeFiles,
} from "./plugin-commands.js";
import { ANSWERED, register } from "./operations/commands.js";
import { installContract } from "./operations/contract.js";
import { refreshPricesWhenStale } from "./prices.js";
import { exportWorkflow, inspectWorkflow, localWorkflow, workflowsDirectory, writeWorkflow } from "./workflow.js";
import { addWorkflowInto } from "./workflow-add.js";
import { ForkTarget, applyForkUpdates, treeDigest, forkTargets, mergeForks, prepareForks, profileForkDirectories, readRecord, readTree, writeMarkedMerges, writeRecord, writeTree } from "./fork.js";
import { aboveRelease, belowRelease, compareVersions, Copy, firstParty, firstPartyCopies, Held, isRange, line, localRoot, migrateSettingsFile, move, Release, restore, Root, roots, survey } from "./update.js";
import { beginAutoUpdateInvocation, finishDaemonUpdate, hasDaemonUpdate, markDaemonUpdate, retryDaemonUpdate, runWithAutoUpdate, settleDaemonUpdate, takeDaemonUpdate } from "./auto-update.js";
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
// A supervised loop runs in the state directory: the project it was started
// from is named, never its secrets, and its .env is read from there.
if (process.env.AMY_PROJECT_ENV) loadEnv(process.env.AMY_PROJECT_ENV);

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
function loadMountable(specs: readonly string[], profile?: string): Promise<LoadResult> {
  return load(specs, pluginsRootResolver(home, paths(home).plugins, profile), paths(home).plugins);
}

/**
 * Assembles one profile with this process's runner, loader, log and host glue.
 *
 * A fork whose source moved is built first, and its copy in the profile's
 * root refreshed, so what mounts is what the fork says now; a fork that does
 * not build refuses the boot by name.
 */
async function assemble(profile: Profile, config: AmyConfig = loadConfig(home)): Promise<Assembled> {
  const prepared = await prepareForks(runner, home, paths(home).plugins, profile.name, pluginList(config, profile));
  if (!prepared.ok) return prepared;
  return assembleLoaded(profile, config);
}

/** Mounts a profile for a read-only inspection without preparing edited forks. */
async function assembleForInspection(profile: Profile): Promise<Assembled> {
  return assembleLoaded(profile, loadConfig(home), true);
}

function assembleLoaded(profile: Profile, config: AmyConfig, readOnly = false): Promise<Assembled> {
  return assembleProfile(home, config, profile, {
    runner,
    load: (specs) => loadMountable(specs, profile.name),
    log: (file) => new FileEventLog(file, undefined, build, !readOnly),
    host: [],
    readOnly,
  });
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

/** A reaper can leave a due update behind; the next owner settles it before publishing a daemon. */
async function settlePendingDaemonUpdate(profile: Profile, command: string, config: AmyConfig): Promise<void> {
  // A package update is machine-wide. Keep its durable due marker for the
  // first idle boundary rather than making another phase's startup fail.
  if (anotherProfileDaemonIsRunning(profile, config)) return;
  for (const pending of Object.values(profiles(config, home))) {
    if (!await settleDaemonUpdate(home, pending.name, scheduledUpdate)) {
      throw new Error(`the previous daemon's scheduled update did not settle; fix it and try ${command} again`);
    }
  }
}

/** A profile may start while a sibling owns the shared package installation. */
function anotherProfileDaemonIsRunning(profile: Profile, config: AmyConfig): boolean {
  return Object.values(profiles(config, home)).some((candidate) => candidate.name !== profile.name && runningProfileDaemon(candidate));
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
  const resolution = resolveProfile(config, program.opts<{ workflow?: string }>().workflow, home);
  if (resolution.ok) return resolution.profile;

  console.error(resolution.problem);
  process.exit(1);
}

/** A config transition must not hide the daemon its prior layout published. */
function runningProfileDaemon(profile: Profile): { file: string; record: NonNullable<ReturnType<typeof running>> } | undefined {
  for (const file of profileDaemonPids(home, profile)) {
    const record = runningForWorkflow(file, profile.name);
    if (record) return { file, record };
  }
  return undefined;
}

/** The legacy PID is shared, so it must never be overwritten by another profile. */
function runningSharedDaemon(): ReturnType<typeof running> {
  return running(paths(home).pid);
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

/**
 * The one way to set a machine up: `amy setup` is the walk. The `amy init`
 * that wrote a template and left the person to it is gone, alias included.
 */
const setTheMachineUp = async (
  plugin: string | undefined,
  options: { harness?: string; workflow?: string; channels?: string },
): Promise<void> => {
  const settings = parseSetupFlags(process.argv).settings;
  // `--workflow` is also the program's own option, and commander hands a
  // name both declare to the program: read there, the answer still reaches
  // the walk instead of leaving the workflow ask open.
  const workflow = options.workflow ?? program.opts<{ workflow?: string }>().workflow;
  process.exitCode = await runSetupWalk(
    home,
    {
      ...(plugin !== undefined ? { plugin: resolveSetupPlugin(plugin) } : {}),
      ...(options.harness !== undefined ? { harness: options.harness } : {}),
      ...(workflow !== undefined ? { workflow } : {}),
      ...(options.channels !== undefined
        ? { channels: options.channels.split(",").map((one) => one.trim()).filter(Boolean) }
        : {}),
      settings,
    },
    runner,
  );
};

program
  .command("setup")
  .description("Set the machine up: the harness, the workflow, the channels, one question at a time")
  .argument("[plugin]", "configure this one plugin, and skip the machine's questions")
  .option("--harness <name>", "answer the harness ask before it is asked")
  .option("--workflow <name>", "answer the workflow ask; `none` sets up no workflow")
  .option("--channels <a,b>", "answer the channels ask, by name, comma-separated")
  // The setting flags are the walk's own spelling — `--slack.token …` — and
  // no commander option can name them before the plugin's schema is read,
  // so they are allowed through here and parsed by the walk's own parser.
  .allowUnknownOption(true)
  .action(setTheMachineUp);

program
  .command("doctor")
  .description("Check everything the machine depends on before it touches a ticket")
  .action(async () => {
    const config = loadConfig(home);

    // A machine that has not named a workflow yet is the machine doctor is
    // for: it reports everything else it can see, then names the one thing
    // that is missing in the words the operator can act on — rather than
    // exiting at the selection step with nothing reported.
    const resolution = resolveProfile(config, program.opts<{ workflow?: string }>().workflow, home);
    if (!resolution.ok) {
      await doctorReport(
        config,
        { name: "", workflow: "", plugins: [], takesNotes: false, takesTasks: false, settings: {} },
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
    : await loadMountable(pluginList(config, profile), profile.name);

  const checks = await diagnose({
    home,
    config,
    runner,
    env: process.env,
    now: new Date(),
    cwd: process.cwd(),
    schemas: Object.fromEntries([
      ...loaded.plugins.flatMap((plugin) => (plugin.configSchema ? [[plugin.name, plugin.configSchema]] : [])),
      ...(assembled.ok && assembled.workflowPlugin?.configSchema
        ? [[assembled.workflowPlugin.name, assembled.workflowPlugin.configSchema]]
        : []),
    ]),
    workflow: mounted?.workflow,
    // Mounted, then asked: whether a notification target is reachable is
    // the channel's own knowledge, and a mount that did not happen is its
    // own answer to report.
    notifyPort: mounted?.ports.get("notify"),
    gatePort: mounted?.ports.get("gate"),
    // The workspace is a capability like the gate: a machine that mounted
    // one is asked whether its checkouts can be reached, and one that
    // mounted none is asked nothing.
    workspacePort: mounted?.ports.get(WORKSPACE_PORT),
    // What the machine's own plugins read from the environment, named by
    // them: a machine that mounted no credential-reading plugin is asked
    // for no credential.
    environments: Object.fromEntries(
      loaded.plugins.flatMap((plugin) => (plugin.environment ? [[plugin.name, plugin.environment]] : [])),
    ),
    conversationPort: mounted?.ports.get("conversation"),
    briefs: problem ? [] : briefsOf(assembled.ok && assembled.workflowPlugin ? assembled.workflowPlugin : "bySpec" in loaded ? loaded.bySpec.get(profile.workflow) : undefined),
  });
  // After the host's own, and only for what this profile mounted: a check a
  // workflow brought is the workflow's knowledge, and a red one fails the
  // doctor by the same count as any other.
  if (!problem) checks.push(...await pluginChecks(home, config, profile, contributions, commandOut));
  // Which supervisor keeps the loop running, if any (S38, S39).
  checks.push(supervisorCheck(await findSupervisor(machine())));

  reportDoctor(checks, assembled, problem);
}

/** Says what the checks found, and whether the machine is ready. */
function reportDoctor(
  checks: readonly Check[],
  assembled: Awaited<ReturnType<typeof assemble>>,
  problem: string | undefined,
): void {
  for (const check of checks) {
    const detail = check.detail ? `  ${check.detail}` : "";
    console.log(`${check.ok ? "ok  " : "FAIL"} ${check.label}${detail}`);
  }

  if (problem) console.log(`FAIL ${problem}`);

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

/**
 * The handbrake: every loop, every run, and nothing new until `amy start`.
 *
 * One switch for the machine rather than one per profile, because the reason
 * for stopping is usually the machine — a deploy, a laptop closing, a
 * credential about to be rotated — and a brake that only held the workflow you
 * happened to name would let the other one keep opening pull requests.
 */
async function stopEverything(): Promise<void> {
  const config = loadConfig(home);
  stopSwitch.request("stopped by hand");
  new FileEventLog(paths(home).log, undefined, build).append({
    at: new Date().toISOString(),
    kind: "stop.requested",
    detail: { reason: "amy stop --all" },
  });

  const ended: string[] = [];
  for (const profile of Object.values(profiles(config, home))) {
    const live = runningProfileDaemon(profile);
    await unsupervise(profile);
    if (!live) continue;
    if (isAliveNow(live.record.pid)) process.kill(live.record.pid, "SIGTERM");
    await waitForDaemonExit(live.record.pid);
    if (!hasDaemonUpdate(home, live.record.workflow)) clearDaemon(live.file);
    ended.push(`${live.record.workflow} (pid ${live.record.pid})`);
  }

  // A version before profiles published one shared PID; it is still a loop.
  const shared = runningSharedDaemon();
  if (shared) {
    process.kill(shared.pid, "SIGTERM");
    await waitForDaemonExit(shared.pid);
    clearDaemon(paths(home).pid);
    ended.push(`the shared loop (pid ${shared.pid})`);
  }

  console.log(ended.length > 0 ? `stopped ${ended.join(", ")}` : "nothing was running");
  console.log("Nothing starts until `amy start`.");
}

program
  .command("start")
  .description("Start the loop under the machine's supervisor, which keeps it running")
  .option("--every <seconds>", "how long to wait after finding nothing to do", "60")
  .option("--detached", "start it detached instead: nothing brings it back if it stops")
  .action(async (options: { every: string; detached?: boolean }) => {
    const config = loadConfig(home);
    const profile = selected(config);
    const place = profilePaths(home, profile);
    // The handbrake is one switch for the machine, and starting is how it is
    // released: a person who stopped everything and comes back to start one
    // workflow means the machine is running again, not one loop in a still
    // held one.
    if (stopSwitch.isRequested()) {
      stopSwitch.clear();
      console.log("released the handbrake");
    }
    const already = runningProfileDaemon(profile);
    if (already) {
      console.log(`already running: pid ${already.record.pid}, driving ${already.record.workflow}`);
      return;
    }

    const problems = configuredAutoUpdateProblems(config);
    if (problems.length > 0) throw new Error(problems.join("; "));

    // Under the machine's supervisor unless asked otherwise (S27): the loop
    // claims its own record and settles its own scheduled update, as a
    // foreground loop does, and the supervisor starts it again when it dies.
    if (!options.detached && await startedUnderSupervisor(profile, options.every)) return;

    // A detached reaper still owns the dead record and its after-timed
    // update. Starting another loop must not clear that record before the
    // reaper can claim it, or silently lose the scheduled maintenance.
    await settlePendingDaemonUpdate(profile, "start", config);
    const schedule = beginAutoUpdateInvocation(home, profile.name, config);
    await runDueBeforeDaemonUpdate(schedule, profile, config);

    // A loop is about to spend an agent's money; a table older than a week is
    // refreshed first, and the loop starts either way.
    migrateRootFiles(home, contributions, commandOut);
    await refreshPricesWhenStale(contributions, commandEnvironment());

    // The claim spans only the moment the loop becomes visible: an update
    // refused to move packages while a child was between its spawn and its
    // pid record. A due before-update runs unclaimed above, because it is
    // an `amy update` itself and owns the boundary inside its own process.
    // Package updates are shared across every phase, so every phase start
    // takes the same short boundary before publishing its own PID.
    const release = claimDaemonBoundary(paths(home).pid);
    if (!release) {
      console.error("the loop is starting or amy update is running; try again when it finishes");
      process.exitCode = 1;
      return;
    }
    try {
      const shared = runningSharedDaemon();
      if (shared) {
        console.log(`already running: pid ${shared.pid}, driving ${shared.workflow}`);
        return;
      }
      const current = runningProfileDaemon(profile);
      if (current) {
        console.log(`already running: pid ${current.record.pid}, driving ${current.record.workflow}`);
        return;
      }

      // Detached, with its output on a file rather than this terminal: the
      // point of starting it is that it outlives the session that started it.
      fs.mkdirSync(path.dirname(place.pid), { recursive: true });
      const out = fs.openSync(path.join(path.dirname(place.pid), "daemon.log"), "a");
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
      console.log(`Watch it: tail -f ${path.join(path.dirname(place.pid), "daemon.log")}`);
    } finally {
      release();
    }
  });

program
  .command("stop")
  .description("Stop the background loop; --all pulls the machine's handbrake")
  .option("--all", "end every loop and run in flight, and start nothing until `amy start`")
  .action(async (options: { all?: boolean }) => {
    if (options.all) {
      await stopEverything();
      return;
    }

    const selectedProfile = selected();
    const live = runningProfileDaemon(selectedProfile);
    // Removed from its supervisor first, so the loop that exits is not started again.
    const supervised = await unsupervise(selectedProfile);
    if (!live) {
      console.log(supervised ? `stopped ${selectedProfile.name} under ${supervised}` : "nothing running");
      return;
    }
    const { file, record } = live;
    if (!isAliveNow(record.pid)) {
      if (!hasDaemonUpdate(home, record.workflow)) clearDaemon(file);
      console.log(`stopped ${record.workflow}: pid ${record.pid}`);
      return;
    }

    // Only the selected daemon is signalled. Its SIGTERM handler ends its own
    // agent children; the machine-wide handbrake is `--all`, which also ends
    // a `run` in another terminal and holds the next one.
    process.kill(record.pid, "SIGTERM");
    await waitForDaemonExit(record.pid);
    // The detached reaper owns an after-timed update, including a crash or
    // direct signal. Do not race it by consuming the marker here.
    if (!hasDaemonUpdate(home, record.workflow)) clearDaemon(file);
    console.log(`stopped ${record.workflow}: pid ${record.pid}`);
  });

program
  .command("after-daemon", { hidden: true })
  .description("Internal: update after a started daemon has exited")
  .argument("<pid>")
  .argument("<workflow>")
  .action(async (pidText: string, workflow: string) => {
    const pid = Number(pidText);
    if (!Number.isSafeInteger(pid) || pid <= 0) throw new Error(`invalid daemon pid ${pidText}`);
    await waitForDaemonExit(pid);
    const resolution = resolveProfile(loadConfig(home), workflow, home);
    if (!resolution.ok) return;
    if (!profileDaemonPids(home, resolution.profile).some((file) => claimExitedDaemon(file, pid))) return;
    if (!takeDaemonUpdate(home, workflow)) return;
    if (await scheduledUpdate() === 0) finishDaemonUpdate(home, workflow);
    else {
      retryDaemonUpdate(home, workflow);
      process.exitCode = 1;
    }
  });

program
  .command("daemon", { hidden: true })
  .description("The loop itself, in the foreground. `amy start` runs this for you")
  .option("--every <seconds>", "how long to wait after finding nothing to do", "60")
  .option("--scheduled", "internal: the parent start command already scheduled this lifecycle")
  .option("--supervised", "internal: the machine's supervisor runs this loop and starts it again when it dies")
  .option("--log <file>", "internal: append the loop's output to this file")
  .action(async (options: { every: string; scheduled?: boolean; supervised?: boolean; log?: string }) => {
    if (options.log) appendOutputTo(options.log);
    const current = loadConfig(home);
    let profile = selected(current);
    const config = restartingConfig(profile) ?? current;
    profile = selected(config);
    let exit: "restart" | "stop" | undefined;
    const drive = async () => {
      const idleMs = Math.max(1, Number(options.every)) * 1000;
      let stopping = false;

      for (const signal of ["SIGTERM", "SIGINT"] as const) {
        process.on(signal, () => {
          stopping = true;
          runner.killAll();
        });
      }

      // The chat does not depend on the workflow mounting (S29): a loop whose
      // mount fails still answers in the chat, says what failed, and takes
      // `/action`, so a broken config is fixed from the phone.
      const mounted = await mountForLoop(profile, config, options.supervised === true);
      if (!mounted) {
        // Nothing to drive and nobody to answer: as before, a refusal.
        process.exitCode = 1;
        return;
      }
      const { engine, mountProblem, parts } = mounted;
      const reader = chatReader(profile, mounted, options.supervised === true, (how) => {
        exit = how;
        stopping = true;
      });
      const chat = async () => {
        if (!stopping) await reader();
      };

      console.log(`${new Date().toISOString()} loop up as pid ${process.pid}${engine ? `, looking every ${idleMs / 1000}s` : ""}${parts.conversation?.chat ? ", reading the chat" : ""}`);
      await sayRestarted(parts.conversation, profile, mountProblem);

      // A workflow that did not mount may not be there to digest at all.
      let mountedAt = engine ? sourceDigest(profile) : "";
      const brokenAt = brokenMountDigest(profile);
      await runLoop({
        idleMs,
        stopping: () => stopping,
        paused: () => stopSwitch.isRequested(),
        turn: async () => {
          // The chat first, then the work: a message that arrives mid-turn
          // waits for the next one (S20).
          await chat();
          if (stopping || !engine) return { idle: true };
          // Discovery every pass, because work appears in the world rather than
          // being handed over: a ticket moved into the working status while
          // nothing was due is exactly what this loop exists to notice.
          await engine.discover();
          const result = (await engine.tick()) as TickResult;
          report(result);
          return { idle: result.kind === "idle" || result.kind === "stopped" };
        },
        changed: () => engine === undefined
          ? options.supervised === true && brokenMountDigest(profile) !== brokenAt
          : sourceDigest(profile) !== mountedAt,
        remount: async () => {
          if (!engine) {
            exit = "restart";
            stopping = true;
            return;
          }
          mountedAt = sourceDigest(profile);
          if (await remountedElsewhere(profile, options)) {
            stopping = true;
            if (options.supervised) exit = "restart";
          }
        },
        // The chat is read while the loop waits too, so a person is answered
        // in seconds rather than when the next look is due.
        sleep: async (ms) => {
          const until = Date.now() + ms;
          while (!stopping && Date.now() < until) {
            await sleep(Math.min(CHAT_EVERY_MS, until - Date.now()));
            await chat();
          }
        },
      });

      console.log(`${new Date().toISOString()} loop down${exit === "restart" ? ", for its supervisor to start the new one" : ""}`);
    };
    if (options.scheduled) await drive();
    else await visibleForegroundDaemon(profile, drive);
    // A restart exits as a failure, which is what makes a supervisor start
    // it again; a stop asks amy stop to remove it from the supervisor, which
    // ends this process cleanly.
    if (exit === "restart") process.exitCode = RESTART_EXIT;
    if (exit === "stop") stopFromTheChat(profile);
  });

/**
 * What the loop runs on: the engine and the chat, or the chat alone when the
 * workflow does not mount (S29), which says what failed. Nothing when there
 * is neither and no supervisor would only start it again.
 */
async function mountForLoop(profile: Profile, config: AmyConfig, supervised: boolean): Promise<{ engine?: Engine; mountProblem?: string; parts: ChatParts; spend?: ChatDesk["spend"] } | undefined> {
  const assembled = await assembleOrSay(profile, config);
  if (assembled.ok) {
    return { engine: assembled.engine, ...chargedTo(config, profile, chatPartsOf(assembled.mounted)) };
  }
  const parts = await assembleChat(home, config, profile, { runner, load: (specs) => loadMountable(specs, profile.name), log: (file) => new FileEventLog(file, undefined, build), host: [] });
  const chat = parts.conversation?.chat !== undefined;
  if (!chat && !supervised) return undefined;
  // Under a supervisor, exiting would only be started again, and again: the
  // loop waits instead, and a change to the config or the workflow is the
  // restart that mounts it.
  console.error(`${new Date().toISOString()} ${chat ? "only the chat runs" : "nothing runs"} until the workflow mounts${supervised ? "; a change to the config or the workflow restarts the loop" : ""}`);
  return { mountProblem: assembled.problems.join("; "), ...chargedTo(config, profile, parts) };
}

/**
 * Where the chat is charged, only when the person asked for it (chat.budget).
 * Asked for and with no budget mounted to hold it to, a turn is refused rather
 * than spent outside the ceiling the person meant it to count against.
 */
function chargedTo(config: AmyConfig, profile: Profile, parts: ChatParts): { parts: ChatParts; spend?: ChatDesk["spend"] } {
  const chatProblems = configuredChatProblems(config);
  // A degraded loop keeps its chat available to explain a broken workflow,
  // but malformed chat policy must not silently turn its budget ceiling off.
  // Treat it as a denied budget until the operator repairs the config.
  if (chatProblems.length > 0) {
    const reason = chatProblems.join("; ");
    return {
      parts,
      spend: {
        budget: { mayStart: () => ({ ok: false, window: "chat", measure: "costUsd", used: 0, limit: 0, stopAt: 0, retryAfterMs: 60_000, reason }) },
        log: new FileEventLog(profilePaths(home, profile).log, undefined, build),
      },
    };
  }
  if (!config.chat.budget) return { parts };
  const budget: Budget = parts.budget ?? {
    mayStart: () => ({ ok: false, window: "chat", measure: "costUsd", used: 0, limit: 0, stopAt: 0, retryAfterMs: 60_000, reason: "chat.budget is on and no agent budget is mounted to count this turn against" }),
  };
  // A dollar ceiling holds only harnesses whose turns arrive with a price. A
  // slice that will not resolve mounted no relay, so no budget lets a turn start.
  let setting: unknown;
  try {
    setting = configuredBudget(config, profile);
  } catch {
    setting = undefined;
  }
  const priced = pricedForTheCeiling(parts, setting, specTable(home));
  if (priced.unpriced.length > 0) {
    console.error(`${new Date().toISOString()} the chat does not offer ${priced.unpriced.join(", ")}: chat.budget charges a costUsd ceiling and nothing can price their turns`);
  }
  return { parts: priced.parts, spend: { budget, log: new FileEventLog(profilePaths(home, profile).log, undefined, build) } };
}

/** One pass over the chat, as this loop answers it; a failure to read it is said and waits for the next pass. */
function chatReader(profile: Profile, mounted: { mountProblem?: string; parts: ChatParts; spend?: ChatDesk["spend"] }, supervised: boolean, exit: (how: "restart" | "stop") => void): () => Promise<void> {
  const conversation = mounted.parts.conversation;
  // Only a supervisor starts a loop with --supervised, so the flag is what
  // says the next loop will be started; a detached loop says why not.
  const unsupervised = supervised ? undefined : "this loop was started without one: amy start --detached, amy start on a machine with none, or amy daemon";
  const act = chatAct({
    runner,
    amy: [process.execPath, process.argv[1]!],
    workflow: profile.name,
    config: paths(home).config,
    restartMarker: restartMarkerOf(profile),
    ...(unsupervised ? { unsupervised } : {}),
    pid: process.pid,
    exit: async (how) => exit(how),
  });
  return async () => {
    if (!conversation?.chat) return;
    try {
      const pass = await answerTheChat({
        conversation,
        harnesses: mounted.parts.harnesses,
        cwd: profile.project?.root ?? home,
        directory: path.join(home, "chat"),
        commands: CHAT_COMMANDS,
        act,
        ...(mounted.mountProblem ? { mountProblem: mounted.mountProblem } : {}),
        ...(mounted.spend ? { spend: mounted.spend } : {}),
        about: `This amy drives the workflow \`${profile.name}\` (${profile.workflow}); its state is in ${home}.`,
      });
      for (const after of pass.after) await after();
    } catch (error) {
      console.error(`${new Date().toISOString()} the chat could not be read: ${(error as Error).message}`);
    }
  };
}

/** What a loop whose workflow did not mount waits to see change: the config, and the workflow's source. */
function brokenMountDigest(profile: Profile): string {
  let config: string;
  try {
    config = fs.readFileSync(paths(home).config, "utf-8");
  } catch {
    config = "";
  }
  let source: string;
  try {
    source = sourceDigest(profile);
  } catch {
    source = "";
  }
  return `${config}\0${source}`;
}

/** How often the chat is read while the loop waits. */
const CHAT_EVERY_MS = 5_000;

/** Assembles the loop's mount, saying why when it does not come up. */
async function assembleOrSay(profile: Profile, config: AmyConfig): Promise<Assembled> {
  const scheduleProblems = [...configuredAutoUpdateProblems(config), ...configuredChatProblems(config)];
  if (scheduleProblems.length > 0) {
    console.error("amy could not start:");
    for (const problem of scheduleProblems) console.error(`  ${problem}`);
    return { ok: false, problems: scheduleProblems };
  }
  const outcome = await assemble(profile, config);
  if (outcome.ok) return outcome;
  console.error("amy could not start:");
  for (const problem of outcome.problems) console.error(`  ${problem}`);
  if (outcome.problems.some((problem) => problem.includes(NOT_INSTALLED))) console.error(`\nInstalled: ${installed()}`);
  return outcome;
}

/** Where a restart asked from the chat leaves its promise to say the new pid. */
function restartMarkerOf(profile: Profile): string {
  // A profile may switch between a packaged workflow (whose daemon is at the
  // machine root) and a project workflow (whose daemon is under profiles/).
  // The handoff belongs to the profile, not either daemon layout.
  return path.join(home, "profiles", profile.name, "restart.json");
}

/** The config bytes a chat restart already proved mount, until that restart announces itself. */
function restartingConfig(profile: Profile): AmyConfig | undefined {
  try {
    const marker = JSON.parse(fs.readFileSync(restartMarkerOf(profile), "utf-8")) as { config?: unknown };
    return typeof marker.config === "string" ? loadConfigFrom(home, marker.config) : undefined;
  } catch {
    return undefined;
  }
}

/** A loop a restart started says so where the restart was asked, with its new pid (S28). */
async function sayRestarted(conversation: ChatParts["conversation"], profile: Profile, mountProblem: string | undefined): Promise<void> {
  const marker = restartMarkerOf(profile);
  let asked: { place: string; source?: string; pid: number } | undefined;
  try {
    asked = JSON.parse(fs.readFileSync(marker, "utf-8")) as { place: string; source?: string; pid: number };
  } catch {
    return;
  }
  // Asked in a chat this loop no longer reads (a channel changed with the restart): there is nowhere to say it.
  if (!conversation?.say || asked.source !== conversation.source) {
    console.log(`${new Date().toISOString()} restarted as pid ${process.pid}, was ${asked.pid}; the chat it was asked in is not this one`);
    fs.rmSync(marker, { force: true });
    return;
  }
  const warning = mountProblem ? ` The workflow did not mount, so only the chat runs: ${mountProblem}` : "";
  try {
    await conversation.say(asked.place, `Restarted: pid ${process.pid}, was ${asked.pid}.${warning}`);
    fs.rmSync(marker, { force: true });
  } catch (error) {
    // Kept, so the next loop to come up says it: the restart was promised there.
    console.error(`${new Date().toISOString()} could not say the restart in the chat: ${(error as Error).message}`);
  }
}

/** `/action stop`: amy stop removes this loop from its supervisor and ends it, from another process. */
function stopFromTheChat(profile: Profile): void {
  const child = spawn(process.execPath, [process.argv[1]!, "--workflow", profile.name, "stop"], { detached: true, stdio: "ignore", env: process.env });
  child.unref();
}

/**
 * Starts a workflow's loop under the machine's supervisor, saying its pid;
 * answers false, having said why, when the machine has none.
 */
async function startedUnderSupervisor(profile: Profile, every: string): Promise<boolean> {
  const found = await findSupervisor(machine());
  if (!found.ok) {
    console.log(`no supervisor: ${found.why}. The loop runs detached, and nothing brings it back if it stops.`);
    return false;
  }
  if (found.refuse) console.error(`warning: ${found.refuse}`);
  const spec = loopSpecFor(profile, every);
  await found.supervisor.start(spec);
  const pid = await recordedPid(profile, 30_000);
  if (pid === undefined) {
    console.error(`${found.supervisor.name} took ${profile.name} but no loop said its pid; read ${spec.log}`);
    process.exitCode = 1;
  } else {
    console.log(`started ${profile.name} under ${found.supervisor.name}: pid ${pid}`);
    console.log(`Watch it: tail -f ${spec.log}`);
  }
  return true;
}

/** What finding a supervisor reads of this machine. */
function machine(): MachineFacts {
  let procVersion: string | undefined;
  try {
    procVersion = fs.readFileSync("/proc/version", "utf-8");
  } catch {
    procVersion = undefined;
  }
  return { platform: process.platform, runner, home: os.homedir(), user: os.userInfo().username, uid: process.getuid?.() ?? 0, env: process.env, ...(procVersion ? { procVersion } : {}) };
}

/** The loop as a supervisor runs it: this amy, its state directory, and the PATH its harnesses are found on. */
function loopSpecFor(profile: Profile, every: string): LoopSpec {
  const log = path.join(path.dirname(profilePaths(home, profile).pid), "daemon.log");
  return {
    label: labelFor(home, profile.name),
    description: `amy, driving ${profile.name}`,
    program: process.execPath,
    args: [process.argv[1]!, "--workflow", profile.name, "daemon", "--supervised", "--every", every, "--log", log],
    env: {
      AMY_HOME: home,
      HOME: os.homedir(),
      PATH: process.env.PATH ?? "",
      ...(process.env.LANG ? { LANG: process.env.LANG } : {}),
      ...(process.env.AMY_SUPERVISOR ? { AMY_SUPERVISOR: process.env.AMY_SUPERVISOR } : {}),
      AMY_PROJECT_ENV: process.cwd(),
    },
    workingDirectory: home,
    log,
    directory: path.join(home, "supervisor"),
  };
}

/** Removes a workflow's loop from the supervisor that runs it, naming that supervisor, or nothing when none does. */
async function unsupervise(profile: Profile): Promise<string | undefined> {
  const found = await findSupervisor(machine());
  if (!found.ok) return undefined;
  const label = labelFor(home, profile.name);
  if (!await found.supervisor.installed(label)) return undefined;
  await found.supervisor.stop(label);
  return found.supervisor.name;
}

/** The pid a workflow's loop wrote, once it has, within a wait. */
async function recordedPid(profile: Profile, waitMs: number): Promise<number | undefined> {
  const until = Date.now() + waitMs;
  while (Date.now() < until) {
    const live = runningProfileDaemon(profile);
    if (live) return live.record.pid;
    await sleep(200);
  }
  return undefined;
}

function isAliveNow(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return (error as NodeJS.ErrnoException).code === "EPERM";
  }
}

/** Everything the loop prints goes to its log, which every supervisor then agrees on. */
function appendOutputTo(file: string): void {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const stream = fs.createWriteStream(file, { flags: "a" });
  const logged = new Console(stream, stream);
  console.log = logged.log.bind(logged);
  console.error = logged.error.bind(logged);
  console.warn = logged.warn.bind(logged);
}

/** One digest over what a profile mounts from source: its forks, and a workflow of your own. */
function sourceDigest(profile: Profile): string {
  const trees = [...profileForkDirectories(home, profile.name).values()];
  const own = localWorkflow(home, profile.workflow);
  if (own) trees.push(path.dirname(fileURLToPath(own)));
  else if (profile.project) trees.push(profile.project.root);
  else if (isFilesystemWorkflow(profile.workflow)) {
    const resolved = path.resolve(profile.workflow);
    trees.push(fs.statSync(resolved).isDirectory() ? resolved : path.dirname(resolved));
  }
  return trees.map((tree) => treeDigest(readTree(tree))).join(":");
}

/**
 * Remounts a running daemon (S17): a changed fork is built and its copy
 * refreshed, the new mount is assembled in a child first, and only a mount
 * that boots replaces this process, which ends its loop for it. Modules are
 * cached for the life of a process, so a new mount is a new process; a
 * failing build or mount leaves this one on the mount it had.
 */
async function remountedElsewhere(profile: Profile, options: { every: string; scheduled?: boolean; supervised?: boolean }): Promise<boolean> {
  const config = loadConfig(home);
  const prepared = await prepareForks(runner, home, paths(home).plugins, profile.name, pluginList(config, profile));
  if (!prepared.ok) {
    console.error(`${new Date().toISOString()} the source changed and does not build; the loop keeps the mount it had:`);
    for (const problem of prepared.problems) console.error(`  ${problem}`);
    return false;
  }
  if (!options.scheduled && !options.supervised) {
    console.log(`${new Date().toISOString()} the source changed and is built; restart this loop to mount it`);
    return false;
  }
  const checked = await runner.run(process.execPath, [process.argv[1]!, "--workflow", profile.name, "mount-check"], { timeoutMs: 10 * 60 * 1000 });
  if (!checked.ok) {
    console.error(`${new Date().toISOString()} the source changed and does not mount; the loop keeps the mount it had:`);
    console.error(checked.stdout || checked.stderr);
    return false;
  }
  // A supervised loop exits for its supervisor to start the new mount; only a
  // detached one starts its own replacement.
  if (options.supervised) {
    console.log(`${new Date().toISOString()} the source changed and mounts: exiting for the supervisor to start it`);
    return true;
  }
  const place = profilePaths(home, profile);
  const out = fs.openSync(path.join(path.dirname(place.pid), "daemon.log"), "a");
  const child = spawn(
    process.execPath,
    [process.argv[1]!, "--workflow", profile.name, "daemon", "--scheduled", "--every", options.every],
    { detached: true, stdio: ["ignore", out, out], env: process.env },
  );
  child.unref();
  writeDaemon(place.pid, { pid: child.pid ?? 0, workflow: profile.name, startedAt: new Date().toISOString() });
  console.log(`${new Date().toISOString()} the source changed: remounted as pid ${child.pid}`);
  return true;
}

program
  .command("mount-check", { hidden: true })
  .description("Internal: whether the selected profile assembles, for a daemon about to remount")
  .option("--config <file>", "assemble this config instead of config.yaml, as a change asked from the chat would be")
  .option("--all", "assemble every profile in the config, before replacing the shared config.yaml")
  .action(async (options: { config?: string; all?: boolean }) => {
    // A config asked for in the chat is mounted from its own file first, and
    // only one that mounts replaces config.yaml (S30).
    const config = options.config ? loadConfigFrom(home, fs.readFileSync(options.config, "utf-8")) : undefined;
    // What the loop refuses before it mounts anything, refused here too: a
    // config that passed this and then stopped the loop at boot would not boot.
    const schedule = [...configuredAutoUpdateProblems(config ?? loadConfig(home)), ...configuredChatProblems(config ?? loadConfig(home))];
    if (schedule.length > 0) {
      for (const problem of schedule) console.log(problem);
      process.exitCode = 1;
      return;
    }
    // This must take the same path as daemon startup. In particular, an
    // edited fork is rebuilt before assembly; assembling its installed copy
    // would approve a candidate that the replacement daemon cannot boot.
    const selectedProfiles = options.all ? Object.values(profiles(config ?? loadConfig(home), home)) : [selected(config)];
    for (const profile of selectedProfiles) {
      const assembled = config ? await assemble(profile, config) : await assemble(profile);
      if (assembled.ok) continue;
      for (const problem of assembled.problems) console.log(`${profile.name}: ${problem}`);
      process.exitCode = 1;
    }
  });

/** Makes a directly invoked foreground daemon visible to concurrent update. */
async function visibleForegroundDaemon(profile: Profile, drive: () => Promise<void>): Promise<void> {
  const config = loadConfig(home);
  const problems = configuredAutoUpdateProblems(config);
  if (problems.length > 0) throw new Error(problems.join("; "));
  await settlePendingDaemonUpdate(profile, "daemon", config);
  const schedule = beginAutoUpdateInvocation(home, profile.name, config);
  // A before update settles before this foreground process becomes the daemon;
  // an after update settles after its record is removed.
  await runDueBeforeDaemonUpdate(schedule, profile, config);
  const file = profilePaths(home, profile).pid;
  const release = claimDaemonBoundary(paths(home).pid);
  if (!release) throw new Error("the loop is starting or amy update is running; try again when it finishes");
  try {
    const shared = runningSharedDaemon();
    if (shared) throw new Error(`already running: pid ${shared.pid}, driving ${shared.workflow}`);
    const live = runningProfileDaemon(profile);
    if (live) throw new Error(`already running: pid ${live.record.pid}, driving ${live.record.workflow}`);
    writeDaemon(file, { pid: process.pid, workflow: profile.name, startedAt: new Date().toISOString() });
  } finally {
    release();
  }
  let afterUpdateClaimed: boolean;
  try {
    await drive();
  } finally {
    afterUpdateClaimed = reserveAfterDaemonUpdate(schedule, profile);
    // Do not erase a record a later owner wrote after this process ended.
    if (readDaemon(file)?.pid === process.pid) clearDaemon(file);
  }
  await finishAfterDaemonUpdate(schedule, profile, afterUpdateClaimed);
}

/** Keep a failed before-update due until a later start can settle it safely. */
async function runDueBeforeDaemonUpdate(schedule: { due: boolean; timing: "before" | "after" }, profile: Profile, config: AmyConfig): Promise<void> {
  if (!schedule.due || schedule.timing !== "before") return;
  markDaemonUpdate(home, profile.name);
  if (anotherProfileDaemonIsRunning(profile, config)) return;
  const claimed = takeDaemonUpdate(home, profile.name);
  if (!claimed || await scheduledUpdate() !== 0) {
    if (claimed) retryDaemonUpdate(home, profile.name);
    throw new Error("amy update failed");
  }
  finishDaemonUpdate(home, profile.name);
}

/** Reserve a due after-update while this foreground daemon is still visible. */
function reserveAfterDaemonUpdate(schedule: { due: boolean; timing: "before" | "after" }, profile: Profile): boolean {
  if (!schedule.due || schedule.timing !== "after") return false;
  // A concurrent start must see either this PID or our claimed update, never neither.
  markDaemonUpdate(home, profile.name);
  return takeDaemonUpdate(home, profile.name);
}

/** Run a foreground daemon's reserved after-update, retaining failure for retry. */
async function finishAfterDaemonUpdate(schedule: { due: boolean; timing: "before" | "after" }, profile: Profile, claimed: boolean): Promise<void> {
  if (!schedule.due || schedule.timing !== "after") return;
  if (!claimed || await scheduledUpdate() !== 0) {
    if (claimed) retryDaemonUpdate(home, profile.name);
    throw new Error("amy update failed");
  }
  finishDaemonUpdate(home, profile.name);
}

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

program
  .command("look")
  .description("Look at one piece of work now, rather than when it was next due")
  .argument("<workId>", "the work to bring forward, such as a ticket key")
  .action((workId: string) => {
    const place = profilePaths(home, selected());
    const queue = new FileQueue(place.queue);
    console.log(describePoke(workId, poke(queue, workId, new Date())));

    // Asking for it by name is what releases work the engine let go of at its
    // attempt ceiling: the marker is cleared here and nowhere else.
    const records = new FileStore<AnyRecord>(place.records);
    const record = records.load(workId);
    if (record?.gaveUp) {
      const { gaveUp: _released, ...rest } = record;
      records.save(rest);
    }
  });

program
  .command("discover", { hidden: true })
  .description("Put every piece of work the workflow can find onto the queue. `tick` does this first")
  .action(async () => {
    const queued = await (await engineOrExit()).discover();
    console.log(queued.length ? `queued ${queued.join(", ")}` : "nothing new to queue");
  });

program
  .command("tick")
  .description("Advance one piece of work by one move, discovering first")
  .action(async () => {
    const profile = selected();
    await aroundWorkflow(profile, async () => {
      const engine = await engineOrExit();
      // Discovery is every pass of the loop, so a single move looks first too:
      // work appears in the world rather than being handed over, and a tick
      // that only moved what was already queued would do nothing on an empty
      // queue while a ticket sat in the working status. Work already on the
      // queue is left alone — that includes work waiting out a backoff, which
      // is what keeps a cheap tick from trampling it.
      const found = await engine.discover();
      if (found.length > 0) console.log(`queued ${found.join(", ")}`);
      report((await engine.tick()) as TickResult);
    });
  });

program
  .command("run")
  .description("Keep advancing until nothing is due")
  .option("--max <n>", "stop after this many moves", "100")
  .action(async (options: { max: string }) => {
    const profile = selected();
    if (stopSwitch.isRequested()) {
      console.error(`the handbrake is on: ${stopSwitch.reason()}. Run \`amy start\` to release it.`);
      process.exitCode = 1;
      return;
    }
    await aroundWorkflow(profile, async () => {
      const engine = await engineOrExit();
      const max = Number(options.max);

      // Refusing the next tick is not stopping while an agent call is still
      // running, so the watcher ends the children the moment the brake is
      // pulled rather than at the next boundary.
      let stopping = false;
      const unwatch = stopSwitch.watch((reason) => {
        stopping = true;
        const killed = runner.killAll();
        console.error(`stopping: ${reason}${killed ? ` (ended ${killed} child process(es))` : ""}`);
      });

      try {
        for (let move = 0; move < max && !stopping; move += 1) {
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

const brief = program
  .command("brief")
  .description("The current statement of a feature, the sections its workflow asks for, and whether it is ready");

brief
  .command("show", { isDefault: true })
  .description("The current statement of a feature, as the workflow keeps it")
  .argument("<id>", "the brief id, as the workflow named it")
  .option("--json", "the same snapshot as data, for something else to render")
  .action(async (id: string, options: { json?: boolean }) => {
    const profile = selected();
    // A project whose brief/ phase is neither present nor declared is refused
    // at the mount, naming the folder; the answer here is that refusal.

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

brief
  .command("sections")
  .description("The sections the workflow's brief asks for, in the order grooming asks them, and which phase asks each")
  .option("--json", "the same list as data, for an agent grooming the brief")
  .action(async (options: { json?: boolean }) => {
    const opened = await openBrief(selected());
    if (!opened.ok) return refuseBrief(opened.why);
    const sections = sectionsOf(opened.briefs);
    if (options.json) {
      console.log(JSON.stringify({
        phases: opened.briefs.map((one) => ({
          phase: one.phase,
          workflow: one.workflow,
          sections: one.declaration?.sections ?? [],
          check: one.declaration?.check !== undefined,
        })),
        sections,
      }, null, 2));
      return;
    }
    for (const one of sections) console.log(`${one.phase === null ? "" : `${one.phase}/  `}${one.section}`);
  });

brief
  .command("write")
  .description("Answer one section of a brief through the brief port, replacing what it said before")
  .argument("<id>", "the brief id, as the workflow named it")
  .argument("<section>", "a section the workflow's brief declares")
  .argument("[body]", "the answer; read from standard input when omitted or `-`")
  .option("--explains <ids>", "the work ids the brief explains, comma-separated; kept from the stored brief when omitted")
  .action(async (id: string, section: string, text: string | undefined, options: { explains?: string }) => {
    const opened = await openBrief(selected());
    if (!opened.ok) return refuseBrief(opened.why);
    const declared = sectionsOf(opened.briefs).map((one) => one.section);
    if (!declared.includes(section)) {
      return refuseBrief(`\`${section}\` is not a section this workflow's brief declares — it asks for ${declared.map((name) => `\`${name}\``).join(", ")}`);
    }
    const body = text === undefined || text === "-" ? await readStandardInput() : text;
    if (body.trim() === "") return refuseBrief(`the answer to \`${section}\` is empty: a blank section is one the brief does not answer`);
    // Read, then written whole through the port, which replaces the brief
    // atomically: the section order is the declaration's, never the order
    // the answers happened to arrive in.
    const stored = await opened.store.get(id);
    const explains = options.explains !== undefined
      ? options.explains.split(",").map((one) => one.trim()).filter((one) => one !== "")
      : stored?.explains ?? [];
    const sections = withSection(opened.briefs, stored, section, body.replace(/\s+$/, ""));
    // A brief is written only when its text moved: the same answer again
    // keeps its revision, and its age for retirement.
    if (stored && !briefMoved(stored, sections, explains)) {
      console.log(`\`${section}\` already says that in ${stored.id}, revision ${stored.revision}: nothing written`);
      return;
    }
    const written = await opened.store.write({ id, sections, explains, at: new Date().toISOString() });
    console.log(`wrote \`${section}\` to ${written.id}, revision ${written.revision}`);
  });

brief
  .command("check")
  .description("Judge a brief against every phase's declared sections and check; exits non-zero while anything is refused")
  .argument("<id>", "the brief id, as the workflow named it")
  .option("--json", "the refusals and the next section to ask, as data")
  .action(async (id: string, options: { json?: boolean }) => {
    const opened = await openBrief(selected());
    if (!opened.ok) return refuseBrief(opened.why);
    let operations: ReturnType<typeof operationsOffered>;
    try {
      operations = operationsOffered(opened.mounted);
    } catch (error) {
      return refuseBrief((error as Error).message);
    }
    const result = await checkBrief(opened.briefs, id, await opened.store.get(id), operations);
    if (result.refusals.length > 0) process.exitCode = 1;
    if (options.json) {
      console.log(JSON.stringify({ ...result, ok: result.refusals.length === 0 }, null, 2));
      return;
    }
    if (result.revision === 0) console.log(`no brief \`${id}\` is stored yet: every section is still to answer`);
    if (result.refusals.length === 0) {
      console.log(`${id}, revision ${result.revision}: ready — every phase's check accepts it`);
      return;
    }
    for (const refusal of result.refusals) {
      const phase = refusal.phase === null ? "" : `${refusal.phase}/ `;
      console.log(`refused  ${phase}${refusal.section === undefined ? "" : `${refusal.section}: `}${refusal.rule}`);
    }
    if (result.next) console.log(`next: ${result.next.phase === null ? "" : `${result.next.phase}/ `}${result.next.section}`);
  });

/** The mounted brief port and what the selected workflow declares about briefs, or why there is neither. */
async function openBrief(
  profile: Profile,
): Promise<{ ok: true; store: BriefStore; briefs: readonly PhaseBrief[]; mounted: Mounted } | { ok: false; why: string }> {
  // Assembled, as `amy brief show` is: the store is a mounted port, and the
  // operations a check is handed are the ones this profile mounts.
  const assembled = await assemble(profile);
  if (!assembled.ok) return { ok: false, why: `amy could not start: ${assembled.problems.join("; ")}` };
  const store = assembled.mounted.ports.get("brief") as BriefStore | undefined;
  if (!store) return { ok: false, why: "nothing mounted the `brief` port" };
  const briefs = briefsOf(await workflowPluginOf(profile, assembled));
  if (!asksForABrief(briefs)) {
    return { ok: false, why: `the ${profile.name} workflow declares no brief: there are no sections to answer and no check to run` };
  }
  return { ok: true, store, briefs, mounted: assembled.mounted };
}

/** The workflow plugin a profile runs: the composed walk for a project, the configured workflow otherwise. */
async function workflowPluginOf(profile: Profile, assembled: Assembled): Promise<object | undefined> {
  if (assembled.ok && assembled.workflowPlugin) return assembled.workflowPlugin;
  const loaded = await loadMountable([profile.workflow], profile.name);
  return loaded.bySpec.get(profile.workflow);
}

function refuseBrief(why: string): void {
  console.error(why);
  process.exitCode = 1;
}

/** Everything piped to the command, for an answer too long for one argument. */
async function readStandardInput(): Promise<string> {
  if (process.stdin.isTTY) return "";
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) chunks.push(chunk as Buffer);
  return Buffer.concat(chunks).toString("utf-8");
}

program
  .command("status")
  .description("Show where every piece of work stands and what the queue holds")
  .option("--json", "the same thing as data, for something else to render")
  .option("--all", "include work that has finished")
  .action(async (options: { json?: boolean; all?: boolean }) => {
    const profile = selected();
    const place = profilePaths(home, profile);
    const queue = new FileQueue(place.queue, "id", false);

    // Mounted only to ask the workflow which of its states are waiting
    // ones. A mount that will not come up is exactly when somebody wants to
    // look, so the records are still reported, without that column.
    const assembled = await assembleForInspection(profile);
    const { usage, now } = await usageThenNow(() => subscriptionUsage(assembled));
    const workflow = assembled.ok ? assembled.mounted.workflow : undefined;
    const waiting = workflow?.waitingStates;
    const terminal = workflow?.terminalStates;

    const records = new FileStore<AnyRecord>(place.records, false)
      .all()
      .sort((a, b) => a.id.localeCompare(b.id));

    const live = runningProfileDaemon(profile)?.record;
    const held = stopSwitch.isRequested() ? stopSwitch.reason() : null;
    const notes = countIn(place.notes);
    const asked = countIn(place.needsInput);

    if (options.json) {
      console.log(JSON.stringify(snapshot(), null, 2));
      return;
    }

    // The page is a view of the same snapshot `--json` prints, drawn as
    // text: what a window shows has to be what the terminal would have said.
    console.log(renderText(statusView(snapshot(), { all: options.all ?? false, inbox: place.needsInput })));

    /**
     * Everything above, as data.
     *
     * Its own function because the two renderings share every fact and
     * neither should be able to drift from the other: what a page shows has
     * to be what the terminal would have said.
     */
    function snapshot(): StatusSnapshot {
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
          ...standingThroughCalls(workflow as Workflow | undefined, record),
        })),
        queue: {
          due: queue.ready(now).length,
          pending: queue.pending().length,
          running: queue.running().length,
          finished: queue.completed().length,
        },
        phases: phasesOf(profile.project, workflow),
        loop: live ?? null,
        paused: held,
        notes,
        needsInput: asked,
        usage,
      };
    }
  });

/** Readers run only for inspection; one unavailable subscription leaves the others visible. */
async function subscriptionUsage(assembled: Assembled): Promise<readonly SubscriptionUsage[]> {
  if (!assembled.ok) return [];
  const readers = [...(assembled.mounted.contributions.get(USAGE_COLLECTION)?.values() ?? [])] as UsageReader[];
  return await Promise.all(readers.map(async (reader) => ({
    subscription: reader.label,
    result: await readUsage(reader),
  })));
}

/** A reader's exception is a visible unavailable answer, never a failed status. */
async function readUsage(reader: UsageReader): Promise<UsageResult> {
  try {
    return await reader.read();
  } catch {
    return { unavailable: `${reader.label} usage is unavailable` };
  }
}

/** Where a record stands through the calls it is in, for a workflow that would mount. */
function standingThroughCalls(workflow: Workflow | undefined, record: WorkRecord): Pick<StatusRecord, "calls" | "attention" | "waitingInACall" | "lanes"> {
  const calls = callPath(record).slice(1).map((call) => ({ id: call.id, state: call.state, history: call.history }));
  const standing = workflow ? callStanding(workflow, record) : undefined;
  const lanes = workflow ? laneStanding(workflow, record).map((lane) => ({
    lane: lane.lane, id: lane.record.id, state: lane.record.state, ended: lane.ended, attention: lane.attention, history: lane.record.history,
  })) : [];
  const inCalls = calls.length > 0 || lanes.some((lane) => !lane.ended);
  return { calls, attention: standing?.attention ?? null, waitingInACall: standing ? inCalls && standing.waiting : null, ...(lanes.length > 0 ? { lanes } : {}) };
}

/** How many markdown files a directory holds, and none when there is none. */
function countIn(directory: string): number {
  if (!fs.existsSync(directory)) return 0;
  return fs.readdirSync(directory).filter((name) => name.endsWith(".md")).length;
}

program
  .command("budget")
  .description("What the agents have spent, and how close that is to the ceiling")
  .action(async () => {
    const parsed = parseBudget(configuredBudget());
    if (!parsed.ok) {
      for (const problem of parsed.problems) console.error(problem);
      process.exitCode = 1;
      return;
    }

    const profile = selected();
    const log = new FileEventLog(profilePaths(home, profile).log, undefined, build, false);
    const lines = await budgetReport({
      limits: parsed.limits,
      usage: async () => await subscriptionUsage(await assembleForInspection(profile)),
      events: (since) => log.read(since),
      clock: () => new Date(),
    });
    for (const line of lines) console.log(line);
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
  schema: ConfigSchema | undefined,
): Promise<{ message: string; profile?: string }> {
  if (workflow) {
    const name = workflowProfileName(picked.imported);
    const conflict = workflowProfileConflict(config.workflows, picked.imported);
    if (conflict) throw new Error(conflict);
    // The schema is what the package says it needs asked of it: the required
    // settings it carries an example for are the ones the operator starts
    // with, written in its own words. The rest is the schema's defaults, at
    // the mount.
    writeWorkflowProfile(home, name, picked.imported, config, schema ? profileSettingsFrom(schema) : {});
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
    added = await writeAddedEntry(home, config, outcome.picked, outcome.workflow, outcome.schema);
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
  // installed here, by the same command. A plugin add installs nothing extra: it
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

  await writeAddedFiles(home, picked.imported, added.profile);
  console.log("the machine boots: run `amy doctor`, then `amy tick`.");
}

/**
 * `amy add --fork`: the package's source becomes this profile's to edit, under
 * the package's own name (S11). The profile mounts the name if it did not
 * already, and the machine is booted with the fork in it before this says so.
 */
async function forkCommand(home: string, config: AmyConfig, spec: string, to: string | undefined): Promise<void> {
  const profile = selected(config);
  const specs = pluginList(config, profile);
  console.log(`forking ${spec} for the profile \`${profile.name}\`…`);
  const forked = await addFork({ runner, home, profile, specs, spec, cwd: process.cwd(), to, forks: config.forks || undefined });
  console.log(`forked ${forked.name}@${forked.record.base.version} into ${forked.directory}`);
  if (!specs.includes(forked.name)) {
    const own = profile.plugins.length > 0 ? profile.plugins : specs.filter((name) => !config.extraPlugins.includes(name));
    writeProfilePlugins(home, profile.name, [...own, forked.name], config);
    console.log(`the profile \`${profile.name}\` mounts ${forked.name}`);
  }
  const assembled = await assemble(selected(loadConfig(home)));
  if (!assembled.ok) {
    console.error("amy does not boot with the fork in it:");
    for (const problem of assembled.problems) console.error(`  ${problem}`);
    console.error(`Fix the fork at ${forked.directory}, or run \`amy remove ${forked.name}\` to go back to the published package.`);
    process.exitCode = 1;
    return;
  }
  console.log("the machine boots with it: edit the fork, and the next boot builds it.");
}

/** The files the package just added brings, for every profile that mounts it. */
async function writeAddedFiles(home: string, spec: string, profileName?: string): Promise<void> {
  const config = loadConfig(home);
  const known = Object.values(profiles(config, home));
  const mounting = known.filter((profile) =>
    profile.name === profileName || profile.workflow === spec || pluginList(config, profile).includes(spec),
  );
  const gathered = await gatherBuilt(config, mounting);
  for (const profile of mounting) {
    writeFiles(home, config, profile, gathered.contributions, commandOut);
    await runSetup(home, config, profile, gathered.contributions, commandOut, runner);
  }
}

/**
 * The contributions the update's own epilogue reads, taken after the update:
 * the register-time read ran against the file that may only now have moved,
 * and a config the update migrated refuses its old shape — the catch that
 * keeps `amy --help` alive on such a machine would otherwise leave the move
 * below with nothing to read.
 */
async function postUpdateContributions(): Promise<readonly Contribution[]> {
  return pluginContributions();
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
  /** What the package says it mounts with, for the settings it requires. */
  schema: ConfigSchema | undefined;
}

/** Boots the profile the write just created; a bare plugin was already probed alone. */
async function bootsAfterAdd(home: string, workflow: boolean, name?: string) {
  const config = loadConfig(home);
  if (Object.keys(config.workflows).length === 0) return { ok: true as const, problems: [] };
  return whatBoots(async () => {
    const profile = workflow ? resolveProfile(config, name, home) : { ok: true as const, profile: selected(config) };
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

  // The probe resolves through the root, the way the next boot will. A path
  // is installed there as a copy under the name its manifest carries, so a
  // workflow importing the core it is declared with resolves it there, and
  // not beside the directory it was added from, where there is none.
  const loaded = await importPluginBySpec(completed.imported, pluginsRootResolver(home, place.plugins));
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

  return { picked: completed, workflow: probe.workflow, before, schema: loaded.plugin.configSchema };
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
  const trialConfig = configWithout(config, profile, spec, carrier, home);

  // Extras mount under every profile. The trial is therefore all remaining
  // profiles, not merely the one selected by this invocation.
  for (const trialProfile of Object.values(profiles(trialConfig, home))) {
    const trialSlices = { ...pluginSlices(trialConfig, trialProfile, home) };
    delete trialSlices[spec];
    const loaded = await loadMountable(pluginList(trialConfig, trialProfile), trialProfile.name);
    if (loaded.problems.length > 0) return { ok: false, problems: loaded.problems };

    const outcome = await mount(
      loaded.plugins,
      trialSlices,
      {
        runner,
        now: () => new Date(),
        log: new FileEventLog(profilePaths(home, trialProfile).log, undefined, build),
        paths: hostPaths(profilePaths(home, trialProfile).base, trialProfile),
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
    Object.values(profiles(config, home)).some((candidate) =>
      candidate.workflow === spec || pluginList(config, candidate).includes(spec),
    );

  if (!carried) return `the config does not name ${spec}`;

  const live = carrier.place === "extras"
    ? Object.values(profiles(config, home)).map(runningProfileDaemon).find(Boolean)?.record
    : carrier.profile ? runningProfileDaemon(profiles(config, home)[carrier.profile] ?? profile)?.record : undefined;
  if (live) {
    return `${live.workflow} is running as pid ${live.pid}. Run \`amy stop\` first.`;
  }

  return pendingRemovalProblem(home, config, spec, carrier);
}

/** A removed profile must not leave its scheduled updater stranded. */
function pendingRemovalProblem(home: string, config: AmyConfig, spec: string, carrier: Carrier): string | undefined {
  const affected = carrier.profile ? profiles(config, home)[carrier.profile] : undefined;
  if (affected && hasDaemonUpdate(home, affected.name)) {
    return `${affected.name} has a scheduled daemon update. Let it settle before removing ${spec}.`;
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
  const target = profiles(config, home)[name] ?? profile;
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

async function removeCommand(home: string, spec: string, options: { keepState?: boolean; yes?: boolean } = {}): Promise<void> {
  const config = loadConfig(home);
  const runner = new NodeCommandRunner();

  // A profile and the package it names are one thing to the operator: `amy
  // remove ticket-to-qa` is the reverse of the `amy add` that wrote the block,
  // and asking two commands to undo one is how state gets left behind.
  const named = profiles(config, home)[spec];
  if (named) {
    await forgetProfile(home, config, named, options, {
      running: (profile) => runningProfileDaemon(profile)?.record,
      pendingUpdate: (profile) => hasDaemonUpdate(home, profile.name),
      uninstall: (workflow) => uninstallRemoved(runner, paths(home).plugins, workflow),
      confirm: confirmDeletion,
      say: (line) => console.log(line),
    });
    return;
  }

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
  if (profileForkDirectories(home, profile.name).has(spec)) {
    const dropped = await dropFork(runner, home, profile.name, spec, pluginList(config, profile));
    if (!dropped.ok) {
      console.error(dropped.problem);
      process.exitCode = 1;
      return;
    }
    console.log(`the profile \`${profile.name}\` resolves the published ${spec} again; the fork at ${dropped.directory} is yours and stays`);
    if (!installedPlugins(paths(home).plugins).includes(spec)) {
      console.log(`${spec} is not installed on this machine: \`amy add ${spec} --package\` installs it, or \`amy remove ${spec}\` again drops it from the profile`);
    }
    return;
  }
  const carrier = carriedBy(config, profile, spec, home);

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


/** Asks before deleting what somebody may still want, and answers no without a terminal. */
function confirmDeletion(directories: readonly string[]): boolean {
  if (!process.stdin.isTTY) {
    console.log("no terminal to ask on, so the state is kept; add --yes to delete it.");
    return false;
  }
  const answer = readAnswer(`Delete ${directories.length} director(ies) of state? [y/N] `).toLowerCase();
  return answer === "y" || answer === "yes";
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

/** The `budget` setting, from the plugin slice the relay is given. */
function configuredBudget(config: AmyConfig = loadConfig(home), profile: Profile = selected(config)): unknown {
  const slice = pluginSlices(config, profile)["@amykit/plugin-agent-relay"];
  return slice && typeof slice === "object" ? (slice as Record<string, unknown>).budget : undefined;
}

const pluginCommand = program.command("plugin").description("What is mounted, and what is not");

program
  .command("add")
  .description("Add a workflow or a plugin: install it, mount it, and check the machine boots")
  .argument("<spec>", "a package name, a URL, a git URL, or a path")
  .option("--fork", "take the package's source as a fork this profile owns, instead of the config's `add`")
  .option("--package", "install the published package, instead of the config's `add`")
  .option("--to <dir>", "the directory the fork goes into, instead of the config's `forks`")
  .action(async (spec: string, options: { fork?: boolean; package?: boolean; to?: string }) => {
    try {
      const config = loadConfig(home);
      if (addModeFor(config, options) === "fork") await forkCommand(home, config, spec, options.to);
      else await addCommand(home, spec);
    } catch (error) {
      console.error(error instanceof Error ? error.message : String(error));
      process.exitCode = 1;
    }
  });

program
  .command("remove")
  .description("Remove a workflow profile or a plugin, refusing what the machine would not survive")
  .argument("<spec>", "the profile, or the package name the config carries")
  .option("--keep-state", "keep the profile's records and queue")
  .option("--yes", "delete the profile's state without asking")
  .action(async (spec: string, options: { keepState?: boolean; yes?: boolean }) => {
    try {
      await removeCommand(home, spec, options);
    } catch (error) {
      console.error(error instanceof Error ? error.message : String(error));
      process.exitCode = 1;
    }
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
      const code = await updateCommand(home, runner, pkg, options.check === true, {
        mountProfiles: assembleProfiles,
        skillsInto: rewriteSkillsInto,
      });
      if (code === 0 && options.check !== true) {
        const moved = await postUpdateContributions();
        migrateRootFiles(home, moved, commandOut);
        await refreshPricesWhenStale(moved, commandEnvironment());
      }
      process.exitCode = code;
    } catch (error) {
      console.error(error instanceof Error ? error.message : String(error));
      process.exitCode = 1;
    }
  });

/** The migration's own words, printed the way an update says anything. */
function migrationSays(home: string): void {
  const said = migrateSettingsFile(home);
  for (const line of said.said) console.log(line);
  if (said.movedTo !== undefined) console.log(`kept   ${said.movedTo}`);
}

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
    installRoot?: string | Root;
  },
): Promise<number> {
    const release = updateBoundary(home);
    try {
    // Migrate old settings before parsing their new homes, but check legacy
    // profile PIDs first so a refusal leaves each live profile selectable.
    if (!check) {
      const legacyRefusal = refuseRecordedDaemon(home);
      if (legacyRefusal !== undefined) return legacyRefusal;
      migrationSays(home);
    }

    const refused = refuseWhileRunning(home);
    if (refused !== undefined) return refused;

    const where = await roots(home, runner);
    const installRoot = typeof deps.installRoot === "string" ? localRoot(deps.installRoot) : deps.installRoot ?? where.install;
    const { held: everything, release } = await survey(runner, home, installRoot);

    if (pkg !== undefined && !everything.some((held) => held.name === pkg)) {
      console.error(`no package named ${pkg} in either root`);
      return 1;
    }

    // A first-party name selects the release, not one package of it: the
    // group is released as one, and moving the CLI alone would leave its
    // plugins a version behind under a report that says they moved together.
    const selected = (one: Held): boolean =>
      pkg === undefined || one.name === pkg || (release !== undefined && firstParty(pkg) && firstParty(one.name));
    const moving = everything.filter((one) => selected(one) && one.want !== undefined && one.want !== one.have);

    reportWhatIsHeld(everything, installRoot);

    const unresolvedFailure = reportUnresolved(everything, selected);
    if (unresolvedFailure !== undefined) return unresolvedFailure;

    const pinned = reportRelease(everything, moving, release);
    const targets = forkTargets(home, Object.keys(profiles(loadConfig(home), home)), versionAfterUpdate(moving, everything, release?.version));
    if (check) return reportOnly(moving, pinned, targets);

    return withForksMerged(runner, targets, () => moving.length === 0 ? nothingMoved(deps, pinned) : moveEverything(runner, where.plugins, installRoot, moving, deps, release === undefined ? undefined : {
      version: release.version,
      heldPast: new Set(everything.filter((one) => firstParty(one.name) && compareVersions(one.have, release.version) > 0).map((one) => one.name)),
    }));
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
    installRoot: Root | undefined,
    moving: readonly Held[],
    deps: MountProfiles & SkillsInto,
    release?: { version: string; heldPast: ReadonlySet<string> },
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

    // What the moves depend on resolved through carets, which can land past
    // the release inside its minor. A machine holding two versions of the
    // group is not on the release, whatever the installs said.
    if (release !== undefined && movedList.moved.some((one) => firstParty(one.name))) {
      const strays = aboveRelease(copiesOnDisk(pluginsRoot, installRoot), release.version, release.heldPast);
      if (strays.length > 0) {
        console.error(`\nthe moves left first-party copies past the release ${release.version}:`);
        for (const stray of strays) console.error(`  ${stray.name}@${stray.version}  ${stray.at}`);
        await rollBackAll(runner, pluginsRoot, installRoot, movedList.moved);
        console.error("every move is rolled back; publish the release's dependencies at one version, or set the intent to the newest.");
        return 1;
      }
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

    if (release !== undefined) reportHeldBelow(belowRelease(copiesOnDisk(pluginsRoot, installRoot), release.version), release.version);
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
    installRoot: Root | undefined,
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
    const recorded = refuseRecordedDaemon(home);
    if (recorded !== undefined) return recorded;
    const live = Object.values(profiles(loadConfig(home), home)).map(runningProfileDaemon).map((daemon) => daemon?.record)
      .find((record) => record !== undefined);
    if (!live) return undefined;
    console.error(`the loop is running as pid ${live.pid}, driving ${live.workflow}. Run \`amy stop\` first.`);
    return 1;
}

/** Refuses a machine-level or legacy-profile daemon without parsing its config. */
function refuseRecordedDaemon(home: string): number | undefined {
    const live = running(paths(home).pid) ?? orphanedProfileDaemons(home)[0];
    if (!live) return undefined;
    console.error(`the loop is running as pid ${live.pid}, driving ${live.workflow}. Run \`amy stop\` first.`);
    return 1;
}

/** Daemons outlive a manual profile rename, so update discovers their PID files instead of trusting config. */
function orphanedProfileDaemons(home: string): Array<NonNullable<ReturnType<typeof running>>> {
  const profilesDirectory = path.join(home, "profiles");
  try {
    return fs.readdirSync(profilesDirectory, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => running(path.join(profilesDirectory, entry.name, "daemon.pid")))
      .filter((record): record is NonNullable<ReturnType<typeof running>> => record !== undefined);
  } catch (error: unknown) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw error;
  }
}

/** The one-line report of everything the two roots hold. */
function reportWhatIsHeld(everything: readonly Held[], installRoot: Root | undefined): void {
    const where = installRoot === undefined
      ? "the plugins root (running from a checkout, so no CLI half to move)"
      : installRoot.kind === "global"
        ? `both roots (the CLI's is npm's global prefix, ${installRoot.dir})`
        : "both roots";
    console.log(`${everything.length} package(s) in ${where}`);
    for (const one of everything) console.log(`  ${line(one)}`);
}

/**
 * Names the release the first-party packages move to, and an operator's
 * intent that holds the CLI below a newer one. Says whether it named a
 * pin, so the caller does not then report `nothing to move` over it.
 */
function reportRelease(everything: readonly Held[], moving: readonly Held[], release: Release | undefined): boolean {
    if (release === undefined) return false;
    const first = moving.filter((one) => firstParty(one.name));
    if (first.length > 0) {
      const from = (everything.find((one) => one.name === "@amykit/cli") ?? first[0]!).have;
      console.log(`\nrelease ${from} -> ${release.version}  (every @amykit/* package, @amykit/cli ${release.intent})`);
    }
    if (release.newest === undefined) return false;
    console.log(
      `\n@amykit/cli is held below the release by its registry intent ${release.intent}: ` +
        `${release.newest} is published, and ${release.intent} allows ${release.version}.`,
    );
    return true;
}

/** Names the first-party copies a third-party package's own range holds below the release. */
function reportHeldBelow(below: readonly Copy[], release: string): void {
    if (below.length === 0) return;
    console.log(`\n${below.length} first-party copy(ies) stay below ${release}, held there by the range of the package that carries them:`);
    for (const copy of below) console.log(`  ${copy.name}@${copy.version}  inside ${copy.within}`);
    console.log("They move when that package publishes a version for this release, or when it is removed.");
}

/** Every first-party copy the two roots hold; of a global prefix, only the CLI's own tree. */
function copiesOnDisk(pluginsRoot: string, installRoot: Root | undefined) {
    const install = installRoot === undefined
      ? []
      : installRoot.kind === "global"
        ? firstPartyCopies(installRoot.modules, "@amykit/cli")
        : firstPartyCopies(installRoot.modules);
    return [...firstPartyCopies(localRoot(pluginsRoot).modules), ...install];
}

/** Refuses an update whose registry target could not be resolved. */
function reportUnresolved(everything: readonly Held[], selected: (one: Held) => boolean): number | undefined {
    const unresolved = everything.filter(
      (one) => selected(one) && isRange(one.range) && one.want === undefined,
    );
    if (unresolved.length === 0) return undefined;
    console.error(`\ncould not resolve ${unresolved.length} package(s) from the registry; nothing moved:`);
    for (const one of unresolved) console.error(`  ${one.name} (${one.range})`);
    return 1;
}

/** `--check`'s whole answer: what would move, and nothing does. */
/** The version a package is at once this update lands: where it moves, where it stays, or the release. */
function versionAfterUpdate(moving: readonly Held[], everything: readonly Held[], release: string | undefined): (name: string) => string | undefined {
  return (name) => moving.find((one) => one.name === name)?.want
    ?? everything.find((one) => one.name === name)?.have
    ?? (release !== undefined && firstParty(name) ? release : undefined);
}

/**
 * Merges every fork before anything moves (S15). One conflict stops the whole
 * install, with each fork untouched and its marked merge beside it; otherwise
 * the merges are applied, and an update that then does not land puts every
 * fork back, so a fork is never half a version ahead of what is installed.
 */
async function withForksMerged(runner: CommandRunner, targets: readonly ForkTarget[], move: () => Promise<number>): Promise<number> {
  const merges = await mergeForks(runner, targets);
  const stopped = writeMarkedMerges(merges);
  if (stopped.length > 0) {
    console.error("amy update stopped, and nothing moved:");
    for (const line of stopped) console.error(`  ${line}`);
    console.error("Resolve the marked merge into the fork, or keep the fork as it is, then run `amy update` again.");
    return 1;
  }
  const held = merges.map((merge) => ({ fork: merge.fork, tree: readTree(merge.fork), record: readRecord(merge.fork) }));
  applyForkUpdates(merges);
  for (const merge of merges) console.log(`fork   ${merge.name} ${merge.from} → ${merge.to}, merged into ${merge.fork}`);
  const moved = await move();
  if (moved === 0) return 0;
  for (const one of held) {
    writeTree(one.fork, one.tree);
    if (one.record) writeRecord(one.fork, one.record);
  }
  return moved;
}

function reportOnly(moving: readonly Held[], pinned: boolean, forks: readonly ForkTarget[] = []): number {
    for (const fork of forks) console.log(`fork   ${fork.name} at ${fork.fork} would merge ${fork.version}`);
    if (moving.length === 0) {
      if (!pinned) console.log("nothing to move");
      return 0;
    }
    console.log(`\n${moving.length} package(s) would move. Run \`amy update\` to move them.`);
    return 0;
}

/** The zero-move case, which still has to answer for a machine that will not boot. */
async function nothingMoved(deps: MountProfiles & SkillsInto, pinned: boolean): Promise<number> {
    // The boot check runs even when nothing moved: an update on a machine
    // whose config already does not boot must say so, not report success
    // over a config the next tick would refuse.
    const booted = await deps.mountProfiles();
    if (!booted.ok) {
      reportUnbootable(booted.problems);
      console.error("\nNothing moved; the config is what needs attention.");
      return 1;
    }
    if (!pinned) console.log("nothing to move");
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
    installRoot: Root | undefined,
    moving: readonly Held[],
): Promise<{ moved: Held[]; failed: number }> {
    const moved: Held[] = [];
    let failed = 0;

    for (const one of moving) {
      console.log(`\nupdating ${one.name}: ${one.have} -> ${one.want}`);
      const root = one.root === "plugins" ? localRoot(pluginsRoot) : installRoot!;
      // A first-party entry names the release it moved to; a third-party
      // one keeps the range the operator wrote.
      const keep = firstParty(one.name) ? `^${one.want!}` : one.spec;
      const installed = await move(runner, root, one.name, keep, one.want!);
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
        ? await moduleProbeAt(root.modules, one.name, true)
        : one.name === "@amykit/cli"
          ? await cliProbe(root.modules, one.name)
          : await moduleProbeAt(root.modules, one.name, false);
      if (!probe.ok) {
        console.error(`${one.name} ${one.want} does not import:`);
        for (const problem of probe.problems) console.error(`  ${problem}`);
        const rolledBack = await restore(runner, root, one.name, one.have, one.spec);
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
  return moduleProbeAt(path.join(root, "node_modules"), name, needsPlugin, timeoutMs);
}

/** The same probe, for the copy under one `node_modules` — a global root's has no root above it. */
async function moduleProbeAt(
  modules: string,
  name: string,
  needsPlugin: boolean,
  timeoutMs = 10_000,
): Promise<{ ok: true } | { ok: false; problems: string[] }> {
  let entry: string;
  try {
    entry = packageEntrySpecifier(path.join(modules, ...name.split("/")));
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
async function cliProbe(modules: string, name: string): Promise<{ ok: true } | { ok: false; problems: string[] }> {
  const bin = binOf(modules, name);
  if (!bin) return { ok: false, problems: [`${name}: its manifest names no bin`] };
  return spawnedProbe(name, [bin, "--version"], 10_000);
}

/** The moved package's own bin file, by its manifest, or nothing. */
function binOf(modules: string, name: string): string | undefined {
  try {
    const directory = path.join(modules, ...name.split("/"));
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
    installRoot: Root | undefined,
    moved: readonly Held[],
): Promise<void> {
    for (const one of moved) {
      const root = one.root === "plugins" ? localRoot(pluginsRoot) : installRoot!;
      const rolledBack = await restore(runner, root, one.name, one.have, one.spec);
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
  for (const profile of Object.values(profiles(config, home))) {
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

    const loaded = await loadMountable(specs, profile.name);
    for (const spec of specs) {
      const found = loaded.bySpec.get(spec);
      const version = found ? pluginVersion(home, paths(home).plugins, spec) : undefined;
      console.log(`  ${found ? "ok  " : "FAIL"} ${spec}${version ? `  ${version}` : ""}`);
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
        `${[...mounted.contributions.values()].reduce((n, c) => n + c.size, 0)} contribution(s)`,
    );
    console.log(`workflow: ${mounted.workflow?.name ?? "none"}`);
  });

/** The settings one mounted thing would take, printed the way explain says them. */

const configCommand = program.command("config").description("What this machine would read, if it mounted");

configCommand
  .command("explain [plugin]")
  .description("Every setting the machine and its mounted plugins carry, with its type, default and why")
  .action(async (plugin: string | undefined) => {
    // The report is data in its own module, so the tests and the gate can
    // read what this prints without a subprocess. What the command adds is
    // only where the answer lands — stdout, or nothing worth an exit of 0.
    const config = loadConfig(home);
    // Where the installed packages are: the report reads the plugins this
    // machine mounted, not whichever copy a repo checkout sees first.
    const report = await explainReport(config, selected(config), plugin, pluginsRootResolver(home, paths(home).plugins), paths(home).plugins);
    for (const line of report.lines) console.log(line);
    if (report.refused !== undefined) {
      console.error(report.refused);
      process.exitCode = 1;
      return;
    }
    for (const problem of report.problems) {
      console.error(problem);
      process.exitCode = 1;
    }
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
  .option("--from <file>", "a Mermaid stateDiagram-v2 to copy in as the workflow's shape, every decision a stub")
  .action((name: string, options: { from?: string }) => {
    try {
      const directory = writeWorkflow(home, name, loadConfig(home), options.from);
      console.log(`wrote ${directory}`);
      console.log(`check it with: amy workflow check ${name}`);
    } catch (error) {
      console.error(error instanceof Error ? error.message : String(error));
      process.exitCode = 1;
    }
  });

workflowCommand
  .command("add")
  .description("Copy a workflow into one of your own, to call it there as code you own")
  .argument("<spec>", "a package amy installed, or a path to a workflow's directory or entry")
  .requiredOption("--into <name>", "the workflow of your own it is copied into, under ~/.amy/workflows")
  .action(async (spec: string, options: { into: string }) => {
    try {
      const added = await addWorkflowInto(home, spec, options.into, { runner: new NodeCommandRunner(), pluginsRoot: paths(home).plugins });
      const from = path.relative(path.join(workflowsDirectory(home), options.into), added.entry).split(path.sep).join("/");
      console.log(`copied into ${added.directory}`);
      console.log(`import { plugin } from "./${from}" in ${options.into}, and bind a call state to it with \`call(plugin)\``);
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
    const { problems, stubs, drawnNotWalked } = await inspectWorkflow(home, name, loadConfig(home), pluginsRootResolver(home, paths(home).plugins));
    // What is left to write is said whether or not the walk is green: for a
    // workflow still being written, it is the to-do list.
    for (const state of stubs) console.log(`not written yet: the decision for ${state}`);
    for (const edge of drawnNotWalked) console.log(`drawn, not walked: ${edge.from} → ${edge.to}`);
    if (problems.length === 0) {
      console.log(stubs.length > 0 ? `${name} mounts: ${stubs.length} decision(s) are not written yet` : `${name} settles: its walkthrough is green`);
      return;
    }
    console.error(`${name} does not pass its walkthrough:`);
    for (const problem of problems) console.error(`  ${problem}`);
    process.exitCode = 1;
  });

workflowCommand
  .command("export")
  .description("Print a workflow's diagram, which renders wherever Mermaid does")
  .argument("<name>", "the configured workflow to export")
  .option("--work <id>", "mark the state this piece of work is in")
  .option("--expand", "draw each call as the workflow it calls, for reading; with --work, mark the work at every depth")
  .action(async (name: string, options: { work?: string; expand?: boolean }) => {
    try {
      const config = loadConfig(home);
      const profile = profiles(config, home)[name];
      const record = options.work === undefined || !profile ? undefined : new FileStore<AnyRecord>(profilePaths(home, profile).records).load(options.work);
      if (options.work !== undefined && !record) throw new Error(`${name} keeps no record for ${options.work}`);
      process.stdout.write(await exportWorkflow(home, name, config, {
        ...(record ? { record: record as WorkRecord } : {}),
        ...(options.expand ? { expand: true } : {}),
        resolve: pluginsRootResolver(home, paths(home).plugins),
      }));
    } catch (error) {
      console.error(error instanceof Error ? error.message : String(error));
      process.exitCode = 1;
    }
  });

workflowCommand
  .command("list", { isDefault: true })
  .description("Every workflow this install can drive")
  .action(async () => {
    const config = loadConfig(home);
    const known = profiles(config, home);
    const asked = resolveProfile(config, undefined, home);
    const present = installedPlugins(paths(home).plugins);

    for (const profile of Object.values(known)) {
      const place = profilePaths(home, profile);
      const live = runningProfileDaemon(profile)?.record;
      const held = fs.existsSync(place.records) ? fs.readdirSync(place.records).length : 0;
      const marks = [
        asked.ok && asked.profile.name === profile.name ? "default" : "",
        live?.workflow === profile.name ? "running" : "",
        localWorkflow(home, profile.workflow) ? `local: ${workflowsDirectory(home)}` : "",
        present.includes(profile.workflow) || localWorkflow(home, profile.workflow) || isFilesystemWorkflow(profile.workflow) ? "" : "not installed",
      ].filter(Boolean);

      console.log(
        `${profile.name.padEnd(18)} ${profile.workflow.padEnd(32)} ` +
          `${String(held).padStart(3)} record(s)  ${marks.join(", ")}`,
      );
    }
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
    const profile = selected();
    const removed = new FileQueue(profilePaths(home, profile).queue).prune(days, now);
    const assembled = await assemble(profile);
    const briefStore = assembled.ok ? (assembled.mounted.ports.get("brief") as BriefStore | undefined) : undefined;
    const records = assembled.ok ? assembled.mounted.store : undefined;
    const terminal = assembled.ok ? new Set(assembled.mounted.workflow?.terminalStates ?? []) : new Set<string>();
    // A shared project brief may still explain live work in another phase.
    // Until the project has one cross-phase retention view, auto-pruning it
    // would be destructive; ordinary profile-local briefs retain their
    // existing retention behaviour.
    const retired = !profile.project && briefStore && records
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
    const recovered = new FileQueue(profilePaths(home, selected()).queue).recover(
      config.staleClaimMs,
      new Date(),
    );
    console.log(`returned ${recovered.length} abandoned item(s)`);
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

/**
 * The command line the configured machine brings, read before anything is
 * mounted.
 *
 * Declared here rather than compiled in, because the command a machine has is
 * the command it mounted: `amy btw` belongs to the errand it captures, `amy
 * note` to the one that writes plans, and a machine driving neither has
 * neither. Read at startup so `amy --help` is the truth about
 * this install rather than a list of everything this repository publishes.
 */
/**
 * What the profiles contribute, read once their forks are built. A process
 * keeps every module it imports, so a fork read here before its edit is built
 * would be the fork every later mount in this process sees. A fork that does
 * not build is the mount's to refuse, by name.
 */
async function gatherBuilt(config: AmyConfig, known: readonly Profile[]): Promise<Awaited<ReturnType<typeof gather>>> {
  for (const profile of known) {
    if (profileForkDirectories(home, profile.name).size > 0) await prepareForks(runner, home, paths(home).plugins, profile.name, pluginList(config, profile));
  }
  return gather(config, known, loadMountable);
}

async function pluginContributions(): Promise<readonly Contribution[]> {
  let gathered;
  try {
    const config = loadConfig(home);
    gathered = await gatherBuilt(config, Object.values(profiles(config, home)));
  } catch {
    // A config this process cannot read is `doctor`'s to report, not a reason
    // `amy --help` stops working: the command line that would say what is
    // wrong has to come up on the machine that is wrong.
    return [];
  }

  if (gathered.problems.length > 0) {
    for (const problem of gathered.problems) console.error(problem);
    process.exit(1);
  }

  return gathered.contributions;
}

/** A plugin command runs under one profile, or says which ones may run it. */
function profileForContribution(contribution: Contribution): { ok: true; profile: Profile } | { ok: false; problem: string } {
  const config = loadConfig(home);
  const asked = program.opts<{ workflow?: string }>().workflow;

  if (asked) {
    const resolution = resolveProfile(config, asked, home);
    if (!resolution.ok) return { ok: false, problem: resolution.problem };
    if (!contribution.profiles.some((profile) => profile.name === resolution.profile.name)) {
      return {
        ok: false,
        problem: `\`${contribution.owner}\` is not mounted by ${resolution.profile.name}; it runs on: ${contribution.profiles.map((profile) => profile.name).join(", ")}`,
      };
    }
    return { ok: true, profile: resolution.profile };
  }

  if (contribution.profiles.length === 1) return { ok: true, profile: contribution.profiles[0]! };

  return {
    ok: false,
    problem: `\`${contribution.owner}\` is mounted by ${contribution.profiles.map((profile) => profile.name).join(", ")}; name one with --workflow`,
  };
}

const commandOut = {
  line: (text = "") => console.log(text),
  error: (text: string) => console.error(text),
};

const contributions = await pluginContributions();

/** What a plugin command needs from this process, built once. */
function commandEnvironment(): CommandEnvironment {
  return {
    home,
    // Read when a command asks for it, not before the command runs: `amy
    // update` is the command that moves a config whose shape was retired, and
    // a config read at register time would refuse, before the migration, the
    // one command built to fix it.
    get config() {
      return loadConfig(home);
    },
    profileFor: profileForContribution,
    mount: async (profile) => {
      const assembled = await assemble(profile);
      return assembled.ok ? { ok: true, ports: assembled.mounted.ports } : { ok: false, problems: assembled.problems };
    },
    out: commandOut,
  };
}

register(program, contributions, commandEnvironment());

program
  .command("contract")
  .description("This install's whole contract, amy's services and every mounted plugin's operations, as an OpenAPI document")
  .option("--check", "say whether the contract builds, and refuse one that does not")
  .action(async (options: { check?: boolean }) => {
    // Read again, inside this command's own refusal: the startup read falls
    // back to no plugins at all so `--help` survives a broken config, and a
    // contract built from that fallback would certify an install it never read.
    let document: Record<string, unknown>;
    try {
      const config = loadConfig(home);
      const gathered = await gatherBuilt(config, Object.values(profiles(config, home)));
      // A plugin that would not import is missing from the contract, so a
      // contract built without it is not the install's.
      const unread = [...gathered.problems, ...gathered.unloaded];
      if (unread.length > 0) throw new Error(unread.join("; "));
      document = installContract(gathered.contributions);
    } catch (error) {
      console.error(`the contract does not build: ${error instanceof Error ? error.message : String(error)}`);
      process.exitCode = 1;
      return;
    }
    if (!options.check) {
      console.log(JSON.stringify(document, null, 2));
      return;
    }
    const paths = Object.values((document.paths ?? {}) as Record<string, Record<string, unknown>>);
    console.log(`the contract builds: ${paths.reduce((count, methods) => count + Object.keys(methods).length, 0)} operation(s)`);
  });

// So a name this machine does not provide can be answered here rather than by
// commander's bare "unknown command", which reads as if amy had never heard of
// it. Help and version still leave through the same door, with status 0.
program.exitOverride();
program.configureOutput({
  writeErr: (text) => {
    if (/^error: unknown command /.test(text)) return;
    process.stderr.write(text);
  },
});

program.parseAsync(process.argv).catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  // A command belongs to the workflow that provides it, so on a machine that
  // mounts none of them the command is not unknown to amy — it is absent, and
  // the fix is to mount the thing that carries it. Saying which one is the
  // config's job; saying where to look is this one's.
  const code = (error as { code?: string }).code;
  if (code === "commander.helpDisplayed" || code === "commander.version") {
    process.exitCode = 0;
    return;
  }
  const unknown = /^error: unknown command '([^']+)'/.exec(message);
  if (unknown) {
    console.error(`unknown command '${unknown[1]}': nothing on this machine provides it.`);
    console.error("`amy add <workflow>` mounts a workflow and the commands it provides; `amy setup` walks you through choosing one.");
    process.exitCode = 1;
    return;
  }
  // An operation's command has already said what it refused, in the manner
  // it was asked for; a second line would break a reader of --json.
  if (code !== ANSWERED) console.error(message);
  // An operation's command exits 2 for an argument commander refused, which
  // is an input refused; every other command keeps 1.
  const exit = (error as { exitCode?: unknown }).exitCode;
  process.exitCode = typeof exit === "number" && exit > 0 ? exit : 1;
});
