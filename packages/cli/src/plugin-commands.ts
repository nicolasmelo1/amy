import fs from "node:fs";
import path from "node:path";
import { Command, Option } from "commander";
import {
  Check,
  CommandContext,
  CommandOutput,
  Plugin,
  PluginCheck,
  PluginCommand,
  PluginFile,
  PortKind,
  validateConfig,
} from "@amykit/core";
import { AmyConfig } from "./config.js";
import { LoadResult } from "./loader.js";
import { Profile, directoriesFor } from "./profiles.js";
import { pluginList, pluginSlices } from "./slices.js";

/**
 * The names the host owns on every install.
 *
 * A plugin cannot take one: `amy doctor` that a package can replace is a
 * command whose meaning depends on what somebody installed, and the first
 * symptom would be a machine that stopped answering.
 */
export const BUILT_IN_COMMANDS: readonly string[] = [
  "init", "doctor", "add", "remove", "update", "start", "stop", "status",
  "tick", "run", "look", "queue", "budget", "brief", "skills", "workflow", "plugin",
  // Hidden from `amy --help`, and still the host's: a script's way to queue
  // work without moving any.
  "discover",
];

/** Everything one package brings to the command line. */
export interface Contribution {
  /** The package's own name: what `amy --help` marks the commands with. */
  readonly owner: string;
  readonly plugin: Plugin;
  /** Every configured profile that mounts it, which is who may run it. */
  readonly profiles: readonly Profile[];
  readonly commands: readonly PluginCommand[];
  readonly checks: readonly PluginCheck[];
  readonly files: readonly PluginFile[];
}

export interface Gathered {
  readonly contributions: readonly Contribution[];
  /** Names two owners both claim: refused before anything runs. */
  readonly problems: readonly string[];
}

/**
 * Everything the configured profiles mount, read without mounting any of it.
 *
 * A command has to answer while the machine will not come up, so the modules
 * are imported and their declarations read; nothing here calls `register`.
 * A package that will not import is left out and named by `amy doctor`, not
 * refused here: one missing plugin must not take the whole command line with
 * it.
 */
export async function gather(
  config: AmyConfig,
  known: readonly Profile[],
  load: (specs: readonly string[]) => Promise<LoadResult>,
): Promise<Gathered> {
  const byProfile = new Map<string, readonly string[]>(known.map((profile) => [profile.name, pluginList(config, profile)]));
  const specs = [...new Set([...byProfile.values()].flat())];
  const loaded = await load(specs);

  const contributions = new Map<string, Contribution>();
  for (const spec of specs) {
    const plugin = loaded.bySpec.get(spec);
    if (!plugin) continue;

    const mounted = known.filter((profile) => (byProfile.get(profile.name) ?? []).includes(spec));
    const existing = contributions.get(plugin.name);
    contributions.set(plugin.name, {
      owner: plugin.name,
      plugin,
      profiles: [...(existing?.profiles ?? []), ...mounted],
      commands: plugin.commands ?? existing?.commands ?? [],
      checks: plugin.checks ?? existing?.checks ?? [],
      files: plugin.files ?? existing?.files ?? [],
    });
  }

  return { contributions: [...contributions.values()], problems: conflicts([...contributions.values()]) };
}

/** A command name belongs to one owner, and the host's names are not on offer. */
function conflicts(contributions: readonly Contribution[]): string[] {
  const owners = new Map<string, string>();
  const problems: string[] = [];

  for (const contribution of contributions) {
    for (const command of contribution.commands) {
      if (BUILT_IN_COMMANDS.includes(command.name)) {
        problems.push(
          `${contribution.owner} declares \`amy ${command.name}\`, which this host already owns; a plugin cannot replace a built-in command`,
        );
        continue;
      }
      const held = owners.get(command.name);
      if (held && held !== contribution.owner) {
        problems.push(`\`amy ${command.name}\` is declared by both ${held} and ${contribution.owner}; a name is owned once`);
        continue;
      }
      owners.set(command.name, contribution.owner);
    }
  }

  return problems;
}

/** What a command needs from the process that registered it. */
export interface CommandEnvironment {
  readonly home: string;
  readonly config: AmyConfig;
  /** The profile a contribution should run under, or why there is not one. */
  profileFor(contribution: Contribution): { ok: true; profile: Profile } | { ok: false; problem: string };
  /** The mounted ports of one profile, or why the machine did not come up. */
  mount(profile: Profile): Promise<{ ok: true; ports: ReadonlyMap<PortKind, object> } | { ok: false; problems: readonly string[] }>;
  readonly out: CommandOutput;
}

/**
 * Registers every plugin command under its own name, marked with its package.
 *
 * `amy roster` is the workflow's command once ticket-to-qa is mounted, and it
 * is nobody's before that: what a machine can do is what it mounted, which is
 * the difference between a framework and a program with plugins attached.
 */
export function register(program: Command, contributions: readonly Contribution[], env: CommandEnvironment): void {
  for (const contribution of contributions) {
    for (const command of contribution.commands) declare(program, command, contribution, env);
  }
}

function declare(
  parent: Command,
  declaration: PluginCommand,
  contribution: Contribution,
  env: CommandEnvironment,
  inheritedMount = false,
): void {
  // A subcommand runs its own action, so `mount: true` on the parent has to
  // reach it: `amy worktrees list` is one command in two words.
  const mount = inheritedMount || declaration.mount === true;
  const command = parent
    .command(declaration.name, declaration.default ? { isDefault: true } : undefined)
    .description(`${declaration.description} (from ${contribution.owner})`);

  withArguments(command, declaration);
  withFlags(command, declaration);

  for (const sub of declaration.subcommands ?? []) {
    declare(command, sub, contribution, env, mount);
  }

  command.action(async (...passed: unknown[]) => {
    const invoked = passed[passed.length - 1] as Command;
    await run(declaration, contribution, env, invoked, mount);
  });
}

/** The positional arguments, in the order the command types them. */
function withArguments(command: Command, declaration: PluginCommand): void {
  for (const argument of declaration.args ?? []) {
    const shape = argument.variadic ? `<${argument.name}...>` : argument.optional ? `[${argument.name}]` : `<${argument.name}>`;
    command.argument(shape, argument.description ?? "");
  }
}

/** The flags, written the way the help prints them. */
function withFlags(command: Command, declaration: PluginCommand): void {
  for (const flag of declaration.flags ?? []) {
    const option = new Option(flag.flags, flag.description ?? "");
    if (flag.default !== undefined) option.default(flag.default);
    command.addOption(option);
  }
}

async function run(
  declaration: PluginCommand,
  contribution: Contribution,
  env: CommandEnvironment,
  invoked: Command,
  mount: boolean,
): Promise<void> {
  if (!declaration.run) {
    invoked.help();
    return;
  }

  const chosen = env.profileFor(contribution);
  if (!chosen.ok) {
    env.out.error(chosen.problem);
    process.exitCode = 1;
    return;
  }

  const ports = mount ? await mounted(declaration, chosen.profile, env) : undefined;
  if (mount && !ports) return;

  const context: CommandContext = {
    state: stateDirectory(env.home, chosen.profile),
    home: env.home,
    settings: settingsFor(contribution, chosen.profile, env.home, env.config),
    args: invoked.args,
    options: invoked.opts(),
    out: env.out,
    ...(ports ? { ports } : {}),
  };

  await declaration.run(context);
}

/**
 * A `mount: true` command gets the ports, or the reason the machine did not
 * come up. Never a half-built context: a command that needs the machine and
 * has half of it would report something other than why it is broken.
 */
async function mounted(
  declaration: PluginCommand,
  profile: Profile,
  env: CommandEnvironment,
): Promise<ReadonlyMap<PortKind, object> | undefined> {
  const outcome = await env.mount(profile);
  if (outcome.ok) return outcome.ports;

  env.out.error(`\`amy ${declaration.name}\` needs the machine ${profile.name} drives, which did not come up: ${outcome.problems.join("; ")}`);
  process.exitCode = 1;
  return undefined;
}

/** The directory one profile owns: its records and queue live one level down. */
function stateDirectory(home: string, profile: Profile): string {
  return path.join(home, path.dirname(directoriesFor(profile).records));
}

/** Runs one command a plugin brought, by the path it is typed under. */
export async function runNamed(
  contributions: readonly Contribution[],
  typed: readonly string[],
  args: readonly string[],
  options: Readonly<Record<string, string | boolean | undefined>>,
  env: CommandEnvironment,
): Promise<boolean> {
  const found = lookup(contributions, typed);
  if (!found) return false;

  const chosen = env.profileFor(found.contribution);
  if (!chosen.ok) throw new Error(chosen.problem);

  const mount = mountAlong(contributions, typed);
  const ports = mount ? await mounted(found.command, chosen.profile, env) : undefined;
  if (mount && !ports) return false;

  await found.command.run?.({
    state: stateDirectory(env.home, chosen.profile),
    home: env.home,
    settings: settingsFor(found.contribution, chosen.profile, env.home, env.config),
    args,
    options,
    out: env.out,
    ...(ports ? { ports } : {}),
  });
  return true;
}

/** Whether a command, or a parent it is typed under, needs the mounted ports. */
function mountAlong(contributions: readonly Contribution[], typed: readonly string[]): boolean {
  const [name, ...rest] = typed;
  const owner = contributions.find((contribution) => contribution.commands.some((command) => command.name === name));
  let command = owner?.commands.find((candidate) => candidate.name === name);
  let mount = command?.mount === true;
  for (const step of rest) {
    command = command?.subcommands?.find((candidate) => candidate.name === step);
    mount = mount || command?.mount === true;
  }
  return mount;
}

function lookup(
  contributions: readonly Contribution[],
  typed: readonly string[],
): { contribution: Contribution; command: PluginCommand } | undefined {
  const [name, ...rest] = typed;
  const owner = contributions.find((contribution) => contribution.commands.some((command) => command.name === name));
  let command = owner?.commands.find((candidate) => candidate.name === name);
  for (const step of rest) command = command?.subcommands?.find((candidate) => candidate.name === step);
  return owner && command ? { contribution: owner, command } : undefined;
}

/** The settings this plugin's slice carries, refused by name when they are wrong. */
function settingsFor(contribution: Contribution, profile: Profile, home: string, config: AmyConfig): Record<string, unknown> {
  const given = (pluginSlices(config, profile, home)[contribution.owner] ?? {}) as Record<string, unknown>;
  const schema = contribution.plugin.configSchema;
  if (!schema) return given;

  const validated = validateConfig(contribution.owner, schema, given);
  if (validated.ok) return given;
  throw new Error(`${contribution.owner} cannot run on ${profile.name}: ${validated.problems.join("; ")}`);
}

/**
 * Writes the files a profile's plugins bring, and never one that is there.
 *
 * `amy init` and `amy add` are the two moments a machine gains a plugin, so
 * they are the two moments its files arrive. What is already on disk is
 * somebody's edit, and an installer that overwrote it would be an installer
 * that loses work.
 */
export function writeFiles(
  home: string,
  config: AmyConfig,
  profile: Profile,
  contributions: readonly Contribution[],
  out: CommandOutput,
): string[] {
  const state = stateDirectory(home, profile);
  const written: string[] = [];

  for (const contribution of mountedBy(profile, contributions)) {
    for (const file of contribution.files) {
      const target = path.join(state, file.path);
      if (fs.existsSync(target)) continue;
      const settings = settingsFor(contribution, profile, home, config);
      fs.mkdirSync(path.dirname(target), { recursive: true });
      fs.writeFileSync(target, typeof file.content === "function" ? file.content(settings) : file.content, "utf-8");
      out.line(`wrote  ${target}`);
      written.push(target);
    }
  }

  return written;
}

/** The contributions one profile actually mounts, and nobody else's. */
function mountedBy(profile: Profile, contributions: readonly Contribution[]): Contribution[] {
  return contributions.filter((contribution) => contribution.profiles.some((mounted) => mounted.name === profile.name));
}

/** Every plugin check for one profile, labelled with the package that brought it. */
export async function checks(
  home: string,
  config: AmyConfig,
  profile: Profile,
  contributions: readonly Contribution[],
  out: CommandOutput,
): Promise<Check[]> {
  const answered: Check[] = [];

  for (const contribution of mountedBy(profile, contributions)) {
    for (const check of contribution.checks) {
      try {
        const answer = await check.run({
          state: stateDirectory(home, profile),
          home,
          settings: (pluginSlices(config, profile, home)[contribution.owner] ?? {}) as Record<string, unknown>,
          out,
        });
        answered.push({ ...answer, label: `${contribution.owner}: ${answer.label}` });
      } catch (error) {
        answered.push({
          label: `${contribution.owner}: ${check.name}`,
          ok: false,
          detail: error instanceof Error ? error.message : String(error),
        });
      }
    }
  }

  return answered;
}
