import { Note } from "./ports/Notes.js";

/** How many words of the note the slug is allowed to keep. */
const SLUG_WORDS = 8;

/**
 * The name the plan file, the branch and the pull request all take.
 *
 * Derived from the note rather than handed down by anything, because there is
 * no tracker here to own a slug. That makes it this workflow's job to be
 * deterministic about it: the same note produces the same name on the first
 * attempt and on the fourth, so a retry rewrites the draft it started rather
 * than leaving a trail of near-identical files behind.
 */
export function slugFor(note: Note): string {
  const words = note.text
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, " ")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, SLUG_WORDS);

  // A note of pure punctuation still has to land somewhere nameable, and the
  // id is the one thing every note has.
  return words.length > 0 ? words.join("-") : `note-${note.id}`;
}

/** Where the plan is written, relative to the repository's root. */
export function planPathFor(slug: string): string {
  return `plans/${slug}.md`;
}

export function branchFor(slug: string): string {
  return `amy/plan-${slug}`;
}

export function pullRequestTitle(slug: string): string {
  return `docs(plans): ${slug.replace(/-/g, " ")}`;
}

/**
 * What the pull request says for itself.
 *
 * The friction is quoted verbatim and the source is named, because a plan
 * that cannot say what went wrong is a plan nobody can weigh. There is no
 * ticket behind this one to carry that, which is exactly the case this
 * workflow exists for.
 */
export function pullRequestBody(note: Note, slug: string): string {
  return [
    `This plan came out of friction this machine hit.`,
    ``,
    ...note.text.trim().split("\n").map((line) => `> ${line}`),
    ``,
    `Noted by ${note.source} on ${note.writtenAt}.`,
    ``,
    `It adds \`${planPathFor(slug)}\` and its line in \`plans/next-steps.md\`.`,
    `Merging it decides the work is worth doing; nothing here has decided that.`,
  ].join("\n");
}
