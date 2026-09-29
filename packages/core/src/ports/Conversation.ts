/** A durable thread owned by one piece of work. */
export interface ThreadRef {
  id: string;
}

/** One operator reply, including files the adapter downloaded locally. */
export interface Reply {
  at: string;
  author: string;
  text: string;
  files: string[];
}

/** Where an operator and one piece of work talk without using the tracker. */
export interface Conversation {
  /** Opens the work's remembered thread, creating it only on first use. */
  open(workId: string, title: string): Promise<ThreadRef>;
  post(thread: ThreadRef, message: { text: string; files?: string[] }): Promise<string>;
  /** Replies after `since`, oldest first. Files are readable local paths. */
  replies(thread: ThreadRef, since: string): Promise<Reply[]>;
}
