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

/** One acceptance criterion: a checkbox, its text, and the proof it cites. */
interface Criterion {
  readonly line: number;
  readonly ticked: boolean;
  readonly proof: string;
}

const CRITERION = /^- \[( |x)\] [\s\S]*?\(proof: ([^)]*)\)/gm;
const PROOF = /\b(assertion|test|command|deferred|unspecified):(\S+)/g;

export function deliveredPromises(input: DeliveredInput): string[] {
  const problems: string[] = [];

  for (const [note, text] of Object.entries(input.notes)) {
    for (const criterion of criteriaIn(text)) {
      const at = `${note}:${criterion.line}`;
      if (!criterion.ticked) {
        problems.push(`${at} is delivered with a criterion still open — prove it and tick it, or move it to a plan in plans/`);
      }
      for (const [, kind, target] of criterion.proof.matchAll(PROOF)) {
        const cited = target!.replace(/[,.;]+$/, "");
        if (kind === "deferred" || kind === "unspecified") {
          problems.push(`${at} cites a ${kind} proof, so it was delivered without one — build it, or move the criterion to a plan in plans/`);
        } else if (kind === "assertion" && !input.requiredAssertions.has(cited)) {
          problems.push(`${at} cites the assertion ${cited}, and no gate requires it, so nothing proves it`);
        } else if (kind === "test" && cited.includes("/") && !input.exists(cited)) {
          problems.push(`${at} cites ${cited}, which does not exist`);
        }
      }
    }
  }

  return problems;
}

function criteriaIn(text: string): Criterion[] {
  return [...text.matchAll(CRITERION)].map((match) => ({
    line: text.slice(0, match.index).split("\n").length,
    ticked: match[1] === "x",
    proof: match[2]!.replace(/\s+/g, " "),
  }));
}
