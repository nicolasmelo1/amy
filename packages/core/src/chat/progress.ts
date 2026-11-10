import { Conversation } from "../ports/Conversation.js";

/**
 * A long turn's progress, said as it happens (S6).
 *
 * Where the adapter declares `edit`, it is one message edited in place, each
 * line added below the last; where it does not, one line per message. The
 * adapter declares it, so nothing here guesses what a chat can do (S16).
 */
export class ChatProgress {
  private said?: string;
  private readonly lines: string[] = [];

  constructor(
    private readonly conversation: Pick<Conversation, "edit" | "say" | "revise">,
    private readonly place: string,
  ) {}

  async line(text: string): Promise<void> {
    const say = this.conversation.say;
    if (!say) throw new Error("this conversation cannot say anything in the chat");
    this.lines.push(text);
    const revise = this.conversation.edit ? this.conversation.revise : undefined;
    if (!revise) {
      await say.call(this.conversation, this.place, text);
      return;
    }
    if (this.said === undefined) this.said = await say.call(this.conversation, this.place, text);
    else await revise.call(this.conversation, this.place, this.said, this.lines.join("\n"));
  }
}
