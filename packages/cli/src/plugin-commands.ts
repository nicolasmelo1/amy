import fs from "node:fs";
import path from "node:path";
import {
  Check,
  CommandOutput,
  DeclaredOperation,
  Operation,
  Plugin,
  PluginCheck,
  CommandRunner,
  PluginFile,
  PluginSetup,
  PortKind,
  validateConfig,
} from "@amykit/core";
import { AmyConfig } from "./config.js";
import { spellingProblems } from "./operations/argv.js";
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
  "contract", "config", "mount-check",
  // Hidden from `amy --help`, and still the host's: a script's way to queue
  // work without moving any, and the two halves of the loop a supervisor runs.
  "discover", "daemon", "after-daemon",
];

/** Everything one package brings to the command line. */
export interface Contribution {
  /** The package's own name: what `amy --help` marks the commands with. */
  readonly owner: string;
  /** The spec the config named it by, which a local workflow spells differently. */
  readonly spec: string;
  readonly plugin: Plugin;
  /** Every configured profile that mounts it, which is who may run it. */
  readonly profiles: readonly Profile[];
  /** Every operation it declares: each with `cli` words is a command too. */
  readonly operations: readonly Operation[];
  readonly checks: readonly PluginCheck[];
  readonly files: readonly PluginFile[];
  readonly setup: readonly PluginSetup[];
  /**
   * What each profile mounts under this name, when it is its own: a profile
   * that forked the package gets the fork's operations, checks, files and setup.
   */
  readonly byProfile?: ReadonlyMap<string, Contribution>;
}

/** The implementation one profile mounts under a contribution's name. */
export function forProfile(contribution: Contribution, profile: Pick<Profile, "name">): Contribution {
  return contribution.byProfile?.get(profile.name) ?? contribution;
}

export interface Gathered {
  readonly contributions: readonly Contribution[];
  /**
   * What the loader could not import or read a plugin from. Not refused
   * here — one broken package must not take `--help` down with it — and
   * refused by whatever has to speak for the whole install, `amy contract`.
   */
  readonly unloaded: readonly string[];
  /**
   * Names two owners both claim, and a plugin still declaring the commands
   * amy no longer reads: refused before anything runs.
   */
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
  load: (specs: readonly string[], profile?: string) => Promise<LoadResult>,
): Promise<Gathered> {
  // Each profile is read through its own resolver: a profile that forked a
  // package mounts the fork, so what it contributes is the fork's.
  const contributions = new Map<string, Contribution>();
  const unloaded = new Set<string>();
  const byProfile = new Map<string, Map<string, Contribution>>();
  for (const profile of known) {
    const specs = pluginList(config, profile);
    const loaded = await load(specs, profile.name);
    for (const problem of loaded.problems) unloaded.add(problem);
    for (const spec of specs) {
      const plugin = loaded.bySpec.get(spec);
      if (!plugin) continue;
      const own = contributionOf(plugin, spec, [profile]);
      const existing = contributions.get(plugin.name);
      contributions.set(plugin.name, existing ? { ...merged(existing, own), profiles: [...existing.profiles, profile] } : own);
      byProfile.set(plugin.name, (byProfile.get(plugin.name) ?? new Map()).set(profile.name, own));
    }
  }
  const all = [...contributions.values()].map((contribution) => ({ ...contribution, byProfile: byProfile.get(contribution.owner) }));
  return { contributions: all, unloaded: [...unloaded], problems: [...retired(all), ...declaredTwice(all), ...conflicts(all)] };
}

/**
 * An id one implementation declares twice, read from each profile's own
 * declarations before they are merged: the merge keeps one operation per id,
 * so a fork declaring an id twice would otherwise pass unseen and run its
 * first handler under the second's words.
 */
function declaredTwice(contributions: readonly Contribution[]): string[] {
  const problems = new Set<string>();
  for (const contribution of contributions) {
    for (const own of [contribution, ...(contribution.byProfile?.values() ?? [])]) {
      const seen = new Set<string>();
      for (const operation of own.operations) {
        if (seen.has(operation.id)) problems.add(`${contribution.owner} declares the operation \`${operation.id}\` twice; an id is one operation`);
        seen.add(operation.id);
      }
    }
  }
  return [...problems];
}

/**
 * A plugin that still declares `commands`, named with the member amy no
 * longer reads. Refused rather than ignored: a plugin whose commands quietly
 * vanished would read as a machine that lost them.
 */
function retired(contributions: readonly Contribution[]): string[] {
  const plugins = contributions.flatMap((contribution) => [contribution.plugin, ...[...(contribution.byProfile?.values() ?? [])].map((own) => own.plugin)]);
  const named = new Set(plugins.filter((plugin) => (plugin as { commands?: unknown }).commands !== undefined).map((plugin) => plugin.name));
  return [...named].map((name) =>
    `${name} declares \`commands\`, which amy no longer reads: a plugin declares \`operations\`, and the command line is drawn from them`,
  );
}

function contributionOf(plugin: Plugin, spec: string, profiles: readonly Profile[]): Contribution {
  return {
    owner: plugin.name,
    spec,
    plugin,
    profiles,
    operations: (plugin.operations ?? []) as readonly DeclaredOperation[] as readonly Operation[],
    checks: plugin.checks ?? [],
    files: plugin.files ?? [],
    setup: plugin.setup ?? [],
  };
}

/** Two profiles mounting one name: the first one's declarations, unless it brought none. */
function merged(existing: Contribution, own: Contribution): Contribution {
  return {
    ...existing,
    // Every profile's operations, by id: a fork that adds one brings its
    // command and its contract entry like any other, and the first profile's
    // declaration answers for an id two of them share.
    operations: [...existing.operations, ...own.operations.filter((operation) => !existing.operations.some((held) => held.id === operation.id))],
    checks: existing.checks.length > 0 ? existing.checks : own.checks,
    files: existing.files.length > 0 ? existing.files : own.files,
    setup: existing.setup.length > 0 ? existing.setup : own.setup,
  };
}

/**
 * An operation id and a command's first word each belong to one owner, and the
 * host's names are not on offer. Within one package, a group of words is a
 * group or an operation, never both, and has at most one default.
 */
function conflicts(contributions: readonly Contribution[]): string[] {
  const ids = new Map<string, string>();
  const words = new Map<string, string>();
  const problems: string[] = [];

  for (const contribution of contributions) {
    for (const operation of contribution.operations) {
      const heldId = ids.get(operation.id);
      if (heldId && heldId !== contribution.owner) {
        problems.push(`the operation \`${operation.id}\` is declared by both ${heldId} and ${contribution.owner}; an id is owned once`);
      } else {
        ids.set(operation.id, contribution.owner);
      }

      const first = operation.cli?.words[0];
      if (first === undefined) continue;
      if (BUILT_IN_COMMANDS.includes(first)) {
        problems.push(
          `${contribution.owner} declares \`amy ${first}\`, which this host already owns; a plugin cannot replace a built-in command`,
        );
        continue;
      }
      const held = words.get(first);
      if (held && held !== contribution.owner) {
        problems.push(`\`amy ${first}\` is declared by both ${held} and ${contribution.owner}; a name is owned once`);
        continue;
      }
      words.set(first, contribution.owner);
    }
    problems.push(...spellings(contribution));
  }

  return problems;
}

/** One package's words: no path spelled twice, no path both an operation and a group, one default a group. */
function spellings(contribution: Contribution): string[] {
  const problems: string[] = [];
  const spelled = contribution.operations.filter((operation) => operation.cli && operation.cli.words.length > 0);
  const paths = new Map<string, string>();
  const defaults = new Map<string, string>();
  for (const operation of spelled) {
    const words = operation.cli!.words;
    const path = words.join(" ");
    const held = paths.get(path);
    if (held) problems.push(`${contribution.owner} spells both \`${held}\` and \`${operation.id}\` as \`amy ${path}\`; a command runs one operation`);
    paths.set(path, operation.id);
    if (operation.cli!.default) {
      const group = words.slice(0, -1).join(" ");
      const before = defaults.get(group);
      if (before) problems.push(`${contribution.owner} makes both \`${before}\` and \`${operation.id}\` the default of \`amy ${group}\`; a group has one`);
      defaults.set(group, operation.id);
    }
    problems.push(...spellingProblems(operation));
  }
  for (const operation of spelled) {
    const path = operation.cli!.words.join(" ");
    const under = [...paths.keys()].find((other) => other.startsWith(`${path} `));
    if (under) problems.push(`${contribution.owner} spells \`${operation.id}\` as \`amy ${path}\`, which is also the group \`amy ${under}\` sits under`);
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

/** The directory one profile owns: its records and queue live one level down. */
export function stateDirectory(home: string, profile: Profile): string {
  return path.join(home, path.dirname(directoriesFor(profile).records));
}

/** The settings this plugin's slice carries, refused by name when they are wrong. */
export function settingsFor(contribution: Contribution, profile: Profile, home: string, config: AmyConfig, pluginNames?: ReadonlyMap<string, string>): Record<string, unknown> {
  // The settings a profile carries land on the name the mount reads the
  // plugin by — the same name-or-spec question a local workflow poses, and
  // the same map that answers it: what the config named, and what the
  // module answered when it was imported.
  const given = (pluginSlices(config, profile, home, pluginNames)[contribution.owner] ?? {}) as Record<string, unknown>;
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
        fs.writeFileSync(target, contentOf(file, contribution, profile, home, config, contributions), { encoding: "utf-8", flag: "wx" });
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

/**
 * Runs what a profile's plugins prepare outside amy's state, after their files.
 *
 * The same two moments as the files, for the same reason. A setup that
 * throws is answered red under its owner's name rather than taking `init`
 * down with it: the next plugin's setup still has its own work to do, and
 * the doctor will say what this one left undone.
 */
export async function runSetup(
  home: string,
  config: AmyConfig,
  profile: Profile,
  contributions: readonly Contribution[],
  out: CommandOutput,
  runner: CommandRunner,
): Promise<Check[]> {
  const answered: Check[] = [];

  for (const contribution of mountedBy(profile, contributions)) {
    for (const setup of contribution.setup) {
      let answer: Check;
      try {
        answer = await setup.run({
          state: stateDirectory(home, profile),
          home,
          settings: settingsFor(contribution, profile, home, config, new Map(contributions.map((one) => [one.spec, one.owner]))),
          out,
          runner,
        });
      } catch (error) {
        answer = { label: setup.name, ok: false, detail: error instanceof Error ? error.message : String(error) };
      }
      const said = `${answer.ok ? "set up" : "could not set up"} ${contribution.owner}: ${answer.label}`;
      out.line(answer.detail ? `${said} — ${answer.detail}` : said);
      answered.push({ ...answer, label: `${contribution.owner}: ${answer.label}` });
    }
  }

  return answered;
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
  contributions: readonly Contribution[],
): string {
  if (typeof file.content !== "function") return file.content;
  return file.content(settingsFor(contribution, profile, home, config, new Map(contributions.map((one) => [one.spec, one.owner]))));
}

/** The contributions one profile actually mounts, and nobody else's. */
function mountedBy(profile: Profile, contributions: readonly Contribution[]): Contribution[] {
  return contributions
    .filter((contribution) => contribution.profiles.some((mounted) => mounted.name === profile.name))
    .map((contribution) => forProfile(contribution, profile));
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
          settings: settingsFor(contribution, profile, home, config, new Map(contributions.map((one) => [one.spec, one.owner]))),
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
export function namedProfile(
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
