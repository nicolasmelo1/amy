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

/**
 * A message in the chat that reached no work: no work's thread, no quote of
 * a message amy filed under a work, no work's id at its start. It is an ask,
 * or under `/action` an action, and the core answers it, never the adapter.
 */
export interface ChatMessage {
  /** Unique within the adapter and stable across reads; claims key on it. */
  id: string;
  at: string;
  author: string;
  text: string;
  /** Where an answer goes: a thread, or the chat itself. */
  place: string;
  /**
   * The place is a thread, and a thread is one conversation. Unset, the place
   * is a chat without threads, one conversation until `/new`.
   */
  threaded?: true;
  /** It quoted a message amy did not file under any work, so no work could be told. */
  unaddressed?: true;
}

/** Where an operator and one piece of work talk without using the tracker. */
export interface Conversation {
  /** Present only on adapters that can render an Ask as controls. */
  asks?: true;
  /**
   * Which chat this is — a bot, a channel — so its conversations and claims
   * are never another's: two bots can number a chat or a message alike.
   */
  readonly source?: string;
  /** Each piece of work has a thread of its own; unset, works share the chat and are addressed. */
  threads?: true;
  /** A message amy said can be edited in place, so a long turn's progress is one message. */
  edit?: true;
  /**
   * The messages that reached no work, filed and not yet settled, oldest
   * first. Present only on adapters that answer in the chat; the daemon reads
   * it all the time, and one arriving mid-turn waits for the next turn.
   */
  chat?(): Promise<ChatMessage[]>;
  /** The message is answered: it is not handed out again. */
  settle?(id: string): Promise<void>;
  /** Says something in a chat place, and answers the message's id. */
  say?(place: string, text: string): Promise<string>;
  /** Replaces what a said message reads; only where `edit` is declared. */
  revise?(place: string, id: string, text: string): Promise<void>;
  /** Opens the work's remembered thread, creating it only on first use. */
  open(workId: string, title: string): Promise<ThreadRef>;
  post(thread: ThreadRef, message: { text: string; files?: string[]; ask?: Ask }): Promise<string>;
  /** Replies after `since`, oldest first. Files are readable local paths. */
  replies(thread: ThreadRef, since: string): Promise<Reply[]>;
}
