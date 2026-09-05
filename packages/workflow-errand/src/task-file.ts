import { Task } from "./ports/Tasks.js";

/** How many words of the task become the branch name. */
const WORDS = 6;

/**
 * A branch name from what somebody typed.
 *
 * Derived rather than asked for: the whole promise of `amy btw` is that
 * capturing costs one sentence, and a prompt for a branch name is the
 * ceremony that stops people using it.
 */
export function slugFor(task: Task): string {
  const words = task.text
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, " ")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, WORDS);

  return words.length > 0 ? words.join("-") : task.id;
}

export function branchFor(slug: string): string {
  return `amy/errand-${slug}`;
}

export function pullRequestTitle(task: Task): string {
  const first = task.text.trim().split("\n")[0] ?? "";
  return first.length > 72 ? `${first.slice(0, 69)}...` : first;
}

/**
 * The description, written out.
 *
 * There is no ticket behind an errand to be the description, so the body has
 * to carry what a reviewer would otherwise have to ask for: what was asked,
 * by whom, and that a machine did it.
 */
export function pullRequestBody(task: Task, said: string): string {
  return [
    `**Asked for by ${task.source}**, ${task.addedAt}:`,
    ``,
    `> ${task.text.trim().split("\n").join("\n> ")}`,
    ``,
    `---`,
    ``,
    said.trim() || "The agent left no account of what it did.",
    ``,
    `This was an errand — captured with \`amy btw\`, never a ticket.`,
  ].join("\n");
}
