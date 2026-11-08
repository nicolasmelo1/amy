/** A durable thread owned by one piece of work. */
export interface ThreadRef {
  id: string;
}

/**
 * What a reply is, when its medium let the person say: a turn in a
 * discussion, or the decision that ends one.
 */
export type ReplyKind = "discussion" | "decision";

/** A question whose answers a conversation can render as controls. */
export type Ask =
  | { id: string; prompt: string; form: "approval"; answers: ["approve", "reject"] }
  | { id: string; prompt: string; form: "choice" | "choices"; answers: string[] };

/** The answer an operator selected for one ask. */
export interface ReplyAnswer {
  ask: string;
  chosen: string[];
}

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
  /** A selected answer is always a marked decision. */
  answer?: ReplyAnswer;
}

/** Where an operator and one piece of work talk without using the tracker. */
export interface Conversation {
  /** Present only on adapters that can render an Ask as controls. */
  asks?: true;
  /** Opens the work's remembered thread, creating it only on first use. */
  open(workId: string, title: string): Promise<ThreadRef>;
  post(thread: ThreadRef, message: { text: string; files?: string[]; ask?: Ask }): Promise<string>;
  /** Replies after `since`, oldest first. Files are readable local paths. */
  replies(thread: ThreadRef, since: string): Promise<Reply[]>;
}
