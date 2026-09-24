import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { CommandRunner } from "@amykit/core";
import { packageEntrySpecifier } from "./spec.js";
import { packageManager, shellCommand } from "./install.js";

/**
 * One package this machine's two roots hold, and what the range in them
 * points at.
 *
 * The two roots are the plugins root — `<home>/plugins`, where the config's
 * packages are installed — and the install root that resolved the CLI
 * itself. The version installed is read off the copy on disk. The version
 * the range points at is asked of the range, through npm, which is what
 * makes an update an answer rather than a guess.
 */
export interface Held {
  /** The package the root's manifest names. */
  readonly name: string;
  /** The spec in the root's manifest: the range this install pinned. */
  readonly range: string;
  /** Which of the two roots holds it. */
  readonly root: "plugins" | "install";
  /** The version on disk right now. */
  readonly have: string;
  /** What the range now points at; nothing when npm could not be asked. */
  readonly want?: string;
}

/** What one root's manifest asks npm for, by direct package name. */
export function manifestOf(root: string): Record<string, string> {
  try {
    const parsed = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf-8")) as Record<
      string,
      unknown
    >;
    const dependencies = parsed.dependencies;
    return typeof dependencies === "object" && dependencies !== null
      ? { ...(dependencies as Record<string, string>) }
      : {};
  } catch {
    return {};
  }
}

/**
 * The registry intent an installed machine carries beside a local tarball.
 *
 * `install.sh` must bootstrap unpublished packages from local tarballs, but
 * the CLI itself still has a registry lifecycle after it is published. This
 * metadata keeps the bootstrap source as the manifest dependency while giving
 * `amy update` the explicit range it may safely resolve and install.
 */
export function updateRangeOf(root: string, name: string, fallback: string): string {
  try {
    const parsed = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf-8")) as {
      amyUpdateRanges?: Record<string, unknown>;
    };
    const range = parsed.amyUpdateRanges?.[name];
    return typeof range === "string" ? range : fallback;
  } catch {
    return fallback;
  }
}

/** The version one root's copy of a package carries, or nothing when it is not there. */
export function versionIn(root: string, name: string): string | undefined {
  try {
    const parsed = JSON.parse(
      fs.readFileSync(path.join(root, "node_modules", ...name.split("/"), "package.json"), "utf-8"),
    ) as { version?: string };
    return typeof parsed.version === "string" ? parsed.version : undefined;
  } catch {
    return undefined;
  }
}

/**
 * Whether a manifest range can move at all.
 *
 * `file:` specs, URLs, git forms and paths are pins: what they name is one
 * place on one machine, and what would move is whatever that place holds
 * now, which no command can discover. A bare name or a semver range is a
 * registry range, and `latest` is one too — an operator who wrote it wants
 * the newest one npm finds. The tilde of `~2.1.0` is a range; only a tilde
 * followed by a slash is a path into the home directory. Spaces do not make
 * a range a pin: `>=1.0.0 <2.0.0` is one registry range npm answers as a
 * whole, and the prefixes above already name every pin form.
 */
export function isRange(range: string): boolean {
  return !/^(file:|https?:|git|ssh:|github:|gitlab:|bitbucket:|gist:|\/|\.{0,2}\/|~\/|[A-Za-z]:[\\/])/.test(range);
}

/**
 * The version a range points at, asked through npm.
 *
 * `npm view <name>@<range> version` is the question in npm's own words; its
 * answer is the version that satisfies the range today. A machine with no
 * network, or a range npm cannot read, gets an unset `want` rather than a
 * guess, and `--check` reports it as unknown rather than as current.
 */
async function resolveTo(
  runner: CommandRunner,
  name: string,
  range: string,
): Promise<string | undefined> {
  const result = await runner.run(packageManager(), ["view", `${name}@${range}`, "version", "--json"], {
    timeoutMs: 60 * 1000,
  });
  if (!result.ok) return undefined;
  return oneVersion(result.stdout);
}

/** The one version npm reported, when that is what it reported. */
export function oneVersion(stdout: string): string | undefined {
  try {
    const parsed = JSON.parse(stdout) as unknown;
    if (typeof parsed === "string") return parsed;
    // A range that matches several answers with the list, oldest first; the
    // newest one is what the range moves to.
    if (Array.isArray(parsed)) {
      const versions = parsed.filter((entry): entry is string => typeof entry === "string");
      return versions[versions.length - 1];
    }
  } catch {
    return undefined;
  }
  return undefined;
}

/**
 * Every package this machine's two roots hold, with what the ranges in them
 * now point at.
 */
export async function held(
  runner: CommandRunner,
  home: string,
  installRoot?: string,
): Promise<Held[]> {
  const pluginsRoot = path.join(home, "plugins");
  const found: Held[] = [];

  for (const [name, range] of Object.entries(manifestOf(pluginsRoot))) {
    const have = versionIn(pluginsRoot, name);
    if (!have) continue;
    found.push({
      name,
      range,
      root: "plugins",
      have,
      want: isRange(range) ? await resolveTo(runner, name, range) : undefined,
    });
  }

  if (installRoot) {
    for (const [name, dependency] of Object.entries(manifestOf(installRoot))) {
      const range = updateRangeOf(installRoot, name, dependency);
      const have = versionIn(installRoot, name);
      if (!have) continue;
      found.push({
        name,
        range,
        root: "install",
        have,
        want: isRange(range) ? await resolveTo(runner, name, range) : undefined,
      });
    }
  }

  return found;
}

/**
 * Where the plugins root and the install root are, for this running CLI.
 *
 * The plugins root is state, under amy's home. The install root is derived
 * from where this module resolved from: an installed CLI sits at
 * `<root>/node_modules/@amykit/cli/dist/`, so the walk up from this file is
 * one level to `dist`, one to the package, one to the scope, one to
 * `node_modules`, and one more to the root that holds it — and only when
 * that last directory carries a manifest, which is what an install root is.
 * A checkout (`packages/cli/dist/`) never matches, so `update` has no CLI
 * half to move there and says so rather than running npm against a
 * repository.
 */
export function roots(home: string, from: URL = new URL(import.meta.url)): {
  plugins: string;
  install?: string;
} {
  const plugins = path.join(home, "plugins");
  const dist = path.dirname(fileURLToPath(from));
  const packageDir = path.dirname(dist);
  const candidate = path.dirname(path.dirname(path.dirname(packageDir)));

  const installed = path.basename(path.dirname(path.dirname(packageDir))) === "node_modules" &&
    fs.existsSync(path.join(candidate, "package.json"));

  return installed ? { plugins, install: candidate } : { plugins };
}

/** One line of the report, `--check` and the move's own log the same. */
export function line(held: Held): string {
  const where = held.root === "plugins" ? "plugins" : "install";
  if (!isRange(held.range)) return `${held.name}  ${held.have}  (${where}, pinned: ${held.range})`;
  const wanted = held.want ?? "unknown";
  return `${held.name}  ${held.have} -> ${wanted}  (${where}, ${held.range})`;
}

/**
 * Moves one package to the exact version its range now points at, and puts
 * the root's manifest back the way the operator wrote it.
 *
 * The install names the version, not the range: npm is free to answer a
 * range with whatever already satisfies it, which on a machine whose
 * lockfile still holds the old version is the old version — a no-op that
 * reads as success. Naming the version is the one form that moves. The
 * manifest entry is restored afterwards, because an install also rewrites
 * it to the exact thing that was installed — and the root's manifest is
 * the operator's record of *why* the package is there: the range is the
 * intention, the copy on disk is today's answer to it. Restoring the entry
 * keeps the next `update` honest; the copy on disk stays at the new
 * version either way.
 *
 * A refused restore is a machine changed past its manifest: the caller
 * must treat the move as `moved` — not merely `failed` — so the update's
 * rollback path puts the whole root back, package and manifest together.
 */
export interface MoveOutcome {
  ok: boolean;
  /** The package was installed, even when the outcome is not ok. */
  installed: boolean;
  command: string;
  output: string;
}

export async function move(
  runner: CommandRunner,
  root: string,
  name: string,
  range: string,
  to: string,
): Promise<MoveOutcome> {
  const before = manifestOf(root);
  const outcome = await runWith(runner, [
    "install",
    "--prefix",
    root,
    "--no-audit",
    "--no-fund",
    "--",
    `${name}@${to}`,
  ]);
  if (!outcome.ok) return { ...outcome, installed: false };
  const restoreProblem = restoreManifestEntry(root, before, name);
  if (restoreProblem) {
    return {
      ...outcome,
      ok: false,
      installed: true,
      output: [outcome.output, `installed ${name}@${to}, but could not restore its manifest range: ${restoreProblem}`]
        .filter(Boolean)
        .join("\n"),
    };
  }
  return { ...outcome, installed: true };
}

/** Rolls one package back to the version that was on disk, the same way. */
export async function restore(
  runner: CommandRunner,
  root: string,
  name: string,
  to: string,
): Promise<MoveOutcome> {
  const before = manifestOf(root);
  const outcome = await runWith(runner, [
    "install",
    "--prefix",
    root,
    "--no-audit",
    "--no-fund",
    "--",
    `${name}@${to}`,
  ]);
  if (!outcome.ok) return { ...outcome, installed: false };
  const restoreProblem = restoreManifestEntry(root, before, name);
  if (restoreProblem) {
    return {
      ...outcome,
      ok: false,
      installed: true,
      output: [outcome.output, `restored ${name}@${to}, but could not restore its manifest range: ${restoreProblem}`]
        .filter(Boolean)
        .join("\n"),
    };
  }
  return { ...outcome, installed: true };
}

async function runWith(
  runner: CommandRunner,
  args: readonly string[],
): Promise<Omit<MoveOutcome, "installed">> {
  const result = await runner.run(packageManager(), [...args], { timeoutMs: 10 * 60 * 1000 });
  return {
    ok: result.ok,
    command: shellCommand(packageManager(), [...args]),
    output: [result.stdout, result.stderr].filter(Boolean).join("\n").trim(),
  };
}

/** Writes the manifest entry back to the spec it carried before the move. */
function restoreManifestEntry(root: string, before: Record<string, string>, name: string): string | undefined {
  const file = path.join(root, "package.json");
  try {
    const manifest = JSON.parse(fs.readFileSync(file, "utf-8")) as Record<string, unknown>;
    const dependencies = manifest.dependencies;
    if (typeof dependencies !== "object" || dependencies === null) {
      return "package.json has no dependencies object";
    }
    const range = before[name];
    if (typeof range !== "string") return `package.json had no prior range for ${name}`;
    (dependencies as Record<string, string>)[name] = range;
    fs.writeFileSync(file, `${JSON.stringify(manifest, null, 2)}\n`, "utf-8");
    return undefined;
  } catch (error) {
    return error instanceof Error ? error.message : String(error);
  }
}

/**
 * The entry specifier of the copy on disk, made cache-safe.
 *
 * The ESM cache is keyed by URL, and a move replaces the file behind the
 * same URL: a plain `import(entry)` answers with whatever an earlier import
 * of that URL cached — the old version, exactly when the probe is supposed
 * to see the new one. A counter query makes every probe its own URL, so
 * npm's replacement is always what loads. The query lives on the specifier
 * only; the loader never hands a path with it to the filesystem.
 */
let probe = 0;

function probedEntry(directory: string): string {
  probe += 1;
  return `${packageEntrySpecifier(directory)}?probe=${probe}`;
}

/**
 * Whether the copy npm just wrote imports and carries a plugin.
 *
 * The same half of `add`'s probe, on the new version: a package whose module
 * will not import, or one that exports no `plugin`, is a bad version, and
 * the move is rolled back. The module loads through `probedEntry`, so the
 * probe reads the copy npm just wrote even when an earlier move in this same
 * update imported that URL at its old version.
 *
 * A registration that needs a full mount to refuse is caught by the boot
 * check after all moves land, which is the other half of the same promise.
 */
export async function imports(
  name: string,
  pluginsRoot: string,
): Promise<{ ok: true } | { ok: false; problems: string[] }> {
  try {
    const module = (await import(probedEntry(packageDirectory(pluginsRoot, name)))) as { plugin?: unknown };
    if (!module.plugin) return { ok: false, problems: [`${name}: exports no \`plugin\``] };
    return { ok: true };
  } catch (error) {
    const why = error instanceof Error ? error.message : String(error);
    return { ok: false, problems: [`${name}: could not be imported — ${why}`] };
  }
}

/** The directory one package occupies beneath a root, read off its name. */
function packageDirectory(root: string, name: string): string {
  const parts = name.startsWith("@") ? name.split("/", 2) : [name.split("/", 1)[0]!];
  return path.join(root, "node_modules", ...parts);
}