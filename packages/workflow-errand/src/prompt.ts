import { Task } from "./ports/Tasks.js";

/**
 * What the agent is asked, in the words of whoever asked it.
 *
 * Deliberately thin. The task text is somebody's own sentence and the
 * temptation is to decorate it into a specification; what that produces is an
 * agent answering the decoration. What it needs around it is the two things
 * the sentence does not carry: where it is, and what to do when the sentence
 * turns out to be wrong.
 */
export function errandPrompt(task: Task, finding?: string): string {
  return [
    `Somebody asked for this in passing, and it was never a ticket:`,
    ``,
    task.text.trim(),
    ``,
    `You are in a checkout of ${task.repo}, on a branch of your own.`,
    ``,
    `Do it if it is a change: make it, and leave the working tree with the`,
    `change in it. Say in one paragraph what you did.`,
    ``,
    `If it turns out to be a question rather than a change, answer it and`,
    `change nothing. An errand that ends in a sentence is finished, not failed.`,
    ``,
    `If it cannot be done as asked — it is already done, it is wrong, or it`,
    `needs a decision nobody made — say so plainly and change nothing. Do not`,
    `do a different, easier thing instead.`,
    ...(finding
      ? [``, `Your last attempt did not get through. What came back:`, ``, finding]
      : []),
  ].join("\n");
}
