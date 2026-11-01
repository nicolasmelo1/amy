import fs from "node:fs";
import path from "node:path";
import { Check, checkoutFor, CommandRunner, ConfigSchema, Workflow, validateConfig } from "@amykit/core";
import { AmyConfig, configuredAutoUpdateProblems } from "./config.js";
import { strayState } from "./home.js";
import { LEGACY_DIRECTORIES } from "./profiles.js";
import { paths } from "./paths.js";

export type { Check } from "@amykit/core";

export interface DoctorDeps {
  /** Where amy keeps its state, machine-wide. */
  home: string;
  config: AmyConfig;
  runner: CommandRunner;
  env: NodeJS.ProcessEnv;
  now: Date;
  /** Where the command was typed, which is not where amy keeps anything. */
  cwd: string;
  /**
   * What each plugin said its settings look like, by package name.
   *
   * Handed in rather than looked up, because the only honest source is the
   * plugins this install actually loaded. A table compiled in here would
   * describe a machine other than the one being diagnosed.
   */
  schemas: Readonly<Record<string, ConfigSchema>>;
  /**
   * The notification port, if this install mounted one.
   *
   * Handed in for the same reason the schemas are: whether a target is
   * reachable is the mounted channel's own knowledge, not something the host
   * re-derives by importing one notifier's reader. Undefined means no channel
   * was mounted, which is its own answer.
   */
  notifyPort?: object;
  /**
   * The gate port, if this install mounted one; absent means no workflow
   * here hands work to a gate, and the machine is asked nothing about how
   * work gets vouched for.
   */
  gatePort?: object;
  /**
   * What each mounted plugin reads from the process's environment, by package
   * name. The doctor asks exactly these, one variable at a time; a machine
   * that mounted none of them is asked none of them.
   */
  environments?: Readonly<Record<string, readonly string[]>>;
  /**
   * The conversation port, if this install mounted one.
   *
   * Asked for its own checks for the same reason the notification port is
   * asked whether its target is reachable: which scopes a Slack token needs
   * is the adapter's knowledge, and the host imports no adapter to learn it.
   */
  conversationPort?: object;
  /** The selected workflow's declared external-write surface, if it mounted. */
  workflow?: Workflow;
}

/**
 * Everything the machine depends on, asked one at a time.
 *
 * A list of small checks rather than one long function, so adding a
 * dependency to worry about costs one entry and the whole thing stays
 * readable and testable. It returns the answers instead of printing them,
 * which is why it can be tested at all.
 */
export async function diagnose(deps: DoctorDeps): Promise<Check[]> {
  return [
    configFile(deps),
    ...configContents(deps),
    autoUpdateSettings(deps.config),
    ...pluginSettings(deps),
    workflowWrites(deps.workflow),
    ...leftBehind(deps),
    ...environment(deps),
    ...(await tools(deps)),
    ...(await hermes(deps)),
    ...(await conversation(deps)),
    ...checkouts(deps),
    ...worktrees(deps),
  ];
}

function configFile({ home }: DoctorDeps): Check {
  const file = paths(home).config;
  return { label: "config file", ok: fs.existsSync(file), detail: file };
}

function configContents({ config, gatePort }: DoctorDeps): Check[] {
  const checks: Check[] = [
    {
      label: "repos configured",
      ok: config.repos.length > 0,
      detail: config.repos.join(", "),
    },
    {
      label: "a notification channel is on",
      ok: config.notify.inbox || Boolean(config.notify.hermes),
    },
  ];

  // A gate's commands are the machine's only while a workflow here hands
  // work to one: a machine that mounted no gate cannot vouch for a change
  // either way, and a checklist it can never satisfy is a red dot the
  // operator learns to scroll past.
  if (gatePort) {
    checks.push({ label: "gate configured", ok: Object.keys(config.gate).length > 0 });
  }

  return checks;
}

function workflowWrites(workflow: Workflow | undefined): Check {
  if (!workflow) return { label: "workflow write surface", ok: true, detail: "no workflow assembled" };
  const tracker = workflow.trackerWrites ?? [];
  const codeHost = workflow.codeHostWrites ?? [];
  return {
    label: "workflow write surface",
    ok: true,
    detail: tracker.length === 0 && codeHost.length === 0
      ? "read-only: it cannot write the tracker or code host"
      : `tracker: ${tracker.join(", ") || "none"}; code host: ${codeHost.join(", ") || "none"}`,
  };
}

/**
 * Each plugin's own settings, against the schema that plugin declared.
 *
 * A plugin with no slice configured is fine: its defaults apply. A slice for
 * a plugin this build does not have is not fine, because it is a setting
 * somebody wrote expecting it to do something.
 */
function autoUpdateSettings(config: AmyConfig): Check {
  const problems = configuredAutoUpdateProblems(config);
  return {
    label: "auto update settings",
    ok: problems.length === 0,
    detail: problems.join("; "),
  };
}

function pluginSettings({ config, schemas }: DoctorDeps): Check[] {
  const checks: Check[] = [];

  for (const [plugin, given] of Object.entries(config.plugins)) {
    const schema = schemas[plugin];
    if (!schema) {
      checks.push({
        label: `settings for ${plugin}`,
        ok: false,
        detail: "nothing mounted declares these settings",
      });
      continue;
    }

    const result = validateConfig(plugin, schema, given);
    checks.push({
      label: `settings for ${plugin}`,
      ok: result.ok,
      detail: result.ok ? "" : result.problems.join("; "),
    });
  }

  return checks;
}

/**
 * State written by a version that kept one pair of directories per install.
 *
 * Reported rather than moved: it is somebody's work in flight, and the one
 * command that puts it where the new layout looks is cheaper to read than a
 * migration that ran without being asked. A name the current config declares
 * is a profile, not a leftover — the operator chose it, and its directory is
 * where this layout looks.
 */
function leftBehind({ home, cwd, config }: DoctorDeps): Check[] {
  const base = paths(home).base;
  const stray = strayState(cwd, base);

  const here: Check[] = stray
    ? [
        {
          label: "state in the working directory",
          ok: false,
          detail: `${stray} is not read any more; amy keeps everything in ${base}`,
        },
      ]
    : [];

  return here.concat(
    Object.entries(LEGACY_DIRECTORIES)
      .filter(([old]) => fs.existsSync(path.join(base, old)))
      .filter(([old]) => !(old in config.workflows))
      .map(([old, now]) => ({
        label: `state left in ${old}`,
        ok: false,
        detail: `run \`amy init\`, then: mv ${path.join(base, old)} ${path.join(base, now)}`,
      })),
  );
}

/**
 * What the machine's mounted plugins read from the process's environment,
 * one variable at a time: the plugin that needs it names it, and a machine
 * that mounted none of them carries none of these checks at all.
 */
function environment({ environments, env }: DoctorDeps): Check[] {
  return [...new Set(Object.values(environments ?? {}).flat())]
    .sort()
    .map((name) => ({ label: name, ok: Boolean(env[name]) }));
}

const REQUIRED_TOOLS: readonly [string, readonly string[]][] = [
  ["gh", ["auth", "status"]],
  ["claude", ["--version"]],
  ["git", ["--version"]],
];

async function tools({ runner }: DoctorDeps): Promise<Check[]> {
  const checks: Check[] = [];

  for (const [tool, args] of REQUIRED_TOOLS) {
    const result = await runner.run(tool, args, { timeoutMs: 30_000 });
    checks.push({
      label: `${tool} available`,
      ok: result.ok,
      detail: result.ok ? "" : (result.stderr.split("\n")[0] ?? ""),
    });
  }

  return checks;
}

/**
 * Whether the notification port this install mounted can reach the target.
 *
 * The question is asked of the port, not of one notifier's reader: the host
 * carrying `@amykit/plugin-notify-hermes` in its dependencies was the host
 * holding a plugin's knowledge, and the machine installing only the command
 * paid for a package it had never chosen. A mount with no channel is an
 * install that has not turned one on — the check above already says so —
 * and nothing is asked of a port that was never mounted.
 */
type Reachable = { isReachable(target: string): Promise<boolean> | boolean };

async function hermes({ config, notifyPort }: DoctorDeps): Promise<Check[]> {
  const target = config.notify.hermes;
  if (!target) return [];
  if (!notifyPort) {
    return [
      {
        label: `hermes target ${target}`,
        ok: false,
        detail: "no notification channel is mounted, so nothing could ask whether it is reachable",
      },
    ];
  }

  const reachable = notifyPort as Reachable;
  try {
    const known = await reachable.isReachable(target);
    return [
      {
        label: `hermes target ${target}`,
        ok: known,
        detail: known ? "" : "hermes does not have this target configured",
      },
    ];
  } catch (error) {
    return [
      {
        label: `hermes target ${target}`,
        ok: false,
        detail: error instanceof Error ? error.message : "the channel could not be asked",
      },
    ];
  }
}

/** A conversation adapter that can say whether it can reach its thread. */
type SelfChecking = { checks(): Promise<Check[]> };

async function conversation({ conversationPort }: DoctorDeps): Promise<Check[]> {
  const port = conversationPort as Partial<SelfChecking> | undefined;
  if (typeof port?.checks !== "function") return [];
  try {
    return await port.checks();
  } catch (error) {
    return [
      {
        label: "conversation",
        ok: false,
        detail: error instanceof Error ? error.message : "the conversation could not be asked",
      },
    ];
  }
}

function checkouts({ config }: DoctorDeps): Check[] {
  // The same function the machine resolves through, so what the doctor names
  // is the root that was actually asked rather than a second derivation.
  return config.repos.map((repo) => {
    const checkout = checkoutFor(
      { workspaceRoot: config.workspaceRoot, checkouts: config.checkouts, defaultBranch: config.defaultBranch },
      repo,
    );
    const asked = repo in config.checkouts ? `its own root (${checkout})` : `the workspace root (${config.workspaceRoot})`;
    return {
      label: `checkout ${repo}`,
      ok: fs.existsSync(path.join(checkout, ".git")),
      detail: `asked ${asked}`,
    };
  });
}

/**
 * Both roots, named together: where the standing checkouts live, and where
 * the isolated trees do.
 *
 * An install migrating to worktrees keeps its existing checkouts exactly as
 * they are — the worktree manager never touches one — so `amy doctor`
 * reporting both is how an operator sees that nothing moved under them.
 */
function worktrees({ config, home }: DoctorDeps): Check[] {
  const root = config.worktrees.root || path.join(home, "worktrees");
  return [
    {
      label: "worktrees root",
      ok: true,
      detail: `${root} (checkouts stay in ${config.workspaceRoot})`,
    },
  ];
}
