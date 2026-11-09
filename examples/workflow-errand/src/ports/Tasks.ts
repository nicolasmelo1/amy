/**
 * Something to do, said in passing.
 *
 * The opposite of a note: a note is friction that happened and becomes a
 * plan, and a task is work somebody wants done. Neither is a ticket, and the
 * difference from a ticket is that nobody had to open one — the cost of
 * capturing it has to be close to zero or it does not get captured at all.
 */
export interface Task {
  /** Sortable, so the tasks have a stable order without an index. */
  id: string;
  /** The repository the work is in, as `owner/name`. */
  repo: string;
  /** What to do, in the words of whoever asked. */
  text: string;
  /** Who asked: a person at a keyboard, or an agent mid-conversation. */
  source: string;
  addedAt: string;
}

/** A task as it is written, before anything has been decided about it. */
export type NewTask = Omit<Task, "id" | "addedAt">;

/**
 * Where the tasks are kept.
 *
 * Two ways in and one way out, the same shape the notes have: `amy btw`
 * writes one, an editor or a hook can write one, and `all()` is what the
 * workflow discovers work from.
 */
export interface Tasks {
  add(task: NewTask, now: Date): Task;
  all(): Task[];
  get(id: string): Task | null;
}
