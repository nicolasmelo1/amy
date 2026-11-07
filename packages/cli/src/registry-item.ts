import fs from "node:fs";
import path from "node:path";

/**
 * A shadcn registry item for one published package (S16): its source at its
 * version, so `npx shadcn add <url>` is a second client for the source
 * `amy add --fork` takes. shadcn only copies; amy is what records a base and
 * merges an update (S8).
 */
export interface RegistryItem {
  readonly $schema: string;
  readonly name: string;
  readonly type: "registry:lib";
  readonly title: string;
  readonly description: string;
  readonly dependencies: string[];
  readonly devDependencies: string[];
  readonly files: { path: string; type: "registry:file"; target: string; content: string }[];
  readonly meta: { package: string; version: string; repository: string; directory: string; tag: string };
}

const SCHEMA = "https://ui.shadcn.com/schema/registry-item.json";

/** Whether a tracked file is part of what a fork of the package takes: not its tests, not its changelog. */
function isSource(relative: string): boolean {
  const parts = relative.split("/");
  return !parts.some((part) => part === "tests" || part === "test" || part === "node_modules" || part === "dist")
    && parts.at(-1) !== "CHANGELOG.md"
    && !relative.endsWith(".tsbuildinfo");
}

interface PackageManifest {
  name?: string;
  version?: string;
  description?: string;
  private?: boolean;
  repository?: { url?: string; directory?: string } | string;
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
}

/**
 * The item for the package in `directory`, built from the files given
 * relative to the repository root. The target is the place `amy add --fork`
 * puts a fork for a workflow of your own, so both clients agree on where.
 */
export function registryItem(repository: string, directory: string, files: readonly string[]): RegistryItem {
  const manifest = JSON.parse(fs.readFileSync(path.join(repository, directory, "package.json"), "utf-8")) as PackageManifest;
  const name = manifest.name ?? directory;
  const unscoped = name.split("/").at(-1)!;
  const url = typeof manifest.repository === "string" ? manifest.repository : manifest.repository?.url ?? "";
  const repositoryDirectory = typeof manifest.repository === "object" ? manifest.repository.directory ?? directory : directory;
  const within = files
    .filter((file) => file.startsWith(`${directory}/`) && isSource(file.slice(directory.length + 1)))
    .sort();
  return {
    $schema: SCHEMA,
    name: unscoped,
    type: "registry:lib",
    title: name,
    description: manifest.description ?? "",
    dependencies: Object.entries(manifest.dependencies ?? {}).map(([dependency, range]) => `${dependency}@${range}`),
    devDependencies: Object.entries(manifest.devDependencies ?? {}).map(([dependency, range]) => `${dependency}@${range}`),
    files: within.map((file) => ({
      path: file,
      type: "registry:file" as const,
      target: `forks/${unscoped}/${file.slice(directory.length + 1)}`,
      content: fs.readFileSync(path.join(repository, file), "utf-8"),
    })),
    meta: { package: name, version: manifest.version ?? "", repository: url, directory: repositoryDirectory, tag: `${name}@${manifest.version ?? ""}` },
  };
}

/** The packages a registry item is generated for: every workspace package that is published. */
export function publicPackages(repository: string): string[] {
  const found: string[] = [];
  for (const group of ["packages", "plugins"]) {
    const parent = path.join(repository, group);
    if (!fs.existsSync(parent)) continue;
    for (const entry of fs.readdirSync(parent).sort()) {
      const manifest = path.join(parent, entry, "package.json");
      if (!fs.existsSync(manifest)) continue;
      const parsed = JSON.parse(fs.readFileSync(manifest, "utf-8")) as PackageManifest;
      if (!parsed.private) found.push(`${group}/${entry}`);
    }
  }
  return found;
}

/** Where a package's item is kept: `registry/<unscoped name>.json`. */
export function itemFile(repository: string, item: Pick<RegistryItem, "name">): string {
  return path.join(repository, "registry", `${item.name}.json`);
}

export function serialize(item: RegistryItem): string {
  return `${JSON.stringify(item, null, 2)}\n`;
}

/**
 * Every item that is missing or no longer matches its package, by the file
 * that is stale; and every file under `registry/` no package generates.
 */
export function staleItems(repository: string, files: readonly string[]): string[] {
  const stale: string[] = [];
  const expected = new Set<string>();
  for (const directory of publicPackages(repository)) {
    const item = registryItem(repository, directory, files);
    const file = itemFile(repository, item);
    expected.add(file);
    const written = fs.existsSync(file) ? fs.readFileSync(file, "utf-8") : undefined;
    if (written !== serialize(item)) stale.push(`${path.relative(repository, file)} (${item.title}@${item.meta.version})`);
  }
  const registry = path.join(repository, "registry");
  for (const entry of fs.existsSync(registry) ? fs.readdirSync(registry) : []) {
    const file = path.join(registry, entry);
    if (entry.endsWith(".json") && !expected.has(file)) stale.push(`${path.relative(repository, file)} (no package generates it)`);
  }
  return stale;
}
