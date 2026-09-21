/**
 * This repository is public and some of the work that drove it is not. This
 * is the check that keeps the two apart.
 *
 * The forbidden terms are carried as digests rather than as words, for two
 * reasons that are really one. A list of a company's private names, written
 * out in a public repository, is the leak it exists to prevent; and a check
 * that spells out what it forbids reports itself on every run. So the policy
 * carries `sha256(term)` with the term's length, and the text is reduced to
 * the same shape before it is compared.
 *
 * Matching is by window rather than by word, so a term glued into a longer
 * identifier — `AcmeDeps`, `workflow-acme`, `ACME-7716` — is found the same
 * way a term standing on its own is. That is what makes the length a part of
 * the policy: without it there is no window to hash.
 *
 * The examples above are fictional on purpose: this file is read by the check
 * it implements, and a real term in a comment here is the leak.
 */

export interface DeniedTerm {
  /** Length of the term, which is the width of the window to hash. */
  readonly length: number;
  /** Lowercase hex sha256 of the lowercased term. */
  readonly sha256: string;
}

export interface PrivateRefsInput {
  /** File contents, keyed by repository-relative path. */
  readonly files: Readonly<Record<string, string>>;
  readonly denied: readonly DeniedTerm[];
  /** Hex sha256 of a string. Injected so the rule itself stays pure. */
  readonly digest: (value: string) => string;
}

export interface PrivateRef {
  readonly file: string;
  /** 1-indexed, so the report is something an editor can be pointed at. */
  readonly line: number;
  /** The word the term was found inside, so a person knows what to remove. */
  readonly word: string;
}

/**
 * Every place a denied term appears, in reading order. An empty policy finds
 * nothing and says nothing — refusing it is the caller's job, because only
 * the caller knows whether an empty list means "nothing to hide" or "the file
 * did not load".
 */
export function findPrivateReferences(input: PrivateRefsInput): PrivateRef[] {
  const found: PrivateRef[] = [];
  const widths = [...new Set(input.denied.map((term) => term.length))].sort((a, b) => a - b);
  const digests = new Set(input.denied.map((term) => term.sha256.toLowerCase()));
  const narrowest = widths[0];
  if (narrowest === undefined) return found;

  // A repository repeats its vocabulary constantly, and hashing is the only
  // expensive thing here. One answer per distinct word is the difference
  // between a check in the pre-commit hook and a check nobody runs.
  const judged = new Map<string, boolean>();
  const carriesATerm = (word: string): boolean => {
    const remembered = judged.get(word);
    if (remembered !== undefined) return remembered;

    let hit = false;
    for (const width of widths) {
      for (let at = 0; at + width <= word.length; at += 1) {
        if (digests.has(input.digest(word.slice(at, at + width)))) {
          hit = true;
          break;
        }
      }
      if (hit) break;
    }

    judged.set(word, hit);
    return hit;
  };

  for (const [file, text] of Object.entries(input.files)) {
    const lines = text.split("\n");
    for (let index = 0; index < lines.length; index += 1) {
      for (const word of lines[index]!.toLowerCase().match(/[a-z0-9]+/g) ?? []) {
        if (word.length >= narrowest && carriesATerm(word)) {
          found.push({ file, line: index + 1, word });
        }
      }
    }
  }

  return found;
}
