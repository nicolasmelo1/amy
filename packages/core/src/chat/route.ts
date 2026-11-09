/**
 * What an adapter knows about the messages it filed, and nothing it decides.
 *
 * In a chat without threads, works share one place, so a message reaches a
 * work only when it is addressed to it. The adapter answers two lookups; the
 * rule that reads them is here, so no adapter guesses (S15, S16).
 */
export interface Addressing {
  /** The work thread amy filed one of its own messages under, by that message's id. */
  threadOfMessage(id: string): string | undefined;
  /** A work's thread, by the work's id. */
  threadOfWork(workId: string): string | undefined;
}

/** Where a message in a chat without threads goes. */
export type Routed =
  | { to: "work"; thread: string; text: string }
  | { to: "chat"; text: string; unaddressed?: true };

/**
 * Routes one message that arrived outside every work thread.
 *
 * A work first (S42): a reply quoting a message amy filed under a work
 * reaches that work, and so does a message starting with a work's id and a
 * colon, the id taken off. Anything else is the chat's — an ask, or an
 * action under `/action`. A quote of a message filed under no work is the
 * chat's too, marked so the answer can say it does not know which work.
 */
export function addressed(message: { text: string; quotes?: string }, addressing: Addressing): Routed {
  if (message.quotes !== undefined) {
    const thread = addressing.threadOfMessage(message.quotes);
    if (thread !== undefined) return { to: "work", thread, text: message.text };
  }
  const prefix = /^\s*([^\s:]+):(?=\s|$)/.exec(message.text);
  if (prefix) {
    const thread = addressing.threadOfWork(prefix[1]!);
    if (thread !== undefined) return { to: "work", thread, text: message.text.slice(prefix[0].length).trim() };
  }
  return message.quotes === undefined ? { to: "chat", text: message.text } : { to: "chat", text: message.text, unaddressed: true };
}
