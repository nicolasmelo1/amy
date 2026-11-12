/** One amy command the chat may run, as the command line spells it. */
export interface ChatCommandSpec {
  /** The words that name it: `["plugin", "add"]`. */
  readonly words: readonly string[];
  /** How its arguments read, for the harness: `<spec>`. */
  readonly args?: string;
  /**
   * The flags it takes from the chat, each with whether it carries a value:
   * `{ "--json": false, "--from": true }`.
   *
   * A command that declares none takes no argument at all: a chat turn has no
   * shell to read a line the way the command line would, so a flag is a thing
   * the command itself has to say it accepts.
   */
  readonly flags?: Readonly<Record<string, boolean>>;
  /**
   * The flags whose value names a fenced block in the same answer, such as
   * `--from answer.md`.
   *
   * A block is how a body with a newline in it arrives: one line of a chat
   * answer is one command, and a heredoc is a shell line the chat refuses.
   */
  readonly blocks?: readonly string[];
  readonly summary: string;
}

/** A command an answer named: its arguments, and the line they came from. */
export interface NamedCommand {
  readonly argv: readonly string[];
  readonly line: string;
}

/** What an answer asks for: the commands in its `amy` blocks, and every other block by its file name. */
export interface Asked {
  readonly commands: readonly NamedCommand[];
  /** A block tagged with a file name (`config.yaml`), by that name. */
  readonly blocks: ReadonlyMap<string, string>;
  /** Lines that are no command: a shell line, a quote left open. */
  readonly unreadable: readonly { line: string; why: string }[];
}

/**
 * The commands an answer names (S12).
 *
 * Only inside a fenced block tagged `amy`, one per line, a leading `amy`
 * allowed: prose that happens to mention a command names none. A block
 * tagged with a file name is kept by that name, which is how an answer hands
 * a whole new `config.yaml` to `config apply`.
 */
export function commandsIn(answer: string): Asked {
  const commands: NamedCommand[] = [];
  const unreadable: { line: string; why: string }[] = [];
  const blocks = new Map<string, string>();
  // A fence closes on a run of backticks at least as long as the one that
  // opened it, so a block fenced with four holds a three-backtick example.
  for (const fence of answer.matchAll(/^(`{3,})[ \t]*([^\n`]*)\n([\s\S]*?)^\1`*[ \t]*$/gm)) {
    const info = fence[2]!.trim().split(/\s+/).filter(Boolean);
    const body = fence[3]!;
    if (info[0] === "amy") {
      for (const raw of body.split("\n")) {
        const line = raw.trim();
        if (line === "" || line.startsWith("#")) continue;
        const read = tokenize(line);
        if ("why" in read) unreadable.push({ line, why: read.why });
        else commands.push({ argv: read.argv[0] === "amy" ? read.argv.slice(1) : read.argv, line });
      }
      continue;
    }
    const named = info.find((word) => /^[\w.-]+\.\w+$/.test(word));
    if (named) blocks.set(named, body);
  }
  return { commands, blocks, unreadable };
}

/**
 * A line split into arguments as a person would read it, quotes and all, and
 * refused when it is a shell line: a pipe, a redirect, a substitution, a
 * second command. amy runs amy with these arguments, never a shell, so a line
 * that only means something to a shell means nothing here.
 */
export function tokenize(line: string): { argv: string[] } | { why: string } {
  const argv: string[] = [];
  let current = "";
  let started = false;
  for (let at = 0; at < line.length; at += 1) {
    const char = line[at]!;
    if (char === "'" || char === '"') {
      const quoted = readQuoted(line, at);
      if (!quoted) return { why: "leaves a quote open" };
      current += quoted.text;
      at = quoted.end;
      started = true;
    } else if (/\s/.test(char)) {
      if (started) argv.push(current);
      current = "";
      started = false;
    } else if (SHELL.includes(char)) {
      return { why: `is a shell line (${char}); amy runs its own commands, never a shell` };
    } else {
      current += char;
      started = true;
    }
  }
  if (started) argv.push(current);
  return argv.length === 0 ? { why: "names nothing" } : { argv };
}

/** What only a shell gives meaning to, outside quotes. */
const SHELL = "|&;<>$`(){}\\*?~!";

/** A quoted run from its opening quote: its text, and where it closes; nothing when it never does. */
function readQuoted(line: string, at: number): { text: string; end: number } | undefined {
  const quote = line[at];
  let text = "";
  for (let index = at + 1; index < line.length; index += 1) {
    const char = line[index]!;
    if (char === quote) return { text, end: index };
    // Only a quote or a backslash is escaped: a Windows path keeps its backslashes.
    if (char === "\\" && quote === '"' && (line[index + 1] === '"' || line[index + 1] === "\\")) text += line[++index];
    else text += char;
  }
  return undefined;
}

/** The spec a command runs, by the longest run of its words that names one. */
export function specOf(command: NamedCommand, specs: readonly ChatCommandSpec[]): ChatCommandSpec | undefined {
  return [...specs]
    .sort((a, b) => b.words.length - a.words.length)
    .find((spec) => spec.words.every((word, index) => command.argv[index] === word));
}

/**
 * Every line that may not run, by name (A4): a command off the list, a flag it
 * does not take, a block it names that the answer does not carry, and a line
 * no command can be read from. One refused line refuses the turn's whole
 * batch, so nothing runs half of what was meant.
 */
export function refusedCommands(asked: Asked, specs: readonly ChatCommandSpec[]): { line: string; why: string }[] {
  return [
    ...asked.unreadable,
    ...asked.commands.flatMap((command) => refusals(command, specs, asked)),
  ];
}

/** What one line's command cannot run as it was written. */
function refusals(command: NamedCommand, specs: readonly ChatCommandSpec[], asked: Asked): { line: string; why: string }[] {
  const spec = specOf(command, specs);
  if (!spec) return [{ line: command.line, why: `\`${command.argv.slice(0, 2).join(" ")}\` is not a command amy runs from the chat` }];

  const rest = command.argv.slice(spec.words.length);
  // A command declared with no arguments runs exactly as declared: one it would drop is refused.
  if (spec.flags === undefined && spec.args === undefined) {
    return rest.length > 0 ? [{ line: command.line, why: `\`amy ${spec.words.join(" ")}\` takes no arguments from the chat` }] : [];
  }
  return flagRefusals(command, spec, rest, asked);
}

/** What its flags cannot do: one it does not take, one with no value, one naming a block the answer lacks. */
function flagRefusals(command: NamedCommand, spec: ChatCommandSpec, rest: readonly string[], asked: Asked): { line: string; why: string }[] {
  const refusals: { line: string; why: string }[] = [];
  for (let at = 0; at < rest.length; at += 1) {
    const token = rest[at]!;
    // Anything that is not a flag is an argument the command's own help describes.
    if (!token.startsWith("--")) continue;
    const takesValue = spec.flags?.[token];
    if (takesValue === undefined) {
      refusals.push({ line: command.line, why: `\`amy ${spec.words.join(" ")}\` does not take \`${token}\` from the chat` });
      continue;
    }
    if (!takesValue) continue;
    const value = rest[at + 1];
    if (value === undefined || value.startsWith("--")) {
      refusals.push({ line: command.line, why: `\`${token}\` needs a value the chat can read` });
      continue;
    }
    at += 1;
    // A block is a named fenced block in this same answer, so a missing one is
    // known before anything runs rather than after half the batch did.
    if (spec.blocks?.includes(token) && !asked.blocks.has(value)) {
      refusals.push({ line: command.line, why: `\`${token} ${value}\` names a block this answer does not carry` });
    }
  }
  return refusals;
}
