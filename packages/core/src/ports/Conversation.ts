/** A durable thread owned by one piece of work. */
export interface ThreadRef {
  id: string;
}

/**
 * What a reply is, when its medium let the person say: a turn in a
 * discussion, or the decision that ends one.
 */
export type ReplyKind = "discussion" | "decision";

/** One operator reply, including files the adapter downloaded locally. */
export interface Reply {
  at: string;
  author: string;
  text: string;
  files: string[];
  /**
   * Set only when the person marked it — a reaction, a button, a command.
   * Text alone carries none: what an unmarked reply means is the workflow's
   * policy, never the adapter's guess.
   */
  kind?: ReplyKind;
}

/** Where an operator and one piece of work talk without using the tracker. */
export interface Conversation {
  /** Opens the work's remembered thread, creating it only on first use. */
  open(workId: string, title: string): Promise<ThreadRef>;
  post(thread: ThreadRef, message: { text: string; files?: string[] }): Promise<string>;
  /** Replies after `since`, oldest first. Files are readable local paths. */
  replies(thread: ThreadRef, since: string): Promise<Reply[]>;
}
