// The gate's two detectors, read as findings one ratchet can hold.
//
// `knip --production` answers what only a test reaches; `jscpd` answers what is
// written twice. Neither remembers anything, so this gives both one shape and
// holds the list to scripts/duplication-baseline.json: what the tree already
// carries is frozen by name with a date, and anything else fails.
import { createHash } from "node:crypto";
import path from "node:path";

/** Which detector spoke. The key carries it, so one ratchet holds both. */
type Detector = "knip" | "jscpd";

export type Finding = {
  detector: Detector;
  /** Stable across unrelated edits: a shift of lines is not a new finding. */
  key: string;
  /** One line a reader can act on; a clone names both places. */
  detail: string;
};

/** A frozen finding, and the day somebody has to look at it again. */
type Frozen = { review_by: string; note: string };

export type Baseline = { version: 1; frozen: Record<string, Frozen> };

/** A frozen due date the merge base set, and the later one this change wrote. */
type Extended = { key: string; was: string; now: string };

export type Verdict = {
  added: Finding[];
  /** In this baseline, but not in the one the merge base froze: debt grown by an edit. */
  grown: Finding[];
  /** Frozen entries whose due date moved later than the base set it, with both dates. */
  extended: Extended[];
  gone: string[];
  unreviewed: string[];
  overdue: string[];
};

type Named = { name: string };

type KnipIssue = {
  file: string;
  files?: readonly Named[];
  exports?: readonly Named[];
  types?: readonly Named[];
  dependencies?: readonly Named[];
  unlisted?: readonly Named[];
  unresolved?: readonly Named[];
  enumMembers?: readonly Named[];
};

export type KnipReport = { issues?: readonly KnipIssue[] };

type CloneSide = { name: string; start: number; end: number };

type Clone = { tokens: number; fragment?: string; firstFile: CloneSide; secondFile: CloneSide };

export type JscpdReport = { duplicates?: readonly Clone[] };

const DATE = /^\d{4}-\d{2}-\d{2}$/;

/** What each knip issue kind is called in a finding: a key part and a sentence. */
const KNIP_KINDS = [
  ["files", "file", "is reached by nothing outside a test"],
  ["exports", "export", "is exported and nothing outside a test reaches it"],
  ["types", "type", "is an exported type nothing outside a test names"],
  ["dependencies", "dependency", "is installed and nothing imports it"],
  ["unlisted", "unlisted", "is imported and no manifest declares it"],
  ["unresolved", "unresolved", "is imported and cannot be resolved"],
  ["enumMembers", "member", "is an enum member nothing reads"],
] as const;

/** Every issue a knip production report carries, as one finding each. */
export function knipFindings(report: KnipReport): Finding[] {
  const findings: Finding[] = [];
  for (const issue of report.issues ?? []) {
    for (const [field, kind, sentence] of KNIP_KINDS) {
      for (const entry of issue[field] ?? []) {
        const named = field === "files" ? issue.file : entry.name;
        const where = field === "files" ? issue.file : `${issue.file}: ${entry.name}`;
        findings.push({
          detector: "knip",
          key: `knip:${issue.file}#${kind}:${named}`,
          detail: `${where} ${sentence}`,
        });
      }
    }
  }
  return findings;
}

/** A file as this repository names it, whichever way the detector named it. */
function relative(root: string, file: string): string {
  const resolved = path.isAbsolute(file) ? path.relative(root, file) : file;
  return resolved.split(path.sep).join("/");
}

/**
 * Every clone jscpd found, keyed by the two files and what was copied.
 *
 * Line numbers are left out on purpose: they move whenever anything above them
 * is edited, and a ratchet whose keys move is a ratchet that churns. The digest
 * of the copied text is what makes two clones between the same pair of files
 * two keys, and what makes editing one of them a finding again.
 */
export function jscpdFindings(report: JscpdReport, root: string): Finding[] {
  const clones = [...(report.duplicates ?? [])].sort(
    (left, right) => left.firstFile.start - right.firstFile.start || left.secondFile.start - right.secondFile.start,
  );
  const numbered = new Map<string, number>();
  return clones.map((clone) => {
    const [first, second] = [relative(root, clone.firstFile.name), relative(root, clone.secondFile.name)].sort();
    const digest = createHash("sha256").update(clone.fragment ?? "").digest("hex").slice(0, 12);
    const base = `jscpd:${first}<->${second}#${clone.tokens}:${digest}`;
    // Two blocks with the same text between the same pair are two findings, not
    // one. The ordinal is by position, so a shift above them keeps it.
    const seen = (numbered.get(base) ?? 0) + 1;
    numbered.set(base, seen);
    return {
      detector: "jscpd",
      key: seen === 1 ? base : `${base}@${seen}`,
      detail:
        `${first}:${clone.firstFile.start}-${clone.firstFile.end} and ` +
        `${second}:${clone.secondFile.start}-${clone.secondFile.end} hold the same ${clone.tokens}-token block`,
    };
  });
}

/**
 * What the detectors report now, against what this repository froze.
 *
 * `before` is the baseline as the merge base froze it. With it, a key this
 * baseline names and the base did not is debt the change grew: the file was
 * edited to take a finding the base had refused, and that fails like an
 * unfrozen finding does. Without it — a base that carries no baseline — the
 * comparison is the adoption step and only what this file names passes.
 */
export function compare(baseline: Baseline, findings: readonly Finding[], today: string, before?: Baseline): Verdict {
  const present = new Set(findings.map((finding) => finding.key));
  const frozen = Object.entries(baseline.frozen);
  const still = frozen.filter(([key]) => present.has(key));
  const added: Finding[] = [];
  const grown: Finding[] = [];
  const extended: Extended[] = [];
  for (const finding of findings) {
    const current = baseline.frozen[finding.key];
    const base = before?.frozen[finding.key];
    if (current === undefined) added.push(finding);
    else if (before !== undefined && base === undefined) grown.push(finding);
    else if (base !== undefined && DATE.test(base.review_by) && DATE.test(current.review_by) && current.review_by > base.review_by) {
      extended.push({ key: finding.key, was: base.review_by, now: current.review_by });
    }
  }
  return {
    added,
    grown,
    extended: extended.sort((left, right) => left.key.localeCompare(right.key)),
    gone: frozen.filter(([key]) => !present.has(key)).map(([key]) => key).sort(),
    unreviewed: still.filter(([, entry]) => !DATE.test(entry.review_by ?? "")).map(([key]) => key).sort(),
    overdue: still.filter(([, entry]) => DATE.test(entry.review_by ?? "") && entry.review_by < today).map(([key]) => key).sort(),
  };
}

/** The baseline with every finding that no longer exists dropped. */
export function shrunk(baseline: Baseline, verdict: Verdict): Baseline {
  const gone = new Set(verdict.gone);
  const frozen = Object.entries(baseline.frozen).filter(([key]) => !gone.has(key));
  return { version: 1, frozen: Object.fromEntries(frozen) };
}

/** Whether a verdict is something the gate can pass. */
export function passed(verdict: Verdict): boolean {
  return (
    verdict.added.length === 0 &&
    verdict.grown.length === 0 &&
    verdict.extended.length === 0 &&
    verdict.unreviewed.length === 0 &&
    verdict.overdue.length === 0
  );
}

/** The lines a failing gate prints, in the order a reader can act on them. */
export function render(verdict: Verdict): string[] {
  const lines: string[] = [];
  for (const finding of verdict.added) {
    lines.push(`not frozen: ${finding.detail}`);
    lines.push(`  write it once, or give it a production caller: the baseline holds only what the merge base froze`);
  }
  for (const finding of verdict.grown) {
    lines.push(`added to the baseline outside the merge base: ${finding.detail}`);
    lines.push(`  the base did not hold this key, so the ratchet cannot take it: write it once, or give it a production caller`);
  }
  for (const entry of verdict.extended) {
    lines.push(`review_by moved later than the merge base: ${entry.key} (was ${entry.was}, now ${entry.now})`);
  }
  for (const key of verdict.unreviewed) {
    lines.push(`frozen without a review_by: ${key}`);
  }
  for (const key of verdict.overdue) {
    lines.push(`frozen past its review_by: ${key}`);
  }
  for (const key of verdict.gone) {
    lines.push(`no longer found: ${key}`);
  }
  return lines;
}
