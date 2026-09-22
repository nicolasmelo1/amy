import fs from "node:fs";
import path from "node:path";
import { CommandRunner, Mounted, Plugin, mount } from "@amykit/core";
import { classify } from "./spec.js";
import { packageManager, shellCommand } from "./install.js";

/**
 * What one spec argument turns into, when the point is adding it.
 *
 * The one decision `classify` leaves to its caller: for a git URL and a
 * tarball, the name the config will carry is not knowable until the package
 * is on disk. Reading the installed manifest is not a second classification
 * but the same one, finished — the shape npm accepted said what it took, and
 * the manifest says what it turned out to be called.
 */
export interface Picked {
  kind: "name" | "range" | "git" | "tarball" | "path";
  /** The string npm installs. */
  readonly install: string;
  /** The string the config names, once the package is on disk. */
  readonly imported: string;
  /** The directory the package landed in, when one was named. */
  readonly absolute?: string;
}

/**
 * Decides what a spec argument is, and what each form becomes.
 *
 * A name is already its own imported form. A path spec is resolved now, so a
 * package that is not one is refused before anything is run; what the config
 * carries for it is the *name* the package declares, read off its own
 * manifest — a URL into the directory would make the config mean one place
 * on one machine, and the package is a name to any other. The directory is
 * the import: the loader passes it to `import()` as itself, and a directory
 * is not something `import()` takes.
 *
 * A git URL and a tarball defer to the manifest the install writes.
 */
export function whatPackageIs(spec: string, cwd: string, root: string): Picked {
  const resolved = classify(spec, cwd);

  if (resolved.kind === "git" || resolved.kind === "tarball") {
    // Before installation there is no manifest to read. Keep the name blank;
    // `nameInstalledPackage` fills it from the package npm just added.
    return { kind: resolved.kind, install: resolved.install, imported: packageNameOnDisk(root) ?? "" };
  }

  if (resolved.kind === "path") {
    const directory = resolved.absolute!;
    const name = manifestName(directory) ?? path.basename(directory);
    return { kind: "path", install: directory, imported: name, absolute: directory };
  }

  return { kind: resolved.kind, install: resolved.install, imported: resolved.imported! };
}

/** The name a package on this disk declares, by its manifest. */
function manifestName(directory: string): string | undefined {
  try {
    const manifest = JSON.parse(fs.readFileSync(path.join(directory, "package.json"), "utf-8")) as {
      name?: string;
    };
    return typeof manifest.name === "string" ? manifest.name : undefined;
  } catch {
    return undefined;
  }
}

/**
 * The one package a fresh install wrote, read off its manifest.
 *
 * npm answers a git URL or a tarball with the name the package declares, and
 * that name is what the config has to carry. Read from amy's own npm root
 * rather than guessed from the URL, and asked for singular: an install that
 * produced two top-level packages did not do what was asked, and saying so
 * beats writing whichever name happened to sort first into a config.
 */
function packageNameOnDisk(root: string): string | undefined {
  const packages = packageNamesOnDisk(root);
  return packages.length === 1 ? packages[0] : undefined;
}

/** The package name npm added, compared with the root as it was before. */
export function nameInstalledPackage(root: string, before: readonly string[]): string {
  const added = packageNamesOnDisk(root).filter((name) => !before.includes(name));
  if (added.length !== 1) throw new Error(`the install did not add one package amy can name`);
  return added[0]!;
}

function packageNamesOnDisk(root: string): string[] {
  const nodeModules = path.join(root, "node_modules");
  const names: string[] = [];
  for (const entry of read(nodeModules)) {
    if (entry.startsWith("@")) {
      for (const inner of read(path.join(nodeModules, entry))) names.push(`${entry}/${inner}`);
    } else if (!entry.startsWith(".")) {
      names.push(entry);
    }
  }
  return names.filter((name) => {
    try {
      return JSON.parse(fs.readFileSync(path.join(nodeModules, ...name.split("/"), "package.json"), "utf-8")) !== null;
    } catch {
      return false;
    }
  });
}

/** Returns nothing rather than throwing: a directory that is not there is an answer. */
function read(directory: string): string[] {
  try {
    return fs.readdirSync(directory);
  } catch {
    return [];
  }
}

/**
 * Imports one package by what the config will carry, through the resolver.
 *
 * `load()` is the boot-time loader over a whole config, and a refusal there
 * is a boot refusal — a machine that cannot start. Adding a package is not
 * booting: the import runs before the config names anything, so its failure
 * is a command refusal, and the loader's "not installed" sentinel would read
 * as one.
 */
export async function importPluginBySpec(
  imported: string,
  resolve: (spec: string) => string,
): Promise<{ ok: true; plugin: Plugin } | { ok: false; problem: string }> {
  try {
    const module = (await import(resolve(imported))) as { plugin?: Plugin };
    if (!module.plugin) return { ok: false, problem: `${imported}: imported, but exports no \`plugin\`` };
    return { ok: true, plugin: module.plugin };
  } catch (error) {
    const why = error instanceof Error ? error.message : String(error);
    return { ok: false, problem: `${imported}: could not be imported — ${why}` };
  }
}

/**
 * Whether mounting this one package alone answers "workflow" or "plugin".
 *
 * The plan's question — no name convention, no manifest field — is the one
 * `mount()` answers at boot, asked one package at a time. The probe mounts
 * into a registry nothing reads, on paths nothing reads, and the answer is
 * `mounted.workflow`: a package that registers a workflow is a workflow,
 * everything else is a plugin.
 */
export async function whatMountingSays(
  plugin: Plugin,
  home: string,
): Promise<{ ok: true; workflow: boolean } | { ok: false; problems: string[] }> {
  const throwaway = path.join(home, "add-probe");
  try {
    const outcome = await mount(
      [plugin],
      {},
      {
        // A runner a mount never uses: registration wires names, and the
        // probe drives no tick.
        runner: { run: async () => ({ ok: true, exitCode: 0, stdout: "", stderr: "" }) },
        now: () => new Date(),
        paths: { workspace: throwaway, checkouts: {}, state: throwaway },
      },
    );

    if (!outcome.ok) return { ok: false, problems: outcome.problems };
    return { ok: true, workflow: outcome.mounted.workflow !== undefined };
  } finally {
    fs.rmSync(throwaway, { recursive: true, force: true });
  }
}

export interface BootCheck {
  ok: boolean;
  /** The mount's own refusals, named. */
  problems: string[];
  /** What the machine would carry, when it comes up. */
  mounted?: Mounted;
}

/**
 * Whether the install the config would become still boots, and what the
 * machine would leave unmounted when it does not.
 *
 * The same question `assemble()` answers for a tick, asked on demand: the
 * probe above mounts one package alone, and a package that mounts alone can
 * still take a port the rest of the machine was contributing — a removal the
 * machine cannot survive is found here, before the config is touched.
 */
export async function whatBoots(
  assemble: () => Promise<BootCheck>,
): Promise<BootCheck> {
  return assemble();
}

/**
 * The missing port a removal would leave behind, named the way the mount
 * names it.
 *
 * `unmetNeeds` names an action and the port nothing mounted; this is what the
 * `remove` command prints, so the operator reads which action the remaining
 * workflow would lose the port for — the refusal the boot writes, moved to
 * the moment somebody can still change their mind.
 */
export function unmetAction(mounted: Mounted, unmet: readonly string[]): string {
  const actions = mounted.workflow?.usesActions ?? [];
  const named = unmet.find((problem) => actions.some((action) => problem.includes(`\`${action}\``)));
  return named ?? unmet[0] ?? "nothing is missing";
}

/**
 * Removes packages from amy's npm root even when npm accepts `file:` but
 * silently leaves it in the manifest. npm 10's uninstall is not an inverse
 * for that form, so make the manifest authoritative and let prune/install
 * rebuild both node_modules and the lock from it.
 */
export async function uninstallFromPluginsRoot(
  runner: CommandRunner,
  root: string,
  packages: readonly string[],
): Promise<{ ok: boolean; command: string; output: string }> {
  const manifest = path.join(root, "package.json");
  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(fs.readFileSync(manifest, "utf-8")) as Record<string, unknown>;
  } catch (error) {
    return {
      ok: false,
      command: "",
      output: `could not read ${manifest}: ${error instanceof Error ? error.message : String(error)}`,
    };
  }

  for (const field of ["dependencies", "devDependencies", "optionalDependencies"] as const) {
    const dependencies = parsed[field];
    if (typeof dependencies !== "object" || dependencies === null || Array.isArray(dependencies)) continue;
    for (const name of packages) delete (dependencies as Record<string, unknown>)[name];
  }
  fs.writeFileSync(manifest, `${JSON.stringify(parsed, null, 2)}\n`, "utf-8");

  const pruneArgs = ["prune", "--prefix", root, "--no-audit", "--no-fund"];
  const installArgs = ["install", "--prefix", root, "--no-audit", "--no-fund"];
  const command = [shellCommand(packageManager(), pruneArgs), shellCommand(packageManager(), installArgs)].join(" && ");
  const prune = await runner.run(packageManager(), pruneArgs, { timeoutMs: 10 * 60 * 1000 });
  if (!prune.ok) return { ok: false, command, output: outputOf(prune) };

  const install = await runner.run(packageManager(), installArgs, { timeoutMs: 10 * 60 * 1000 });
  return { ok: install.ok, command, output: [outputOf(prune), outputOf(install)].filter(Boolean).join("\n") };
}

function outputOf(result: { stdout: string; stderr: string }): string {
  return [result.stdout, result.stderr].filter(Boolean).join("\n").trim();
}

/** What remains of the config's names after one goes, so the caller can refuse the one that breaks. */
export function withoutSpec(specs: readonly string[], spec: string): string[] {
  return specs.filter((name) => name !== spec);
}