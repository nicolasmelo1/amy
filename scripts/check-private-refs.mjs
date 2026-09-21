// Refuses to let a private name reach a public repository.
//
// The terms live in scripts/private-terms.json as digests, never as words,
// so this repository does not publish the list of what it is hiding. Two
// flags keep that list usable without ever writing a term down:
//
//   node scripts/check-private-refs.mjs --add <term>      adds it, hashed
//   node scripts/check-private-refs.mjs --explain <term>  says if it is covered
//
// Neither prints the term back into a file. `--explain` is also the answer to
// "is this list still real": a digest cannot be read backwards, so the only
// proof that a term is covered is asking.
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

const repo = path.resolve(import.meta.dirname, "..");
const file = (relative) => path.join(repo, relative);
const policyPath = file("scripts/private-terms.json");
const digest = (value) => createHash("sha256").update(value).digest("hex");

const readPolicy = () => JSON.parse(fs.readFileSync(policyPath, "utf8"));
const writePolicy = (policy) =>
  fs.writeFileSync(policyPath, `${JSON.stringify(policy, null, 2)}\n`, "utf8");

const [flag, argument] = process.argv.slice(2);

if (flag === "--add") {
  if (!argument) {
    console.error("usage: node scripts/check-private-refs.mjs --add <term>");
    process.exit(1);
  }

  const term = argument.toLowerCase();
  const policy = readPolicy();
  const entry = { length: term.length, sha256: digest(term) };
  if (policy.denied.some((denied) => denied.sha256 === entry.sha256)) {
    console.log("that term is already denied");
    process.exit(0);
  }

  policy.denied = [...policy.denied, entry].sort((a, b) => a.sha256.localeCompare(b.sha256));
  writePolicy(policy);
  console.log(`denied one more term, ${policy.denied.length} in total`);
  process.exit(0);
}

if (flag === "--explain") {
  if (!argument) {
    console.error("usage: node scripts/check-private-refs.mjs --explain <term>");
    process.exit(1);
  }

  const term = argument.toLowerCase();
  const { denied } = readPolicy();
  const covered = denied.some(
    (entry) =>
      entry.length <= term.length &&
      Array.from({ length: term.length - entry.length + 1 }, (_, at) =>
        digest(term.slice(at, at + entry.length)),
      ).includes(entry.sha256),
  );

  console.log(covered ? "denied: this term would fail the check" : "not denied");
  process.exit(covered ? 0 : 1);
}

if (!fs.existsSync(file("packages/cli/dist/private-refs.js"))) {
  console.error("packages/cli/dist/private-refs.js is not built. Run `npm run build` first.");
  process.exit(1);
}

const { findPrivateReferences } = await import(
  pathToFileURL(file("packages/cli/dist/private-refs.js")).href
);

const policy = readPolicy();
// An empty list would pass every file in the repository while looking like a
// check. Deleting the terms has to be as loud as tripping over one.
if (!Array.isArray(policy.denied) || policy.denied.length === 0) {
  console.error("scripts/private-terms.json denies nothing, so this check proves nothing.");
  process.exit(1);
}

const tracked = execFileSync("git", ["ls-files", "-z"], { cwd: repo, encoding: "buffer" })
  .toString("utf8")
  .split("\0")
  .filter(Boolean);

const files = {};
for (const relative of tracked) {
  const absolute = file(relative);
  if (!fs.existsSync(absolute) || fs.statSync(absolute).isDirectory()) continue;
  const bytes = fs.readFileSync(absolute);
  // A NUL byte is the cheap, portable "this is not text". Hashing windows of
  // a binary would be slow and would report offsets nobody can act on.
  if (bytes.includes(0)) continue;
  files[relative] = bytes.toString("utf8");
}

const found = findPrivateReferences({ files, denied: policy.denied, digest });

if (found.length > 0) {
  console.error("A private name reached a public repository:\n");
  for (const { file: where, line, word } of found) console.error(`  ${where}:${line}  ${word}`);
  console.error(
    "\nRemove it. If the word is innocent and the match is a coincidence, the term" +
      "\nitself is too broad — narrow it rather than adding an exception here.",
  );
  process.exit(1);
}

console.log(
  `private names: ${Object.keys(files).length} tracked files carry none of the ${policy.denied.length} denied terms`,
);
