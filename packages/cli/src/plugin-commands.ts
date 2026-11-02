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
  // work without moving any, and the two halves of the loop a supervisor runs.
  "discover", "daemon", "after-daemon",
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
 * A command the machine never mounted does not exist, and it is nobody's
 * before that: what a machine can do is what it mounted, which is the
 * difference between a framework and a program with plugins attached.
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
  inherited: Record<string, string | boolean | undefined> = {},
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
    // A parent's flags are the subcommand's context too: `amy worktrees list
    // --repo acme/api` is one sentence, and nobody reading it expects the
    // first word to be forgotten by the second.
    declare(command, sub, contribution, env, mount, { ...inherited, ...(command.opts() as Record<string, string | boolean | undefined>) });
  }

  command.action(async (...passed: unknown[]) => {
    const invoked = passed[passed.length - 1] as Command;
    await run(declaration, contribution, env, invoked, mount, inherited);
  });
}

/** The positional arguments, in the order the command types them. */
function withArguments(command: Command, declaration: PluginCommand): void {
  for (const argument of declaration.args ?? []) {
    // Commander reads the brackets, not the name: `<name...>` is a required
    // list even when the declaration says `optional`, so the two spell
    // independently.
    const name = argument.variadic ? `${argument.name}...` : argument.name;
    command.argument(argument.optional ? `[${name}]` : `<${name}>`, argument.description ?? "");
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
  inherited: Record<string, string | boolean | undefined> = {},
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
    options: { ...inherited, ...invoked.opts() },
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
  /** Named by a caller that is not a person, so nothing can be ambiguous. */
  profileName?: string,
): Promise<boolean> {
  const found = lookup(contributions, typed);
  if (!found) return false;

  const chosen = profileName
    ? namedProfile(found.contribution, profileName)
    : env.profileFor(found.contribution);
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
  // The validated block, not the one on disk: a setting left out falls back to
  // the schema's default, which is exactly what the mounted plugin receives.
  if (validated.ok) return validated.config;
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
      // A plugin names a file inside the profile that mounted it, and nowhere
      // else: `..` or an absolute path would let one profile write another's
      // state, which is the one thing per-profile state exists to prevent.
      const target = insideProfile(state, contribution.owner, file.path);

      try {
        // Exclusive, so the promise holds even when two `init`s race or an
        // operator saves the file while its content is being composed.
        fs.writeFileSync(target, contentOf(file, contribution, profile, home, config), { encoding: "utf-8", flag: "wx" });
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === "EEXIST") continue;
        throw error;
      }
      out.line(`wrote  ${target}`);
      written.push(target);
    }
  }

  return written;
}

/** Where a plugin's file goes, refused when it would leave this profile. */
function insideProfile(state: string, owner: string, relative: string): string {
  const target = path.resolve(state, relative);
  const inside = path.relative(state, target);
  if (inside.startsWith("..") || path.isAbsolute(inside)) {
    throw new Error(`${owner} names a file outside the profile: ${relative}`);
  }
  fs.mkdirSync(path.dirname(target), { recursive: true });
  return target;
}

/** The file's content, composed from the settings the mounted plugin sees. */
function contentOf(
  file: PluginFile,
  contribution: Contribution,
  profile: Profile,
  home: string,
  config: AmyConfig,
): string {
  if (typeof file.content !== "function") return file.content;
  return file.content(settingsFor(contribution, profile, home, config));
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
          settings: settingsFor(contribution, profile, home, config),
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

/** The profile a caller named, refused when that profile does not mount it. */
function namedProfile(
  contribution: Contribution,
  name: string,
): { ok: true; profile: Profile } | { ok: false; problem: string } {
  const profile = contribution.profiles.find((candidate) => candidate.name === name);
  if (profile) return { ok: true, profile };
  return {
    ok: false,
    problem: `\`${contribution.owner}\` is not mounted by ${name}; it runs on: ${contribution.profiles.map((candidate) => candidate.name).join(", ")}`,
  };
}

/**
 * A file at the root is one file for the machine, and a workflow reads its own
 * profile's state directory; an updater that only changed the reader would
 * leave every existing machine with a check that reads nothing where the file
 * was. The copy lands exclusive, so what a profile already carries — written
 * there by the command that added the plugin, or edited since — is never
 * overwritten. The old name is renamed rather than deleted, which is what
 * keeps the content findable and lets the doctor's red check name the move;
 * the second run sees no old name and changes nothing.
 *
 * Every copy happens before any retirement: two contributions that named the
 * same root file for two profiles each get theirs, where moving after the
 * first would leave the second's source gone and its profile empty. And the
 * rename refuses a name that is already retired — an old command or a synced
 * folder can put the same root file back, and the machine is the last place
 * one copy of a team's list is overwritten by another.
 */
export function migrateRootFiles(
  home: string,
  contributions: readonly Contribution[],
  out: CommandOutput,
): string[] {
  const copied: string[] = [];

  // The two names the host itself serves at the root, in addition to holding
  // them: config.yaml (the mount's grammar) and .env (the environment the
  // host reads on every invocation). A plugin may still declare such a name
  // and its example is written into profiles, but the machine's own copy is
  // nobody's legacy to move: retiring it would starve the host's own reader
  // of credentials on the next invocation.
  const hostOwnedRootNames = new Set(["config.yaml", ".env"]);

  const roots = contributions.flatMap((contribution) =>
    contribution.files
      .filter(
        (file) =>
          // Only a file that used to live at the root can have moved from it:
          // one segment, and never one of the names the host serves itself.
          path.dirname(file.path) === "." && !hostOwnedRootNames.has(path.basename(file.path)),
      )
      .map((file) => ({ file, contribution })),
  );

  /** The machine-side path of one such file, and the name it retires into. */
  const fromOf = (root: (typeof roots)[number]): string =>
    path.join(home, path.basename(root.file.path));

  // Every copy first: two contributions may give the same root file to two
  // profiles, and the first retirement must not leave the second's source
  // gone with its profile empty.
  for (const root of roots) {
    const from = fromOf(root);
    if (!fs.existsSync(from)) continue;

    for (const profile of root.contribution.profiles) {
      const target = insideProfile(
        stateDirectory(home, profile),
        root.contribution.owner,
        root.file.path,
      );
      try {
        // Exclusive: an edit made between the check and the copy wins, and
        // the same path rule as any other write applies to the copy too.
        fs.copyFileSync(from, target, fs.constants.COPYFILE_EXCL);
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === "EEXIST") continue;
        throw error;
      }
      out.line(`kept  ${target}, from ${from}`);
      copied.push(target);
    }
  }

  // Then every retirement, once per root name: a machine keeps the content it
  // had for whoever still looked for it there, and the check the mounted
  // workflow runs can name where it went. The name is gone, so nothing reads
  // the root file as current a second time. When the name is already
  // retired, the machine's own copy stays where it is: the archive may be
  // the older list, and a person chooses between the two.
  const retiredBy = new Set<string>();

  for (const root of roots) {
    const from = fromOf(root);
    const retired = `${from}.moved`;
    if (!fs.existsSync(from) || retiredBy.has(from)) continue;
    retiredBy.add(from);

    if (fs.existsSync(retired)) {
      out.line(
        `kept  ${from}; ${retired} is already an archived copy of it — review both, then decide which is the machine's`,
      );
      continue;
    }

    try {
      fs.renameSync(from, retired);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") continue;
      throw error;
    }
    out.line(`moved ${from} to ${retired}; the profile's own copy is the one it reads`);
    copied.push(retired);
  }

  return copied;
}
