import type { BriefRecord, BriefRefusal } from "@amykit/core";

/** The sections a feature's brief answers, in the order grooming asks them. */
export const BRIEF_SECTIONS = ["Goal", "Sources", "Criteria", "Out of scope"] as const;

function lines(brief: Pick<BriefRecord, "sections">, name: string): string[] {
  return (brief.sections.find((section) => section.name === name)?.body ?? "")
    .split("\n")
    .map((line) => line.trim().replace(/^- /, ""))
    .filter((line) => line !== "");
}

/**
 * Judges a groomed brief: every source is `S<n>: where it comes from`, and
 * every criterion is `C<n>: what holds (source: S<n>)`, citing a source the
 * brief lists. A criterion naming no source is a requirement nobody can
 * trace, and the proof would be asked to show it anyway.
 */
export function checkBrief(brief: Pick<BriefRecord, "sections">): BriefRefusal[] {
  const refusals: BriefRefusal[] = [];
  const sources = new Set<string>();
  for (const line of lines(brief, "Sources")) {
    const id = /^(S\d+): \S/.exec(line)?.[1];
    if (id === undefined) refusals.push({ section: "Sources", rule: `\`${line}\` is not \`S<n>: where it comes from\`` });
    else sources.add(id);
  }
  const criteria = new Set<string>();
  for (const line of lines(brief, "Criteria")) {
    const read = /^(C\d+): .+ \(source: (S\d+)\)$/.exec(line);
    if (!read) {
      refusals.push({ section: "Criteria", rule: `\`${line}\` is not \`C<n>: what holds (source: S<n>)\`` });
      continue;
    }
    if (criteria.has(read[1]!)) refusals.push({ section: "Criteria", rule: `${read[1]} is named twice` });
    criteria.add(read[1]!);
    if (!sources.has(read[2]!)) refusals.push({ section: "Criteria", rule: `${read[1]} cites ${read[2]}, which Sources does not list` });
  }
  return refusals;
}

/** The criteria a brief settled, by id, in the order it lists them. */
export function criteriaOf(brief: Pick<BriefRecord, "sections">): string[] {
  return lines(brief, "Criteria").flatMap((line) => /^(C\d+): /.exec(line)?.[1] ?? []);
}
