// The gate step both detectors go through.
//
// `npm run check:duplication` runs `knip --production` and `jscpd`, reads what
// each one said, and holds the result to scripts/duplication-baseline.json.
// A finding the baseline does not name fails; a finding it names and no longer
// exists is dropped from the file, so the ratchet only ever shrinks.
//
// The baseline the merge base froze is read from git and passed to the
// comparison, so a finding this change introduced cannot be taken into the file:
// the ratchet holds what the base already carried, and nothing else.
//
// `--seed` writes the baseline from what the tree reports right now. It is the
// adoption step, run once on a tree that has no baseline, and it refuses to run
// over one: it is never a way to make a red gate green.
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  type Baseline,
  type Finding,
  compare,
  jscpdFindings,
  knipFindings,
  passed,
  render,
  shrunk,
} from "../packages/cli/src/duplication.js";

const root = path.resolve(import.meta.dirname, "..");
const BASELINE = path.join(root, "scripts", "duplication-baseline.json");
const REVIEW_BY = "2027-03-03";
const NOTES = {
  knip: "Reached only through a dynamic import of the built dist, or by a test: delete it or give it a production caller",
  jscpd: "The same block in two places: fold it into one helper, or say here why the copy has to stay",
};

/** Runs one package script, returning what it wrote and whether it succeeded. */
function run(script: string, args: readonly string[] = []): { ok: boolean; stdout: string; stderr: string } {
  const result = spawnSync("npm", ["run", "--silent", script, ...(args.length > 0 ? ["--", ...args] : [])], {
    cwd: root,
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
  });
  return { ok: result.status === 0, stdout: result.stdout ?? "", stderr: result.stderr ?? "" };
}

/** Parses a detector's JSON, refusing a report it could not write at all. */
function report<T>(name: string, said: { ok: boolean; stdout: string; stderr: string }): T {
  try {
    return JSON.parse(said.stdout) as T;
  } catch {
    throw new Error(
      `${name} did not answer with JSON (exit ${said.ok ? 0 : "non-zero"}). ` +
        `It has to be installed and wired before this check can say anything:\n${said.stderr.trim()}`,
    );
  }
}

/** Both detectors, run now, for the tree at this commit. */
function measured(): Finding[] {
  const knip = report<Parameters<typeof knipFindings>[0]>("knip", run("knip"));
  const output = fs.mkdtempSync(path.join(os.tmpdir(), "amy-jscpd-"));
  const jscpd = run("jscpd", ["--output", output]);
  const file = path.join(output, "jscpd-report.json");
  if (!fs.existsSync(file)) {
    throw new Error(`jscpd wrote no report (exit ${jscpd.ok ? 0 : "non-zero"}):\n${jscpd.stderr.trim()}`);
  }
  const clones = JSON.parse(fs.readFileSync(file, "utf8")) as Parameters<typeof jscpdFindings>[0];
  fs.rmSync(output, { recursive: true, force: true });
  return [...knipFindings(knip), ...jscpdFindings(clones, root)];
}

/** One git command, quiet, in this checkout. */
function git(args: readonly string[]): { ok: boolean; stdout: string } {
  const result = spawnSync("git", ["-C", root, ...args], { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
  return { ok: result.status === 0, stdout: result.stdout ?? "" };
}

/**
 * The baseline as the merge base froze it, or nothing when the base had none.
 *
 * A base with no baseline is adoption: there is no earlier ratchet to grow from,
 * and the file this change writes is the first one. A base that cannot be found
 * at all is an error, because passing every key in that case would quietly turn
 * "this key was already debt" into "anything this file names is debt".
 */
function atBase(): Baseline | undefined {
  const ref = ["origin/main", "main"].find((name) => git(["rev-parse", "--verify", "--quiet", name]).ok);
  if (ref === undefined) {
    throw new Error("no origin/main or main to compare against: the ratchet holds only what the merge base froze");
  }
  const mergeBase = git(["merge-base", "HEAD", ref]);
  if (!mergeBase.ok) {
    throw new Error(`no merge base with ${ref}: the ratchet holds only what the merge base froze`);
  }
  const shown = git(["show", `${mergeBase.stdout.trim()}:${path.relative(root, BASELINE)}`]);
  if (!shown.ok) return undefined;
  return JSON.parse(shown.stdout) as Baseline;
}

/** The baseline as it sits on disk, or the reason there is not one. */
function frozen(): Baseline {
  if (!fs.existsSync(BASELINE)) {
    throw new Error(`${path.relative(root, BASELINE)} does not exist. Run \`npm run check:duplication -- --seed\` once.`);
  }
  return JSON.parse(fs.readFileSync(BASELINE, "utf8")) as Baseline;
}

/** Every finding measured now, frozen with one date and the reason it is debt. */
function seeded(findings: readonly Finding[]): Baseline {
  const entries = findings.map((finding) => [finding.key, { review_by: REVIEW_BY, note: NOTES[finding.detector] }] as const);
  return { version: 1, frozen: Object.fromEntries(entries) };
}

function main(): number {
  const named = path.relative(root, BASELINE);
  if (process.argv.includes("--seed")) {
    if (fs.existsSync(BASELINE)) {
      console.error(
        `${named} already exists, and --seed does not rewrite a ratchet that is holding debt. ` +
          `New findings are fixed where they are written; the file only shrinks.`,
      );
      return 1;
    }
    const findings = measured();
    fs.writeFileSync(BASELINE, `${JSON.stringify(seeded(findings), null, 2)}\n`, "utf8");
    console.log(`froze ${findings.length} finding(s) in ${named}, due ${REVIEW_BY}`);
    return 0;
  }

  const findings = measured();
  const baseline = frozen();
  const today = new Date().toISOString().slice(0, 10);
  const verdict = compare(baseline, findings, today, atBase());
  if (verdict.gone.length > 0) {
    fs.writeFileSync(BASELINE, `${JSON.stringify(shrunk(baseline, verdict), null, 2)}\n`, "utf8");
  }
  const lines = render(verdict);
  if (lines.length > 0) console.log(lines.join("\n"));
  if (!passed(verdict)) {
    console.error(
      `\nduplication: ${verdict.added.length} new, ${verdict.grown.length} grown outside the base, ` +
        `${verdict.extended.length} review dates moved later, ${verdict.unreviewed.length} without a review_by, ${verdict.overdue.length} past theirs`,
    );
    return 1;
  }
  console.log(
    `duplication: ${findings.length} frozen finding(s), knip --production and jscpd, ` +
      `${verdict.gone.length} dropped as no longer found`,
  );
  return 0;
}

try {
  process.exitCode = main();
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}
