import { Conversation } from "./ports/Conversation.js";
import { Notifier } from "./ports/Notifier.js";

/** Where something said to the operator went. */
export type OperatorChannel = "thread" | "notifier";

export interface OperatorChannels {
  /** The work's own thread, when an install mounted one. */
  conversation?: Conversation;
  notifier: Notifier;
}

/**
 * Says one thing to the operator: in the work's own thread when there is
 * one, and through the notifier otherwise.
 *
 * Every workflow that talks to its operator made this choice for itself, and
 * the ones that made it differently put a question in one place and listened
 * for the answer in another. The thread is preferred because a reply there is
 * something a workflow can read back; a notification is only ever heard.
 */
export async function sayToOperator(
  channels: OperatorChannels,
  message: { text: string; workId: string; title: string; state: string },
): Promise<OperatorChannel> {
  if (channels.conversation) {
    const thread = await channels.conversation.open(message.workId, message.title);
    await channels.conversation.post(thread, { text: message.text });
    return "thread";
  }
  await channels.notifier.announce({ text: message.text, workId: message.workId, state: message.state });
  return "notifier";
}
