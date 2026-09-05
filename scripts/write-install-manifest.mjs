// Writes the `package.json` an amy install resolves its plugins from.
//
// Usage: node scripts/write-install-manifest.mjs <tarball-dir> <install-dir> [package...]
//
// Named packages are what gets installed; naming none installs everything
// that was packed. That is the phase's whole point: a machine carries the
// plugins it uses and nothing else.
//
// Every `@amy/*` is also an override, because the tarballs depend on each
// other by version range and this repository's versions are not on a registry
// yet. An override is the one thing npm applies to a transitive resolution.
import fs from "node:fs";
import path from "node:path";

const [tarballs, into, ...wanted] = process.argv.slice(2);

if (!tarballs || !into) {
  process.stderr.write("usage: write-install-manifest.mjs <tarball-dir> <install-dir> [pkg...]\n");
  process.exit(1);
}

/** Every tarball `npm pack` left, by the package name inside it. */
const packed = new Map();
for (const file of fs.readdirSync(tarballs)) {
  if (!file.endsWith(".tgz")) continue;
  // `amy-plugin-github-0.1.0.tgz` is what npm names `@amy/plugin-github`.
  const name = file.replace(/-\d+\.\d+\.\d+.*\.tgz$/, "").replace(/^amy-/, "@amy/");
  packed.set(name, path.resolve(tarballs, file));
}

const install = wanted.length > 0 ? wanted : [...packed.keys()];
const missing = install.filter((name) => !packed.has(name));

if (missing.length > 0) {
  process.stderr.write(`not packed, so not installable: ${missing.join(", ")}\n`);
  process.exit(1);
}

const dependencies = Object.fromEntries(install.map((name) => [name, `file:${packed.get(name)}`]));
const overrides = Object.fromEntries([...packed].map(([name, file]) => [name, `file:${file}`]));

fs.mkdirSync(into, { recursive: true });
fs.writeFileSync(
  path.join(into, "package.json"),
  `${JSON.stringify({ name: "amy-install", private: true, dependencies, overrides }, null, 2)}\n`,
  "utf-8",
);

process.stdout.write(`${install.length} package(s) to install into ${into}\n`);
