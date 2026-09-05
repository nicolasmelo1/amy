import fs from "node:fs";
import path from "node:path";
import { CommandRunner, ConfigSchema, validateConfig } from "@amykit/core";
import { hermesTargetIsKnown } from "@amykit/plugin-notify-hermes";
import { Roster, isConfirmedFor } from "@amykit/workflow-ticket-to-qa";
import { AmyConfig } from "./config.js";
import { strayState } from "./home.js";
import { LEGACY_DIRECTORIES } from "./profiles.js";
import { paths } from "./paths.js";

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
      ok: config.notify.tracker || config.notify.inbox || Boolean(config.notify.hermes),
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
 * migration that ran without being asked.
 */
function leftBehind({ home, cwd }: DoctorDeps): Check[] {
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
    const confirmed = isConfirmedFor(current, now);
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

async function hermes({ config, runner }: DoctorDeps): Promise<Check[]> {
  const target = config.notify.hermes;
  if (!target) return [];

  const result = await runner.run("hermes", ["send", "--list", "--json"], { timeoutMs: 60_000 });

  if (!result.ok) {
    const detail = result.stderr.split("\n")[0] ?? "hermes send --list failed";
    return [{ label: `hermes target ${target}`, ok: false, detail }];
  }

  try {
    const known = hermesTargetIsKnown(JSON.parse(result.stdout), target);
    return [
      {
        label: `hermes target ${target}`,
        ok: known,
        detail: known ? "" : "hermes does not have this target configured",
      },
    ];
  } catch {
    return [
      {
        label: `hermes target ${target}`,
        ok: false,
        detail: "could not read the target listing from hermes",
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
