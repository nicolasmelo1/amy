/**
 * What a delivered plan still promises.
 *
 * A plan is delivered when it leaves `plans/` for `docs/design/`, and from
 * then on nothing asks whether it is done. So the move itself has to be
 * honest: every criterion ticked, and every tick backed by a proof that
 * exists. A criterion that cannot be proven yet belongs to a plan in
 * `plans/`, where the board keeps asking about it.
 */

export interface DeliveredInput {
  /** Each delivered note's text, keyed by its repository-relative path. */
  readonly notes: Readonly<Record<string, string>>;
  /** Every assertion some gate in the policy requires. */
  readonly requiredAssertions: ReadonlySet<string>;
  /** Whether a repository-relative path exists. */
  readonly exists: (path: string) => boolean;
}

/** One acceptance criterion: a checkbox, and every proof it cites. */
interface Criterion {
  readonly line: number;
  readonly ticked: boolean;
  readonly proofs: readonly string[];
}

const BOX = /^- \[( |x)\] /;
const PROOF_MARKER = /\(proof: ([^)]*)\)/g;
const PROOF = /\b(assertion|test|command|deferred|unspecified):(\S+)/g;

export function deliveredPromises(input: DeliveredInput): string[] {
  const problems: string[] = [];

  for (const [note, text] of Object.entries(input.notes)) {
    for (const criterion of criteriaIn(text)) {
      const at = `${note}:${criterion.line}`;
      if (!criterion.ticked) {
        problems.push(`${at} is delivered with a criterion still open — prove it and tick it, or move it to a plan in plans/`);
      }
      if (criterion.proofs.length === 0) {
        problems.push(`${at} names no proof, so nothing says it holds — cite the check that proves it`);
      }
      for (const proof of criterion.proofs) problems.push(...unprovenIn(at, proof, input));
    }
  }

  return problems;
}

/** What one proof marker cites that does not hold: a debt, an assertion nobody runs, a missing test. */
function unprovenIn(at: string, proof: string, input: DeliveredInput): string[] {
  const problems: string[] = [];
  for (const [, kind, target] of proof.matchAll(PROOF)) {
    const cited = target!.replace(/[,.;]+$/, "");
    if (kind === "deferred" || kind === "unspecified") {
      problems.push(`${at} cites a ${kind} proof, so it was delivered without one — build it, or move the criterion to a plan in plans/`);
    } else if (kind === "assertion" && !input.requiredAssertions.has(cited)) {
      problems.push(`${at} cites the assertion ${cited}, and no gate requires it, so nothing proves it`);
    } else if (kind === "test" && !input.exists(cited)) {
      problems.push(`${at} cites ${cited}, which does not exist`);
    }
  }
  return problems;
}

/**
 * Each checkbox and the indented lines under it, read as one block, so a
 * criterion with no proof never borrows the next one's.
 */
function criteriaIn(text: string): Criterion[] {
  const lines = text.split("\n");
  const criteria: Criterion[] = [];
  for (let index = 0; index < lines.length; index += 1) {
    const box = BOX.exec(lines[index]!);
    if (!box) continue;
    let end = index + 1;
    while (end < lines.length && /^\s+\S/.test(lines[end]!)) end += 1;
    const block = lines.slice(index, end).join(" ").replace(/\s+/g, " ");
    criteria.push({
      line: index + 1,
      ticked: box[1] === "x",
      proofs: [...block.matchAll(PROOF_MARKER)].map((match) => match[1]!),
    });
    index = end - 1;
  }
  return criteria;
}
