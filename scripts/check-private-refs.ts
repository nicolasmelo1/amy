// Refuses to let a private name reach a public repository.
//
// The terms live in scripts/private-terms.json as digests, never as words,
// so this repository does not publish the list of what it is hiding. Two
// flags keep that list usable without ever writing a term down:
//
//   tsx scripts/check-private-refs.ts --add <term>         adds it, hashed
//   tsx scripts/check-private-refs.ts --add <term> --word  only as a whole word
//   tsx scripts/check-private-refs.ts --explain <term>     says if it is covered
//
// `--word` is for a term short enough to hide inside ordinary words: a
// three-letter ticket key would otherwise fire on every identifier that
// happens to contain those letters.
//
// It judges the tree it is run from, so `L6.A_PRIVATE_NAME_STAYS_PRIVATE`
// can prove it on its mutation fixture: the policy and the files are read
// from the working directory, and only the built matcher from this checkout.
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
const root = process.cwd();
const file = (relative: string) => path.join(root, relative);
const policyPath = file("scripts/private-terms.json");
const digest = (value: string) => createHash("sha256").update(value).digest("hex");

interface DeniedTerm {
  length: number;
  sha256: string;
  word?: boolean;
}

/** `scripts/private-terms.json`: why it exists, and the digests it denies. */
interface TermPolicy {
  _why: string;
  denied: DeniedTerm[];
}

const readPolicy = (): TermPolicy => JSON.parse(fs.readFileSync(policyPath, "utf8"));
const writePolicy = (policy: TermPolicy) =>
  fs.writeFileSync(policyPath, `${JSON.stringify(policy, null, 2)}\n`, "utf8");

const [flag, argument, modifier] = process.argv.slice(2);

if (flag === "--add") {
  if (!argument) {
    console.error("usage: tsx scripts/check-private-refs.ts --add <term> [--word]");
    process.exit(1);
  }

  const term = argument.toLowerCase();
  const policy = readPolicy();
  const entry: DeniedTerm = { length: term.length, sha256: digest(term), ...(modifier === "--word" ? { word: true } : {}) };
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
    console.error("usage: tsx scripts/check-private-refs.ts --explain <term>");
    process.exit(1);
  }

  // Split the way the check splits, so the answer is the check's answer.
  const words = argument.toLowerCase().match(/[a-z0-9]+/g) ?? [];
  const { denied } = readPolicy();
  const windows = (word: string, width: number) =>
    Array.from({ length: Math.max(0, word.length - width + 1) }, (_, at) => digest(word.slice(at, at + width)));
  const covered = denied.some((entry) =>
    words.some((word) => (entry.word ? digest(word) === entry.sha256 : windows(word, entry.length).includes(entry.sha256))),
  );

  console.log(covered ? "denied: this term would fail the check" : "not denied");
  process.exit(covered ? 0 : 1);
}

if (!fs.existsSync(path.join(repo, "packages/cli/dist/private-refs.js"))) {
  console.error("packages/cli/dist/private-refs.js is not built. Run `npm run build` first.");
  process.exit(1);
}

const { findPrivateReferences }: typeof import("../packages/cli/src/private-refs.js") = await import(
  pathToFileURL(path.join(repo, "packages/cli/dist/private-refs.js")).href
);

const policy = readPolicy();
// An empty list would pass every file in the repository while looking like a
// check. Deleting the terms has to be as loud as tripping over one.
if (!Array.isArray(policy.denied) || policy.denied.length === 0) {
  console.error("scripts/private-terms.json denies nothing, so this check proves nothing.");
  process.exit(1);
}

// Untracked files too, minus the ignored ones: a new file is exactly where a
// name arrives, and the hook runs before anything is staged.
const tracked = execFileSync("git", ["ls-files", "-z", "--cached", "--others", "--exclude-standard"], {
  cwd: root,
  encoding: "buffer",
})
  .toString("utf8")
  .split("\0")
  .filter(Boolean);

const files: Record<string, string> = {};
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
  // The place, never the word: this output lands in CI logs, which a public
  // repository publishes, and printing the term is the leak being refused.
  for (const { file: where, line, word } of found) {
    console.error(`  ${where}:${line}  a word of ${word.length} characters`);
  }
  console.error(
    "\nRemove it. If the word is innocent and the match is a coincidence, the term" +
      "\nitself is too broad — narrow it rather than adding an exception here.",
  );
  process.exit(1);
}

console.log(
  `private names: ${Object.keys(files).length} tracked files carry none of the ${policy.denied.length} denied terms`,
);
