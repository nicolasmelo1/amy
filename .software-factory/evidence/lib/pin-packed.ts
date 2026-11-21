// Pins the packed `@amykit` closure an install reaches into the root it is
// installed into, so npm resolves those names from this checkout's tarballs
// and never asks the registry for them.
//
// A plugin packed here asks for `@amykit/core` at this checkout's version. On
// the commit that bumps that version, the registry does not have it yet: the
// release publishes it minutes later, in another job. Without the pin, npm
// went to the registry for the transitive core, found nothing, and the
// scenario died before its first assertion. The release commits of 0.8.0 and
// 0.9.0 were both red for this alone.
//
// Usage: tsx pin-packed.ts <root package.json> <tarballs dir> [<name>=<dir> ...] -- <npm args...>
//   <name>=<dir>  a third-party package the stand-in answers from a directory,
//                 read for what it depends on.
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

type Manifest = { dependencies?: Record<string, string>; peerDependencies?: Record<string, string>; overrides?: Record<string, string> };

const [manifest, tarballs, ...rest] = process.argv.slice(2);
if (manifest === undefined || tarballs === undefined) throw new Error("usage: pin-packed.ts <root package.json> <tarballs dir> [<name>=<dir> ...] -- <npm args...>");
const split = rest.indexOf("--");
const thirdParty: Record<string, string> = Object.fromEntries((split < 0 ? rest : rest.slice(0, split)).map((pair) => {
  const at = pair.indexOf("=");
  return [pair.slice(0, at), pair.slice(at + 1)];
}));
const asked = split < 0 ? [] : rest.slice(split + 1);

const packed: Record<string, string> = Object.fromEntries(fs.readdirSync(tarballs).filter((file) => file.endsWith(".tgz")).map((file) => {
  const name = file.replace(/-\d+\.\d+\.\d+.*\.tgz$/, "").replace(/^amykit-/, "@amykit/");
  return [name, path.join(tarballs, file)];
}));

const manifestOf = (place: string): Manifest => place.endsWith(".tgz")
  ? JSON.parse(execFileSync("tar", ["-xzOf", place, "package/package.json"], { encoding: "utf8" })) as Manifest
  : JSON.parse(fs.readFileSync(path.join(place, "package.json"), "utf8")) as Manifest;
const needs = (place: string): string[] => {
  const one = manifestOf(place);
  return Object.keys({ ...one.dependencies, ...one.peerDependencies });
};

const body = JSON.parse(fs.readFileSync(manifest, "utf8")) as Manifest;
const seeds = Object.keys(body.dependencies ?? {});
for (const arg of asked) {
  const local = thirdParty[arg];
  if (packed[arg]) seeds.push(arg);
  else if (local) seeds.push(...needs(local));
}
const reached = new Set<string>();
const visit = (name: string): void => {
  const place = packed[name];
  if (!place || reached.has(name)) return;
  reached.add(name);
  needs(place).forEach(visit);
};
seeds.forEach(visit);

// What the invocation names, npm writes into the manifest itself; an absolute
// pin for the same name conflicts with it. npm 11 honours an override only
// when a direct dependency names the identical file spec, so both are written.
const pinned = Object.fromEntries([...reached].filter((name) => !asked.includes(name)).map((name) => [name, `file:${packed[name]}`]));
body.dependencies = { ...body.dependencies, ...pinned };
body.overrides = { ...body.overrides, ...pinned };
fs.writeFileSync(manifest, `${JSON.stringify(body, null, 2)}\n`);
