// Checks that the release configuration says what it means, for every
// package in the workspace.
//
// Usage: node scripts/check-release-config.mjs
//
// The failure this exists for is quiet and arrives late: somebody adds a
// plugin, nobody adds it to anything, and the release either leaves it behind
// at an older version or publishes it somewhere nobody meant. Neither shows
// up until a second machine installs a set that does not fit together.
//
// So the rule is one sentence: a package is either published — and then it
// carries everything a publish needs and moves with the others — or it is
// private, and then nothing about it is published at all.
import fs from "node:fs";
import path from "node:path";

const repo = path.resolve(import.meta.dirname, "..");
const REGISTRY = "https://registry.npmjs.org";
const REPOSITORY = "git+https://github.com/nicolasmelo1/amy.git";

const read = (file) => JSON.parse(fs.readFileSync(file, "utf-8"));

const root = read(path.join(repo, "package.json"));
const changesets = read(path.join(repo, ".changeset", "config.json"));

/** Every workspace package, by directory, from the globs the root declares. */
function workspaces() {
  return root.workspaces.flatMap((glob) => {
    const parent = path.join(repo, glob.replace(/\/\*$/, ""));
    return fs
      .readdirSync(parent, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => path.join(parent, entry.name))
      .filter((directory) => fs.existsSync(path.join(directory, "package.json")));
  });
}

const problems = [];
const complain = (name, said) => problems.push(`${name}: ${said}`);

const covered = (name) =>
  changesets.fixed.some((group) =>
    group.some((pattern) =>
      pattern.endsWith("*") ? name.startsWith(pattern.slice(0, -1)) : pattern === name,
    ),
  );

const published = [];

for (const directory of workspaces()) {
  const relative = path.relative(repo, directory);
  const pkg = read(path.join(directory, "package.json"));

  if (pkg.private) {
    // A private package that changesets does not know is private is a
    // package `changeset version` stops to ask about, every time.
    if (!changesets.ignore.includes(pkg.name)) {
      complain(pkg.name, "is private, so `.changeset/config.json` has to ignore it");
    }
    continue;
  }

  published.push(pkg.name);

  if (!covered(pkg.name)) {
    complain(pkg.name, "is published and not in the `fixed` group, so it would drift out of step");
  }
  if (changesets.ignore.includes(pkg.name)) {
    complain(pkg.name, "is published and ignored by changesets, which cannot both be true");
  }
  if (pkg.publishConfig?.access !== "public") {
    complain(pkg.name, 'needs `publishConfig.access: "public"`, or the publish is refused as scoped');
  }
  if (pkg.publishConfig?.registry !== REGISTRY) {
    complain(pkg.name, `needs \`publishConfig.registry: ${REGISTRY}\`, so an ambient registry cannot redirect it`);
  }
  // Provenance is refused when this does not match, case included, the
  // repository the publish ran from.
  if (pkg.repository?.url !== REPOSITORY) {
    complain(pkg.name, `needs \`repository.url: ${REPOSITORY}\` — npm provenance compares it`);
  }
  if (pkg.repository?.directory !== relative) {
    complain(pkg.name, `needs \`repository.directory: ${relative}\``);
  }
  if (!pkg.license) {
    complain(pkg.name, "has no license, and npm publishes that as UNLICENSED");
  }
  if (!Array.isArray(pkg.files) || !pkg.files.includes("dist")) {
    complain(pkg.name, "needs `files` to carry `dist`, or the tarball has no code in it");
  }

  for (const [dependency, range] of Object.entries(pkg.dependencies ?? {})) {
    if (!dependency.startsWith("@amykit/")) continue;
    if (range === "*" || range.startsWith("workspace:")) {
      complain(pkg.name, `depends on ${dependency} at \`${range}\`, which is not a range a registry can resolve`);
    }
  }
}

if (problems.length > 0) {
  process.stderr.write(`${problems.length} problem(s) in the release configuration:\n`);
  for (const problem of problems) process.stderr.write(`  ${problem}\n`);
  process.exit(1);
}

process.stdout.write(`${published.length} package(s) publishable, all in one version group\n`);
