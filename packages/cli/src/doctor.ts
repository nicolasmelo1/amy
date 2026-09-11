import fs from "node:fs";
import path from "node:path";
import { CommandRunner, ConfigSchema, validateConfig } from "@amykit/core";
import { AmyConfig, Roster } from "./config.js";
import { strayState } from "./home.js";
import { LEGACY_DIRECTORIES } from "./profiles.js";
import { paths } from "./paths.js";

/** Monday through Friday. Saturday is 6 and Sunday is 0. */
function isWorkday(date: Date): boolean {
  const day = date.getUTCDay();
  return day >= 1 && day <= 5;
}

export interface Check {
  label: string;
  ok: boolean;
  detail?: string;
}

export interface DoctorDeps {
  /** Where amy keeps its state, machine-wide. */
  home: string;
  config: AmyConfig;
  runner: CommandRunner;
  env: NodeJS.ProcessEnv;
  now: Date;
  readRoster: (home: string) => Roster;
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
    ...pluginSettings(deps),
    roster(deps),
    ...leftBehind(deps),
    apiKey(deps),
    ...(await tools(deps)),
    ...(await hermes(deps)),
    ...checkouts(deps),
  ];
}

function configFile({ home }: DoctorDeps): Check {
  const file = paths(home).config;
  return { label: "config file", ok: fs.existsSync(file), detail: file };
}

function configContents({ config }: DoctorDeps): Check[] {
  return [
    {
      label: "repos configured",
      ok: config.repos.length > 0,
      detail: config.repos.join(", "),
    },
    { label: "gate configured", ok: Object.keys(config.gate).length > 0 },
    {
      label: "a notification channel is on",
      ok: config.notify.inbox || Boolean(config.notify.hermes),
    },
  ];
}

/**
 * Each plugin's own settings, against the schema that plugin declared.
 *
 * A plugin with no slice configured is fine: its defaults apply. A slice for
 * a plugin this build does not have is not fine, because it is a setting
 * somebody wrote expecting it to do something.
 */
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

function roster({ home, now, readRoster }: DoctorDeps): Check {
  try {
    const current = readRoster(home);
    // Confirmed today is the claim: Monday through Friday the date has to be
    // today's, and a weekend holds — people do not confirm a roster they are
    // not using, and stalling on one nobody asked for would be the machine
    // inventing a ritual.
    const confirmed =
      !isWorkday(now) || current.confirmedOn === now.toISOString().slice(0, 10);
    return {
      label: "roster confirmed for today",
      ok: confirmed,
      detail: confirmed
        ? ""
        : `last confirmed ${current.confirmedOn}, run \`amy roster confirm\``,
    };
  } catch (error) {
    return {
      label: "roster",
      ok: false,
      detail: error instanceof Error ? error.message : String(error),
    };
  }
}

function apiKey({ env }: DoctorDeps): Check {
  return { label: "LINEAR_API_KEY", ok: Boolean(env.LINEAR_API_KEY) };
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

function checkouts({ config }: DoctorDeps): Check[] {
  return config.repos.map((repo) => {
    const checkout = path.join(config.workspaceRoot, repo.slice(repo.indexOf("/") + 1));
    return {
      label: `checkout ${repo}`,
      ok: fs.existsSync(path.join(checkout, ".git")),
      detail: checkout,
    };
  });
}
