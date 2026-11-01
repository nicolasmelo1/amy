import fs from "node:fs";
import path from "node:path";
import { NewTask, Task } from "./ports/Tasks.js";

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

/**
 * A task, as the file an editor or a hook would leave.
 *
 * Written here rather than in the store adapter because `amy btw` writes it
 * on a machine that will not mount: both callers share one format, and the
 * workflow that reads the directory is the one that owns its vocabulary.
 */
export function writeTaskFile(directory: string, task: NewTask, now: Date): Task {
  fs.mkdirSync(directory, { recursive: true });
  const written: Task = { ...task, id: freeTaskId(directory, now), addedAt: now.toISOString() };
  fs.writeFileSync(path.join(directory, `${written.id}.md`), taskMarkdown(written), "utf-8");
  return written;
}

function taskMarkdown(task: Task): string {
  return ["---", `repo: ${task.repo}`, `source: ${task.source}`, `added: ${task.addedAt}`, "---", "", task.text.trim(), ""].join("\n");
}

function freeTaskId(directory: string, now: Date): string {
  const stamp = `task-${now.toISOString().replace(/[:.]/g, "").replace("Z", "")}`;
  const taken = (id: string) => fs.existsSync(path.join(directory, `${id}.md`));
  if (!taken(stamp)) return stamp;
  for (let n = 2; ; n += 1) {
    if (!taken(`${stamp}-${n}`)) return `${stamp}-${n}`;
  }
}
