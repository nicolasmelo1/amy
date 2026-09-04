import fs from "node:fs";
import path from "node:path";
import { CommandRunner, validateConfig } from "@amy/core";
import { hermesTargetIsKnown } from "@amy/plugin-notify-hermes";
import { Roster, isConfirmedFor } from "@amy/workflow-ticket-to-qa";
import { AmyConfig } from "./config.js";
import { PLUGIN_SCHEMAS } from "./schemas.js";
import { paths } from "./paths.js";

export interface Check {
  label: string;
  ok: boolean;
  detail?: string;
}

export interface DoctorDeps {
  root: string;
  config: AmyConfig;
  runner: CommandRunner;
  env: NodeJS.ProcessEnv;
  now: Date;
  readRoster: (root: string) => Roster;
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
    apiKey(deps),
    ...(await tools(deps)),
    ...(await hermes(deps)),
    ...checkouts(deps),
  ];
}

function configFile({ root }: DoctorDeps): Check {
  const file = paths(root).config;
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
function pluginSettings({ config }: DoctorDeps): Check[] {
  const checks: Check[] = [];

  for (const [plugin, given] of Object.entries(config.plugins)) {
    const schema = PLUGIN_SCHEMAS[plugin];
    if (!schema) {
      checks.push({
        label: `settings for ${plugin}`,
        ok: false,
        detail: "this build has no such plugin",
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

function roster({ root, now, readRoster }: DoctorDeps): Check {
  try {
    const current = readRoster(root);
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
