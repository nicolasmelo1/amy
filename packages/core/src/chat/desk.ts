import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { AgentRun } from "../agent-run.js";
import { Budget } from "../ports/Budget.js";
import { ChatMessage, Conversation } from "../ports/Conversation.js";
import { EventLog } from "../ports/EventLog.js";
import { Harness, HarnessReply } from "../ports/Harness.js";
import { Asked, ChatCommandSpec, commandsIn, refusedCommands } from "./commands.js";
import { ChatProgress } from "./progress.js";
import { takeLock } from "../process-lock.js";
import { Kept, Transcripts } from "./transcript.js";

/** What `/action` hands the host to run: the commands, the blocks beside them, and where to say how it goes. */
export interface ChatAction {
  readonly asked: Asked;
  readonly place: string;
  readonly progress: ChatProgress;
  /** Which chat the action was asked in, so a promise to answer there later is kept in that chat. */
  readonly source?: string;
  /**
   * Said by the host the moment something with an effect is about to run.
   * A turn that fails before it is asked again; one that fails after is
   * never run twice.
   */
  readonly running: () => void;
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
  /**
   * The skills a message may start with, by the name it writes after a slash,
   * and the directory each is installed in. A name with no directory is on the
   * ladder but gone: the turn is refused, naming `amy skills`.
   *
   * Which skills these are is the `skills` ladder's `chat` step, and nothing
   * else names them; without it a slash is just a character in a question.
   */
  readonly skills?: ReadonlyMap<string, string | undefined>;
  /**
   * Where the chat's agent runs are counted, when the person asked for them
   * to be. Unset, a conversation is a conversation: it is not held to the
   * ceilings and its runs are not in the ledger the work is admitted against.
   */
  readonly spend?: { readonly budget: Budget; readonly log: EventLog };
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
 * A conversation is held while its turns are answered, in order, and each
 * message is claimed, so two loops reading one chat never answer one place at
 * once nor one message twice; a claim is renewed for as long as its turn runs.
 * Claims and conversations are keyed by the conversation's source, so two
 * bots or channels never share either. What to do after an answer is said — a
 * restart's exit — ends the pass and is handed back, so nothing after it can
 * lose it.
 */
export async function answerTheChat(desk: ChatDesk): Promise<{ answered: number; after: (() => Promise<void>)[] }> {
  const conversation = desk.conversation;
  if (!conversation.chat || !conversation.settle || !conversation.say) return { answered: 0, after: [] };
  const source = conversation.source ?? "";
  const transcripts = new Transcripts(path.join(desk.directory, "sources", createHash("sha256").update(source).digest("hex").slice(0, 16)));
  let answered = 0;
  const blocked = new Set<string>();
  // The inbox's order is the operator's order across conversations. Holding a
  // place for one turn retains its transcript safety without moving a later
  // message ahead of an earlier stop or restart in another place.
  for (const message of await conversation.chat()) {
    if (blocked.has(message.place)) continue;
    const held = hold(desk, `${source}|place:${message.place}`);
    // Another loop is answering here: its turn reads and saves the transcript, so this place waits.
    if (!held) {
      blocked.add(message.place);
      continue;
    }
    try {
      const settled = await answerClaimed(desk, transcripts, message, `${source}|${message.id}`);
      if (!settled) continue;
      answered += 1;
      if (settled.after) return { answered, after: [settled.after] };
    } finally {
      held.release();
    }
  }
  return { answered, after: [] };
}

/**
 * One message, claimed, answered and settled; nothing when another loop has
 * it. A turn that fails lets go of a message nothing ran for, so it is asked
 * again next pass ahead of later ones, and settles one whose commands ran, so
 * a retry never runs them twice.
 */
async function answerClaimed(desk: ChatDesk, transcripts: Transcripts, message: ChatMessage, id: string): Promise<{ after?: () => Promise<void> } | undefined> {
  // Answered before, by this loop or another reading the same source: a copy is settled, never run again.
  if (fs.existsSync(doneFile(desk.directory, id))) {
    await desk.conversation.settle!(message.id);
    return undefined;
  }
  const claimed = hold(desk, id);
  if (!claimed) return undefined;
  const turn: Turn = { acted: false, persist: () => done(desk.directory, id) };
  let outcome: ChatActOutcome | undefined;
  try {
    outcome = await answerOne(desk, transcripts, message, turn);
  } catch (error) {
    if (!turn.acted) {
      claimed.release();
      throw error;
    }
    done(desk.directory, id);
    // What ran stays done; a restart or a stop it asked for still happens, though the answer was not said.
    // Settlement is transport bookkeeping: its failure must not erase an
    // accepted lifecycle handoff, which is already durable in the done file.
    if (turn.after) {
      try {
        await desk.conversation.settle!(message.id);
      } catch {
        // The next pass settles the durable done message.
      }
      return { after: turn.after };
    }
    await desk.conversation.settle!(message.id);
    throw error;
  } finally {
    claimed.stop();
  }
  done(desk.directory, id);
  if (outcome?.after) {
    try {
      await desk.conversation.settle!(message.id);
    } catch {
      // The after callback still owns the accepted restart or stop.
    }
    return { after: outcome.after };
  }
  await desk.conversation.settle!(message.id);
  return {};
}

/** What one turn did before anything could fail: whether its commands ran, and what they asked to do after. */
interface Turn {
  acted: boolean;
  after?: () => Promise<void>;
  /** Records the message as done, for good: called the moment anything with an effect runs. */
  persist?: () => void;
}

/** Marks a message answered for good: a later copy of it, or a reader whose claim expired, finds it done. */
function done(directory: string, id: string): void {
  const file = doneFile(directory, id);
  fs.mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 });
  fs.writeFileSync(file, "", { mode: 0o600 });
}

function doneFile(directory: string, id: string): string {
  return path.join(directory, "done", createHash("sha256").update(id).digest("hex").slice(0, 32));
}

/** A claim taken and kept fresh until its turn ends, or nothing when another loop holds it. */
function hold(desk: ChatDesk, id: string): { stop(): void; release(): void } | undefined {
  const file = claimFile(desk.directory, id);
  fs.mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 });
  // A claim is a lease: a loop that died mid-turn, or stopped renewing, is taken over.
  const claim = takeLock(file, { leaseMs: ABANDONED_CLAIM_MS, now: () => (desk.now?.() ?? new Date()).getTime() });
  if (!claim) return undefined;
  const renew = setInterval(() => {
    try {
      // Only its own: a claim another loop took over is never kept alive from here.
      claim.renew();
    } catch {
      // Released meanwhile: nothing left to renew.
    }
  }, ABANDONED_CLAIM_MS / 4);
  renew.unref?.();
  return {
    stop: () => clearInterval(renew),
    release: () => {
      clearInterval(renew);
      try {
        claim.release();
      } catch {
        // Already gone.
      }
    },
  };
}

async function answerOne(desk: ChatDesk, transcripts: Transcripts, message: ChatMessage, turn: Turn): Promise<ChatActOutcome | undefined> {
  const say = (text: string) => desk.conversation.say!(message.place, text);
  // A quote that reached no work is an ask, whatever it starts with: it starts nothing and switches nothing.
  const command = message.unaddressed ? { rest: message.text } : leadingCommand(message.text);
  if (command.name === "new") return void await startAnother(transcripts, message, say);
  const kept = transcripts.current(message.place);
  if (command.name === "harness") return void await switchHarness(desk, transcripts, kept, command.rest.trim(), say);

  const at = stamp(desk);
  // The skill this turn is answered with, when the message starts with one on
  // the chat's ladder or the thread was started with one (S11, S12).
  const lent = await lentTurn(desk, transcripts, message, command, kept, at, say);
  if (lent === "refused") return undefined;

  const action = command.name === "action" || lent !== undefined;
  const warning = mountWarning(desk);
  const progress = new ChatProgress(desk.conversation, message.place);
  const reply = await readOnlyAnswer(desk, kept, lent ? lent.text : action ? command.rest.trim() : message.text, action, progress, lent);
  if (typeof reply !== "string") return void await refusalSaid(transcripts, kept, message, at, say, `${warning}${reply.refused}`);

  const { said, outcome } = await carriedOut(desk, reply, action, message.place, progress, turn);
  const answer = quotedAnswer(message, said);
  const record = () => {
    kept.turns.push({ at, who: "person", text: message.text }, { at: stamp(desk), who: "amy", text: answer });
    transcripts.save(kept);
  };
  // What ran is the conversation's even if saying so fails; a turn nothing ran in is kept only once said, so a retry is not doubled.
  if (turn.acted) record();
  await say(`${warning}${answer}`);
  if (!turn.acted) record();
  return outcome;
}

function stamp(desk: ChatDesk): string {
  return (desk.now?.() ?? new Date()).toISOString();
}

/** A mount that did not come up, said with every answer (S29); nothing otherwise. */
function mountWarning(desk: ChatDesk): string {
  return desk.mountProblem ? `⚠️ The workflow did not mount, so only the chat is running: ${desk.mountProblem}\n\n` : "";
}

/** What the person reads: a quote that reached no work was answered as a question, and says so. */
function quotedAnswer(message: ChatMessage, said: string): string {
  return message.unaddressed
    ? `That quoted message is not one I filed under a work, so I do not know which work it is about; answered as a question.\n\n${said}`
    : said;
}

/** A turn the harness would not answer is said, and stays part of the conversation. */
async function refusalSaid(transcripts: Transcripts, kept: Kept, message: ChatMessage, at: string, say: (text: string) => Promise<string>, refused: string): Promise<undefined> {
  await say(refused);
  // Kept too, so a harness switched to after a refusal is given the question it refused.
  kept.turns.push({ at, who: "person", text: message.text }, { at, who: "amy", text: refused });
  transcripts.save(kept);
  return undefined;
}

/**
 * The skill this turn is answered with, kept for the thread, or `refused` when
 * the ladder cannot answer with it and the refusal was said.
 */
async function lentTurn(
  desk: ChatDesk,
  transcripts: Transcripts,
  message: ChatMessage,
  command: { name?: "new" | "harness" | "action"; rest: string },
  kept: Kept,
  at: string,
  say: (text: string) => Promise<string>,
): Promise<{ name: string; path: string; text: string } | undefined | "refused"> {
  const lent = skillFor(desk, message, command, kept);
  if (lent && "refused" in lent) {
    await refusalSaid(transcripts, kept, message, at, say, lent.refused);
    return "refused";
  }
  // A thread started with a skill keeps it: the next message is answered with it lent too.
  if (lent && kept.skill !== lent.name) {
    kept.skill = lent.name;
    transcripts.save(kept);
  }
  return lent;
}

/** The skill one turn is answered with, or why it cannot be. */
function skillFor(
  desk: ChatDesk,
  message: ChatMessage,
  command: { name?: "new" | "harness" | "action"; rest: string },
  kept: Kept,
): { name: string; path: string; text: string } | { refused: string } | undefined {
  if (message.unaddressed) return undefined;
  // A skill named on this message wins over the thread's: `/new` and `/harness`
  // were already read, and anything else after a slash is a skill or nothing.
  const started = command.name === undefined ? skillIn(message.text) : undefined;
  if (started) return startedSkill(desk.skills, started, message);
  return keptSkill(desk.skills, kept, command, message);
}

/** A skill the message itself starts with, when the ladder exists and holds it. */
function startedSkill(
  ladder: ReadonlyMap<string, string | undefined> | undefined,
  started: { skill: string; rest: string },
  message: ChatMessage,
): { name: string; path: string; text: string } | { refused: string } | undefined {
  if (!ladder || ladder.size === 0) return undefined;
  if (!ladder.has(started.skill)) {
    return { refused: `No skill named \`/${started.skill}\` is on this chat's ladder. The skills it names: ${ladderNames(ladder)}.` };
  }
  const path = ladder.get(started.skill);
  if (!held(path)) return { refused: gone(started.skill) };
  return { name: started.skill, path, text: started.rest.trim() || message.text };
}

/** The skill the thread was started with, when this message says nothing else. */
function keptSkill(
  ladder: ReadonlyMap<string, string | undefined> | undefined,
  kept: Kept,
  command: { name?: "new" | "harness" | "action"; rest: string },
  message: ChatMessage,
): { name: string; path: string; text: string } | { refused: string } | undefined {
  if (kept.skill === undefined) return undefined;
  if (!ladder?.has(kept.skill)) {
    return { refused: `This conversation started with \`/${kept.skill}\`, which this chat's ladder no longer names, so nothing ran. \`/new\` starts another.` };
  }
  const path = ladder.get(kept.skill);
  if (!held(path)) return { refused: gone(kept.skill) };
  return { name: kept.skill, path, text: command.name === "action" ? command.rest.trim() : message.text };
}

/**
 * Whether a skill's directory still holds its SKILL.md, read at the turn.
 *
 * The table is read once a pass, so a turn queued behind one whose commands
 * removed the skill would otherwise be lent a directory that is gone, and a
 * harness that cannot lend it would act without the method.
 */
function held(directory: string | undefined): directory is string {
  return directory !== undefined && fs.existsSync(path.join(directory, "SKILL.md"));
}

/** A skill the ladder names but this machine does not hold. */
function gone(skill: string): string {
  return `\`/${skill}\` is on this chat's ladder, but it is not installed here: nothing ran. Run \`amy skills\`, and it answers next time.`;
}

function ladderNames(ladder: ReadonlyMap<string, string | undefined>): string {
  return [...ladder.keys()].map((name) => `/${name}`).join(", ");
}

/** The harness's answer to one turn, run read-only, or what to say when there is none. */
async function readOnlyAnswer(
  desk: ChatDesk,
  kept: Kept,
  text: string,
  action: boolean,
  progress: ChatProgress,
  skill?: { name: string; path: string },
): Promise<string | { refused: string }> {
  const chosen = harnessFor(desk, kept);
  if ("refused" in chosen) return chosen;
  const { name, harness } = chosen;
  // A skill turn the harness cannot be handed a skill for would act without
  // the method it was addressed to; it is refused rather than run bare.
  const other = [...desk.harnesses].find(([other, one]) => other !== name && one.lendsSkill === true)?.[0];
  if (skill && harness.lendsSkill !== true) {
    return { refused: `${name} cannot be handed a skill, so nothing ran: a skill turn on it would act without the method.${other ? `\nAnother can: /harness ${other}` : ""}` };
  }
  await progress.line(`${action ? "Acting" : "Thinking"} with ${name}…`);
  try {
    const reply = await harness.ask(promptFor(desk, kept, text, action, skill), desk.cwd, {
      readOnly: true,
      step: "chat",
      ...(skill ? { skill: { name: skill.name, path: skill.path } } : {}),
    });
    if (desk.spend && reply.run) charge(desk.spend.log, reply.run, desk.now?.() ?? new Date());
    return answerIn(reply, name, [...desk.harnesses.keys()]);
  } catch (error) {
    const another = [...desk.harnesses.keys()].find((one) => one !== name);
    return { refused: `${name} could not answer read-only, so nothing ran: ${messageOf(error)}${another ? `\nAnother can: /harness ${another}` : ""}` };
  }
}

/** The harness this conversation runs on, if one is mounted and the budget, when counted, lets it start. */
function harnessFor(desk: ChatDesk, kept: Kept): { name: string; harness: Harness } | { refused: string } {
  const name = kept.harness && desk.harnesses.has(kept.harness) ? kept.harness : [...desk.harnesses.keys()][0];
  const harness = name === undefined ? undefined : desk.harnesses.get(name);
  if (!harness || name === undefined) return { refused: "No harness is mounted, so nothing can answer here." };
  const allowed = desk.spend?.budget.mayStart(desk.now?.() ?? new Date());
  if (allowed && !allowed.ok) return { refused: `Not answered: ${allowed.reason}.` };
  return { name, harness };
}

/** A run that did not complete, or said nothing, is no answer: its text is not acted on. */
function answerIn(reply: HarnessReply, name: string, names: readonly string[]): string | { refused: string } {
  if (reply.run && reply.run.outcome !== "completed") {
    const detail = (typeof reply.run.output === "string" ? reply.run.output.trim() : "") || reply.text.trim();
    const other = names.find((one) => one !== name);
    return { refused: `${name} did not finish this turn (${reply.run.outcome}), so nothing ran.${detail ? ` ${detail}` : ""}${other ? `\nAnother can: /harness ${other}` : ""}` };
  }
  if (!reply.text.trim()) return { refused: `${name} answered nothing, so nothing ran.` };
  return reply.text;
}

/** One chat run in the ledger, as any agent run is written, against the chat rather than a work. */
function charge(log: EventLog, run: AgentRun, now: Date): void {
  log.append({
    at: now.toISOString(),
    kind: "agent.run",
    workId: "chat",
    detail: {
      harness: run.harness, model: run.model, outcome: run.outcome, durationMs: run.durationMs, costSource: run.costSource,
      ...(run.costUsd === undefined ? {} : { costUsd: run.costUsd }),
      ...(run.tokens === undefined ? {} : { tokens: { ...run.tokens } }),
    },
  });
}

/** `/new`: another conversation in a chat without threads; a thread stays one, and loses its skill. */
async function startAnother(transcripts: Transcripts, message: ChatMessage, say: (text: string) => Promise<string>): Promise<void> {
  if (message.threaded) {
    // A thread is one conversation, so `/new` cannot start another; it still
    // ends the skill this thread was started with (S12, A5).
    const kept = transcripts.current(message.place);
    if (kept.skill === undefined) {
      await say("A thread is one conversation. Write in the chat, outside this thread, to start another.");
      return;
    }
    delete kept.skill;
    transcripts.save(kept);
    await say("A thread is one conversation, so this one goes on; the skill it was started with is no longer lent.");
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
async function carriedOut(desk: ChatDesk, reply: string, action: boolean, place: string, progress: ChatProgress, turn: Turn): Promise<{ said: string; outcome?: ChatActOutcome }> {
  const asked = commandsIn(reply);
  const said = reply.trim();
  if (asked.commands.length === 0 && asked.unreadable.length === 0) return { said };
  if (!action) return { said: `${said}\n\nNothing ran: a command runs only when the message starts with /action.` };
  const refused = refusedCommands(asked, desk.commands);
  if (refused.length > 0) return { said: `${said}\n\nRefused, and nothing ran:\n${refused.map((one) => `- \`${one.line}\`: ${one.why}`).join("\n")}` };
  const outcome = await desk.act({
    asked, place, progress,
    ...(desk.conversation.source === undefined ? {} : { source: desk.conversation.source }),
    running: () => {
      turn.acted = true;
      // On disk before it runs: a loop killed mid-command never runs it again on restart.
      turn.persist?.();
    },
  });
  if (outcome.after) turn.after = outcome.after;
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

/** `/<name>` at the start of a message, when it is not one of the chat's own commands, and what follows it. */
function skillIn(text: string): { skill: string; rest: string } | undefined {
  const trimmed = text.trimStart();
  const found = /^\/([\w-]+)/.exec(trimmed);
  if (!found) return undefined;
  const skill = found[1]!;
  // The chat's own commands are read before any skill: `/new` starts a conversation, never a skill.
  if (skill === "new" || skill === "harness" || skill === "action") return undefined;
  const after = trimmed.slice(found[0].length);
  // Addressed to the bot by name: /amy-groom@amy_work_bot.
  if (after.startsWith("@")) return { skill, rest: after.slice(after.search(/\s|$/)) };
  // A word that only starts with a slash, such as a path, is not a skill.
  if (after !== "" && !/^\s/.test(after)) return undefined;
  return { skill, rest: after };
}

/**
 * The whole conversation, each time (S21): what amy is, what this turn may
 * do, the list it may name, and every turn so far, then the new message.
 *
 * A skill turn is addressed to the skill the way a relay addresses one, so
 * the harness it was lent to reads it as the method rather than as context.
 */
function promptFor(desk: ChatDesk, kept: Kept, text: string, action: boolean, skill?: { name: string }): string {
  const list = desk.commands.map((spec) => `  amy ${[...spec.words, spec.args].filter(Boolean).join(" ")} — ${spec.summary}`).join("\n");
  const history = kept.turns.map((turn) => `${turn.who === "person" ? "Person" : "amy"}: ${turn.text}`).join("\n\n");
  const body = [
    "You are amy, answering the person who runs it, in their chat. Be brief: this is read on a phone.",
    desk.about ?? "",
    skill ? `This turn is answered by the skill \`/${skill.name}\`, which is lent to you for this run: follow it, one question at a time, and ask before writing anything.` : "",
    "This turn is read-only: read anything you need and change nothing — no file, no commit, no tracker or code host.",
    action
      ? "The person started this message with /action: to act on amy, end your answer with a fenced block tagged `amy`, one command per line, from the list below. amy runs them, not a shell; a line off the list refuses the whole block."
      : "To act on amy, the person starts a message with /action. If acting would help, say which command, in a fenced block tagged `amy`: it will not run this turn.",
    `The commands:\n${list}`,
    "To change amy's configuration, put the whole new config.yaml in a fenced block tagged `config.yaml` and name `config apply`: it is shown as a diff and written only if it mounts.",
    "A command that takes a value from a block names it: put the body in a fenced block tagged with a file name, such as `answer.md`, and write `--from answer.md`. A heredoc is a shell line and is refused.",
    desk.mountProblem ? `The workflow did not mount: ${desk.mountProblem}` : "",
    history ? `The conversation so far:\n\n${history}` : "",
    `Person: ${text}`,
  ].filter(Boolean).join("\n\n");
  return skill ? `/${skill.name}\n\n${body}` : body;
}

function claimFile(directory: string, id: string): string {
  return path.join(directory, "claims", createHash("sha256").update(id).digest("hex").slice(0, 32));
}

function namesOf(harnesses: ReadonlyMap<string, Harness>): string {
  return harnesses.size > 0 ? [...harnesses.keys()].join(", ") : "none";
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
