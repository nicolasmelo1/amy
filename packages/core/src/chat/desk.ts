import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { ChatMessage, Conversation } from "../ports/Conversation.js";
import { Harness } from "../ports/Harness.js";
import { Asked, ChatCommandSpec, commandsIn, refusedCommands } from "./commands.js";
import { ChatProgress } from "./progress.js";
import { Kept, Transcripts } from "./transcript.js";

/** What `/action` hands the host to run: the commands, the blocks beside them, and where to say how it goes. */
export interface ChatAction {
  readonly asked: Asked;
  readonly place: string;
  readonly progress: ChatProgress;
}

/** What running them came to: what to say, and what to do once it is said. */
export interface ChatActOutcome {
  readonly text: string;
  /** Runs after the answer is said: a restart exits to its supervisor only then. */
  readonly after?: () => Promise<void>;
}

/** Everything one pass over the chat needs from the host. */
export interface ChatDesk {
  readonly conversation: Conversation;
  /** The harnesses `/harness` chooses among, by name; the first answers by default. */
  readonly harnesses: ReadonlyMap<string, Harness>;
  /** Where a turn's harness reads from. Nothing there is changed. */
  readonly cwd: string;
  /** Where conversations and claims are kept. */
  readonly directory: string;
  /** The fixed list of commands an answer may name (S12, S13). */
  readonly commands: readonly ChatCommandSpec[];
  /** Runs the commands a `/action` turn's answer named, all of them on the list. */
  act(action: ChatAction): Promise<ChatActOutcome>;
  /** What did not mount, when the workflow did not: said with every answer (S29). */
  readonly mountProblem?: string;
  /** What this amy is, for the harness to read before the conversation. */
  readonly about?: string;
  readonly now?: () => Date;
}

/** A claim older than this was left by a process that died mid-turn, and is taken over. */
const ABANDONED_CLAIM_MS = 10 * 60 * 1000;

/**
 * Answers every message the chat holds that reached no work, oldest first,
 * and settles each (S10, S11).
 *
 * A message is an ask: the harness runs read-only, enforced by its own
 * sandbox or refused (S9), and nothing it names runs. A message starting
 * with `/action` is the green flag for that one turn: the amy commands its
 * answer names run, every one of them on the fixed list or none of them.
 * `/new` starts another conversation in a chat without threads, and
 * `/harness` switches the one answering mid-conversation (S21).
 *
 * Each message is claimed first, so two loops reading one chat answer it
 * once. What to do after an answer is said — a restart's exit — is handed
 * back rather than done, so the pass ends before the process does.
 */
export async function answerTheChat(desk: ChatDesk): Promise<{ answered: number; after: (() => Promise<void>)[] }> {
  const conversation = desk.conversation;
  if (!conversation.chat || !conversation.settle || !conversation.say) return { answered: 0, after: [] };
  const transcripts = new Transcripts(desk.directory);
  const after: (() => Promise<void>)[] = [];
  let answered = 0;
  for (const message of await conversation.chat()) {
    if (!claim(desk.directory, message.id, desk.now?.() ?? new Date())) continue;
    const outcome = await answerOne(desk, transcripts, message);
    await conversation.settle(message.id);
    if (outcome?.after) after.push(outcome.after);
    answered += 1;
  }
  return { answered, after };
}

async function answerOne(desk: ChatDesk, transcripts: Transcripts, message: ChatMessage): Promise<ChatActOutcome | undefined> {
  const say = (text: string) => desk.conversation.say!(message.place, text);
  const command = leadingCommand(message.text);
  if (command.name === "new") return void await startAnother(transcripts, message, say);
  const kept = transcripts.current(message.place);
  if (command.name === "harness") return void await switchHarness(desk, transcripts, kept, command.rest.trim(), say);

  const action = command.name === "action";
  const warning = desk.mountProblem ? `⚠️ The workflow did not mount, so only the chat is running: ${desk.mountProblem}\n\n` : "";
  const at = (desk.now?.() ?? new Date()).toISOString();
  const progress = new ChatProgress(desk.conversation, message.place);
  const reply = await readOnlyAnswer(desk, kept, action ? command.rest.trim() : message.text, action, progress);
  if (typeof reply !== "string") return void await say(`${warning}${reply.refused}`);

  const { said, outcome } = await carriedOut(desk, reply, action, message.place, progress);
  const answer = message.unaddressed ? `That quoted message is not one I filed under a work, so I do not know which work it is about; answered as a question.\n\n${said}` : said;
  await say(`${warning}${answer}`);
  kept.turns.push({ at, who: "person", text: message.text }, { at: (desk.now?.() ?? new Date()).toISOString(), who: "amy", text: answer });
  transcripts.save(kept);
  return outcome;
}

/** The harness's answer to one turn, run read-only, or what to say when there is none. */
async function readOnlyAnswer(desk: ChatDesk, kept: Kept, text: string, action: boolean, progress: ChatProgress): Promise<string | { refused: string }> {
  const name = kept.harness && desk.harnesses.has(kept.harness) ? kept.harness : [...desk.harnesses.keys()][0];
  const harness = name === undefined ? undefined : desk.harnesses.get(name);
  if (!harness || name === undefined) return { refused: "No harness is mounted, so nothing can answer here." };
  await progress.line(`${action ? "Acting" : "Thinking"} with ${name}…`);
  try {
    return (await harness.ask(promptFor(desk, kept, text, action), desk.cwd, { readOnly: true, step: "chat" })).text;
  } catch (error) {
    const other = [...desk.harnesses.keys()].find((one) => one !== name);
    return { refused: `${name} could not answer read-only, so nothing ran: ${messageOf(error)}${other ? `\nAnother can: /harness ${other}` : ""}` };
  }
}

/** `/new`: another conversation in a chat without threads; a thread stays one. */
async function startAnother(transcripts: Transcripts, message: ChatMessage, say: (text: string) => Promise<string>): Promise<void> {
  if (message.threaded) {
    await say("A thread is one conversation. Write in the chat, outside this thread, to start another.");
    return;
  }
  transcripts.startAnother(message.place);
  await say("A new conversation: nothing said before this is carried.");
}

/** `/harness <name>`: the conversation is answered by another harness, given every turn before. */
async function switchHarness(desk: ChatDesk, transcripts: Transcripts, kept: Kept, chosen: string, say: (text: string) => Promise<string>): Promise<void> {
  if (!desk.harnesses.has(chosen)) {
    await say(`No harness is named \`${chosen || "(nothing)"}\`. Mounted: ${namesOf(desk.harnesses)}.`);
    return;
  }
  kept.harness = chosen;
  transcripts.save(kept);
  await say(`This conversation is answered by ${chosen} from now on, and it is given the ${kept.turns.length} turns before.`);
}

/** What an answer's commands came to: run under /action when every one is on the list, and never otherwise. */
async function carriedOut(desk: ChatDesk, reply: string, action: boolean, place: string, progress: ChatProgress): Promise<{ said: string; outcome?: ChatActOutcome }> {
  const asked = commandsIn(reply);
  const said = reply.trim();
  if (asked.commands.length === 0 && asked.unreadable.length === 0) return { said };
  if (!action) return { said: `${said}\n\nNothing ran: a command runs only when the message starts with /action.` };
  const refused = refusedCommands(asked, desk.commands);
  if (refused.length > 0) return { said: `${said}\n\nRefused, and nothing ran:\n${refused.map((one) => `- \`${one.line}\`: ${one.why}`).join("\n")}` };
  const outcome = await desk.act({ asked, place, progress });
  return { said: `${said}\n\n${outcome.text}`, outcome };
}

/** `/new`, `/harness <name>` or `/action <text>` at the start of a message, a bot's name after it allowed. */
function leadingCommand(text: string): { name?: "new" | "harness" | "action"; rest: string } {
  const trimmed = text.trimStart();
  const name = (["new", "harness", "action"] as const).find((one) => trimmed.startsWith(`/${one}`));
  if (!name) return { rest: text };
  let rest = trimmed.slice(name.length + 1);
  // Addressed to the bot by name: /action@amy_work_bot.
  if (rest.startsWith("@")) rest = rest.slice(rest.search(/\s|$/));
  if (rest !== "" && !/^\s/.test(rest)) return { rest: text };
  return { name, rest };
}

/**
 * The whole conversation, each time (S21): what amy is, what this turn may
 * do, the list it may name, and every turn so far, then the new message.
 */
function promptFor(desk: ChatDesk, kept: Kept, text: string, action: boolean): string {
  const list = desk.commands.map((spec) => `  amy ${[...spec.words, spec.args].filter(Boolean).join(" ")} — ${spec.summary}`).join("\n");
  const history = kept.turns.map((turn) => `${turn.who === "person" ? "Person" : "amy"}: ${turn.text}`).join("\n\n");
  return [
    "You are amy, answering the person who runs it, in their chat. Be brief: this is read on a phone.",
    desk.about ?? "",
    "This turn is read-only: read anything you need and change nothing — no file, no commit, no tracker or code host.",
    action
      ? "The person started this message with /action: to act on amy, end your answer with a fenced block tagged `amy`, one command per line, from the list below. amy runs them, not a shell; a line off the list refuses the whole block."
      : "To act on amy, the person starts a message with /action. If acting would help, say which command, in a fenced block tagged `amy`: it will not run this turn.",
    `The commands:\n${list}`,
    "To change amy's configuration, put the whole new config.yaml in a fenced block tagged `config.yaml` and name `config apply`: it is shown as a diff and written only if it mounts.",
    desk.mountProblem ? `The workflow did not mount: ${desk.mountProblem}` : "",
    history ? `The conversation so far:\n\n${history}` : "",
    `Person: ${text}`,
  ].filter(Boolean).join("\n\n");
}

/** Claims one message for this process; a claim left by a process that died mid-turn is taken over. */
function claim(directory: string, id: string, now: Date): boolean {
  const file = path.join(directory, "claims", createHash("sha256").update(id).digest("hex").slice(0, 32));
  fs.mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 });
  try {
    fs.writeFileSync(file, `${process.pid}\n`, { flag: "wx", mode: 0o600 });
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
  }
  try {
    if (now.getTime() - fs.statSync(file).mtimeMs < ABANDONED_CLAIM_MS) return false;
    fs.utimesSync(file, now, now);
    return true;
  } catch {
    return false;
  }
}

function namesOf(harnesses: ReadonlyMap<string, Harness>): string {
  return harnesses.size > 0 ? [...harnesses.keys()].join(", ") : "none";
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
