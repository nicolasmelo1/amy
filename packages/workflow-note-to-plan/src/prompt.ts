import { Note } from "./ports/Notes.js";
import { planPathFor } from "./plan-file.js";

/**
 * What the agent is asked for, and nothing about how to judge it.
 *
 * The quality bar is deliberately not written out here as a rubric. It is
 * `sf check` in the repository being written into, which is the same bar a
 * human contributor meets, and a red one comes back as the finding rather
 * than as a rule this prompt tried to anticipate. What the prompt does say is
 * where the two files are, because that is a fact about the repository rather
 * than a judgement about the writing.
 */
export function draftPrompt(note: Note, slug: string, finding?: string): string {
  return [
    `Write a plan for a piece of friction this machine hit while working.`,
    ``,
    `The friction, verbatim:`,
    ``,
    ...note.text.trim().split("\n").map((line) => `> ${line}`),
    ``,
    `Noted by ${note.source} on ${note.writtenAt}.`,
    ``,
    `Write it to \`${planPathFor(slug)}\` in the current repository, and add its`,
    `line to \`plans/next-steps.md\` so it sits in the execution order. Follow the`,
    `conventions of the plans already there.`,
    ``,
    `\`sf check\` is what decides whether this holds, and it is run against your`,
    `work in a moment. A plan that declares no exit condition, or that is missing`,
    `from the ordered list, is refused by it.`,
    ...(finding
      ? [
          ``,
          `A previous attempt did not hold. This is what was said, verbatim:`,
          ``,
          finding,
          ``,
          `Fix the underlying cause. Do not discard what was already right.`,
        ]
      : []),
    ``,
    `Propose the work; do not do it. Do not commit: that is handled for you.`,
  ].join("\n");
}
