import os from "node:os";
import { Readable, Writable } from "node:stream";
import { StringDecoder } from "node:string_decoder";
import { Ask, Conversation, Reply, ThreadRef } from "@amykit/core";

/**
 * The person's terminal as one conversation: posts are written to the
 * output as plain lines, and what the person types comes back as replies —
 * a number or a name for an ask's answers, a plain turn for anything else.
 *
 * The terminal is one stream, not a medium with threads of its own, so the
 * thread's shape is kept in memory only: the work id is the thread id, and
 * a reply is dated where it was read. Nothing survives a restart, and
 * nothing needs to: a work that asks again is answered again, through the
 * same port and the same reply shape every other conversation returns.
 *
 * The input is read paused — on demand, one look at a time, not on a
 * listener that would take the person's typing out of the host's hands.
 * One look takes exactly what has arrived, so a line half-typed waits for
 * the look that sees its Enter.
 */
export class TerminalConversation implements Conversation {
  readonly asks = true as const;

  /** Work ids whose title was already announced on the output. */
  private readonly announced = new Set<string>();

  /**
   * Asks posted and not yet answered, oldest first: a line answers the
   * first question on the table, the one the person read first.
   */
  private readonly pending: { thread: string; ask: Ask; messageId: string }[] = [];

  /** Replies by thread id, oldest first: instants only grow, so what is filed is already in order. */
  private readonly filed = new Map<string, Reply[]>();

  /** The thread whose line the person last saw: where a line with no ask pending belongs. */
  private lastSeen: string | undefined;

  private posted = 0;
  private clock = Number.NEGATIVE_INFINITY;
  private ended = false;
  private partial = "";
  private readonly decoder = new StringDecoder("utf-8");
  private readonly author: string;

  constructor(
    private readonly input: Readable,
    private readonly output: Writable,
  ) {
    this.author = localUser();
    // The end of the input is heard rather than read for: a stream says
    // `end` one tick after its last chunk was drained, so the look that
    // read up to it learns from here on the next one. An error ends the
    // reading the same way — with silence, which the host reads as it
    // reads any ask that went unanswered.
    for (const event of ["end", "close", "error"] as const) {
      this.input.once(event, () => {
        this.ended = true;
      });
    }
  }

  known(workId: string): Promise<ThreadRef | undefined> {
    return Promise.resolve(this.announced.has(workId) ? { id: workId } : undefined);
  }

  open(workId: string, title: string): Promise<ThreadRef> {
    // The thread is the work: no topic to create and no channel to find,
    // so re-opening finds the same thread because its id is the work's.
    this.lastSeen = workId;
    if (!this.announced.has(workId)) {
      this.announced.add(workId);
      // The one header a terminal conversation has, said once: every post
      // of this work is read under it.
      this.write([title.trim() || workId, ""]);
    }
    return Promise.resolve({ id: workId });
  }

  async post(thread: ThreadRef, message: { text: string; files?: string[]; ask?: Ask }): Promise<string> {
    this.lastSeen = thread.id;
    // One question per ask id in a thread: a second copy of a pending ask
    // would split one answer in two, its first line ending the first copy
    // and a later line reading as a second decision of a question already
    // answered. The copy already posted is what this post becomes.
    const asked = this.pending.find((entry) => entry.thread === thread.id && entry.ask.id === message.ask?.id);
    if (asked) return asked.messageId;
    const id = String(++this.posted);
    if (message.ask) {
      this.pending.push({ thread: thread.id, ask: message.ask, messageId: id });
      this.write(askLines(message.text, message.files ?? [], message.ask));
      return id;
    }
    // The files here are the person's own local paths, on the same
    // machine, so they are said as text: nothing is uploaded, and nothing
    // is downloaded.
    this.write([message.text, ...(message.files ?? [])]);
    return id;
  }

  async replies(thread: ThreadRef, since: string): Promise<Reply[]> {
    const after = instantToMicros(since);
    if (Number.isNaN(after)) throw new Error(`replies since ${since}: not an instant`);
    this.readArrived();
    // What is filed is in arrival order and instants only grow, so the
    // oldest is first already; `since` only cuts what came before it.
    return (this.filed.get(thread.id) ?? []).filter((reply) => instantToMicros(reply.at) > after);
  }

  /**
   * Reads what the person typed since the last look, as whole lines, and
   * files each as a reply. A chunk may end anywhere, so what it carried
   * waits for its line to be completed; and the end of the input says the
   * last line is done, Enter or no Enter — a piped `echo -n y` still
   * answers.
   */
  private readArrived(): void {
    for (;;) {
      const chunk = this.input.read();
      if (chunk === null) break;
      this.partial += typeof chunk === "string" ? chunk : this.decoder.write(chunk);
      for (let cut = this.partial.indexOf("\n"); cut !== -1; cut = this.partial.indexOf("\n")) {
        const line = this.partial.slice(0, cut).replace(/\r$/, "");
        this.partial = this.partial.slice(cut + 1);
        this.take(line);
      }
    }
    if (this.ended) {
      const rest = this.partial + this.decoder.end();
      this.partial = "";
      this.take(rest.replace(/\r$/, ""));
    }
  }

  private take(line: string): void {
    // Enter on an empty line said nothing, and reading it as a reply
    // would be the adapter inventing an answer.
    if (line.trim() === "") return;
    const first = this.pending[0];
    const chosen = first === undefined ? undefined : answerOf(first.ask, line.trim());
    const at = microsToInstant(this.tick());
    if (first !== undefined && chosen !== undefined) {
      // One line ends one question: the answer is the decision, in the
      // shape Slack and Telegram return, and the next pending ask — if the
      // work asked another — is next in line.
      this.pending.shift();
      this.file(first.thread, { at, author: this.author, text: first.ask.prompt, files: [], kind: "decision", answer: { ask: first.ask.id, chosen } });
      return;
    }
    // What a line carrying no answer means is the workflow's policy,
    // never the adapter's guess, so it carries no kind: a plain turn in
    // the thread whose line the person last saw.
    if (this.lastSeen !== undefined) this.file(this.lastSeen, { at, author: this.author, text: line, files: [] });
  }

  private file(thread: string, reply: Reply): void {
    const replies = this.filed.get(thread);
    if (replies) replies.push(reply);
    else this.filed.set(thread, [reply]);
  }

  /**
   * The instant of one reply, a microsecond after the last: the host hands
   * a reply's `at` back as its next `since`, so no two replies may share
   * one, whatever the clock was doing.
   */
  private tick(): number {
    this.clock = Math.max(this.clock + 1, Date.now() * 1000);
    return this.clock;
  }

  private write(lines: readonly string[]): void {
    this.output.write(`${lines.join("\n")}\n`);
  }
}

/**
 * The lines one ask renders as: plain lines and numbers, no menus and no
 * cursor tricks, because the terminal the person gave amy is theirs. The
 * prompt is not said twice when the post already says it; an approval
 * offers y/n, and a choice lists its answers by the numbers a typed line
 * names them by.
 */
function askLines(text: string, files: string[], ask: Ask): string[] {
  const prompt = ask.form === "approval" ? `${ask.prompt} (y/n)` : ask.prompt;
  const numbered = ask.form === "approval" ? [] : ask.answers.map((answer, index) => `${index + 1}. ${answer}`);
  return [text === ask.prompt ? "" : text, ...files, prompt, ...numbered].filter(Boolean);
}

/**
 * What one typed line selects from an ask's answers: a number from the
 * numbered list the adapter rendered, or an answer's own text; several,
 * comma- or space-separated, only where the ask takes several. undefined
 * says the line answered nothing — no answer is guessed, and what the line
 * becomes is the workflow's policy, not the adapter's.
 */
function answerOf(ask: Ask, typed: string): string[] | undefined {
  const one = (token: string): string | undefined => {
    // A number names the list the adapter drew: `2` is the second answer,
    // whatever the answers are called.
    if (/^\d+$/.test(token)) {
      const answer = ask.answers[Number(token) - 1];
      if (answer !== undefined) return answer;
    }
    const byText = ask.answers.find((answer) => answer === token) ?? ask.answers.find((answer) => answer.toLowerCase() === token.toLowerCase());
    if (byText !== undefined) return byText;
    // An approval is also spelled the way a person says it at a keyboard.
    if (ask.form === "approval") {
      if (/^y(es)?$/i.test(token)) return "approve";
      if (/^n(o)?$/i.test(token)) return "reject";
    }
    return undefined;
  };
  if (ask.form !== "choices") {
    const answer = one(typed);
    return answer === undefined ? undefined : [answer];
  }
  // Only a choices ask takes several, and an answer of more than one word
  // is picked by number — the list is what carries its name.
  const tokens = typed.split(/[\s,]+/).filter(Boolean);
  if (tokens.length === 0) return undefined;
  const selected = new Set<string>();
  for (const token of tokens) {
    const answer = one(token);
    if (answer === undefined) return undefined;
    selected.add(answer);
  }
  // The ask's order, not the typing's: what the workflow asked is what it reads.
  return ask.answers.filter((answer) => selected.has(answer));
}

/**
 * Who is answering: the person at the machine, since the terminal is
 * theirs, with `operator` standing in where the system does not say.
 */
function localUser(): string {
  try {
    return os.userInfo().username || "operator";
  } catch {
    return "operator";
  }
}

/** An instant to the microsecond: the digits past the millisecond are read too. */
function instantToMicros(instant: string): number {
  const ms = Date.parse(instant);
  if (Number.isNaN(ms)) return Number.NaN;
  const extra = /\.(\d{3})(\d{1,3})Z$/.exec(instant);
  return ms * 1000 + Number(extra?.[2]?.padEnd(3, "0") ?? 0);
}

/**
 * An instant as ISO 8601 with six fractional digits: the exact stamp of
 * one reply, so the next look's `since` is the reply's own instant, and
 * what arrives in the same millisecond still keeps its order.
 */
function microsToInstant(micros: number): string {
  const iso = new Date(Math.floor(micros / 1000)).toISOString();
  return iso.replace(/Z$/, `${String(micros % 1000).padStart(3, "0")}Z`);
}
