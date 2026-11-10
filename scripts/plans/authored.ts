import path from "node:path";
import yaml from "yaml";
import type { CliFacts } from "../docs/lib/facts.js";

/**
 * A groomed plan is checked against the code it was read at.
 *
 * Its touches are exact paths, so a reader knows every file the work moves
 * before it starts; its proofs are files that exist or that it touches; and
 * every `amy` command it names in backticks is one the CLI declares, unless
 * one of its own criteria is the promise to build it. See
 * plans/a-plan-is-held-to-what-it-said.md.
 */

export interface AuthoredInput {
  /** Where the plan is, for the messages. */
  readonly file: string;
  readonly text: string;
  /** Every file tracked at the change's base. */
  readonly baseFiles: ReadonlySet<string>;
  /** The CLI as it was declared at the base. */
  readonly cli: CliFacts;
}

interface Declaration {
  touches?: unknown;
  criteria?: Array<{ id?: unknown; statement?: unknown; proof?: unknown }>;
}

export function authoredProblems(input: AuthoredInput): string[] {
  const declaration = declarationIn(input.text);
  if (!declaration) return [`${input.file} opens with no declaration to check`];
  const touches = Array.isArray(declaration.touches) ? declaration.touches.filter((one): one is string => typeof one === "string") : [];
  return [
    ...touchesProblems(input.file, touches, input.baseFiles),
    ...proofProblems(input.file, declaration.criteria ?? [], touches, input.baseFiles),
    ...commandProblems(input.file, input.text, declaration.criteria ?? [], input.cli),
  ];
}

function declarationIn(text: string): Declaration | undefined {
  const match = /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/.exec(text);
  if (!match) return undefined;
  try {
    const parsed: unknown = yaml.parse(match[1]!);
    return parsed !== null && typeof parsed === "object" ? (parsed as Declaration) : undefined;
  } catch {
    return undefined;
  }
}

const GLOB = /[*?[{]/;

function touchesProblems(file: string, touches: readonly string[], baseFiles: ReadonlySet<string>): string[] {
  const problems: string[] = [];
  const baseDirectories = directoriesOf(baseFiles);
  const seen = new Set<string>();
  // A directory the plan creates is one holding an entry of its own.
  const holding = new Set(touches.filter((one) => !GLOB.test(one)).map((one) => path.posix.dirname(one)));
  for (const entry of touches) {
    if (seen.has(entry)) problems.push(`${file} touches ${entry} twice`);
    seen.add(entry);
    if (entry.startsWith("/") || entry.split("/").some((part) => part === ".." || part === "." || part === "")) {
      problems.push(`${file} touches ${entry}: name a path from the repository's root, with no leading /, . or ..`);
      continue;
    }
    if (entry.includes("**")) {
      problems.push(`${file} touches ${entry}: name the files, not a tree, so the work's every file is known before it starts`);
      continue;
    }
    if (GLOB.test(entry)) {
      if (![...baseFiles].some((one) => path.posix.matchesGlob(one, entry))) {
        problems.push(`${file} touches ${entry}, which matches nothing at the base: name the files it creates`);
      }
      continue;
    }
    if (baseFiles.has(entry)) continue;
    // A file the work creates: every directory up to one the base has holds an entry.
    for (let directory = path.posix.dirname(entry); directory !== "." && !baseDirectories.has(directory); directory = path.posix.dirname(directory)) {
      if (!holding.has(directory)) {
        problems.push(`${file} touches ${entry}, and ${directory} is neither at the base nor holds another entry: a misspelt path, or a directory the plan does not name`);
        break;
      }
    }
  }
  return problems;
}

function directoriesOf(files: ReadonlySet<string>): Set<string> {
  const directories = new Set<string>();
  for (const file of files) {
    for (let directory = path.posix.dirname(file); directory !== "." && !directories.has(directory); directory = path.posix.dirname(directory)) {
      directories.add(directory);
    }
  }
  return directories;
}

const PROOF = /\b(?:test|property):([^\s#,;"]*)/g;

function proofProblems(file: string, criteria: Declaration["criteria"] & object, touches: readonly string[], baseFiles: ReadonlySet<string>): string[] {
  const problems: string[] = [];
  for (const criterion of criteria) {
    if (typeof criterion?.proof !== "string") continue;
    for (const [, cited] of criterion.proof.matchAll(PROOF)) {
      const target = cited!.replace(/[.]+$/, "");
      if (baseFiles.has(target) || touches.some((entry) => entry === target || (GLOB.test(entry) && path.posix.matchesGlob(target, entry)))) continue;
      const id = typeof criterion.id === "string" ? criterion.id : "a criterion";
      problems.push(target.includes("/")
        ? `${file} ${id} is proven by ${target}, which is neither at the base nor in its touches`
        : `${file} ${id} is proven by "${criterion.proof}", which names no file`);
    }
  }
  return problems;
}

/** A command the CLI declares, by the words that name it. */
interface Known {
  readonly words: readonly string[];
  /** Each option, and whether a value follows it. */
  readonly options: ReadonlyMap<string, boolean>;
  readonly takesArguments: boolean;
  /** Run when its parent is named alone: `amy brief <id>` is `amy brief show <id>`. */
  readonly isDefault: boolean;
}

const SPAN = /`amy ([^`]+)`/g;

function commandProblems(file: string, text: string, criteria: Declaration["criteria"] & object, cli: CliFacts): string[] {
  const promised = criteria.map((one) => (typeof one?.statement === "string" ? one.statement : "")).join("\n");
  // Each global option, and whether a value follows it.
  const globals = new Map(cli.options.flatMap((option) => flagsOf(option.flags).map((flag) => [flag, /[<[]/.test(option.flags)] as const)));
  const known: Known[] = cli.commands.map((command) => ({
    words: command.path.map((word) => word.split(" ")[0]!),
    options: new Map(command.options.flatMap((option) => flagsOf(option.flags).map((flag) => [flag, /[<[]/.test(option.flags)] as const))),
    takesArguments: command.arguments.length > 0 || command.path.some((word) => word.includes(" ")),
    isDefault: command.isDefault,
  }));
  const problems: string[] = [];
  for (const [, span] of text.matchAll(SPAN)) {
    const said = `amy ${span!.trim()}`;
    const problem = unknownIn(span!, known, globals);
    if (problem === undefined) continue;
    // A criterion that builds a command covers it; an option on a command that
    // exists is covered only by a criterion naming that option.
    const covered = problem.flag === undefined
      ? problem.command !== "" && promised.includes(`amy ${problem.command}`)
      : promised.includes(problem.flag);
    if (promised.includes(said) || covered) continue;
    problems.push(`${file} names \`${said}\`, and ${problem.why}: name what the CLI declares at the base, or the criterion that builds it`);
  }
  return [...new Set(problems)];
}

interface Unknown {
  readonly command: string;
  readonly why: string;
  /** The option the command does not declare, when that is what is unknown. */
  readonly flag?: string;
}

/** What a quoted word, a placeholder or anything after `--` becomes: an argument, never a command or an option. */
const ARGUMENT = "\u0000";

/** A span's words as a shell reads them: a quoted run is one argument, and `--` ends the options. */
function tokensOf(span: string): string[] {
  const tokens: string[] = [];
  let ended = false;
  for (const word of span.matchAll(/"[^"]*"|'[^']*'|(\S+)/g)) {
    // Only an unquoted word is captured: a quoted one has no bare form.
    const bare = word[1];
    if (bare === "--" && !ended) {
      ended = true;
      continue;
    }
    tokens.push(bare === undefined || ended || /^[<[]/.test(bare) ? ARGUMENT : bare);
  }
  return tokens;
}

function unknownIn(span: string, known: readonly Known[], globals: ReadonlyMap<string, boolean>): Unknown | undefined {
  const all = tokensOf(span);
  const leading = globalsBefore(all, globals);
  if ("unknown" in leading) return leading.unknown;
  const tokens = all.slice(leading.next);
  const found = commandIn(tokens, known, globals);
  if (found === undefined || "unknown" in found) return found?.unknown;
  const words = found.match.words.join(" ");
  // A group's options include those of the subcommand it runs by default.
  const fallback = defaultUnder(found.match.words, known);
  const declared = (flag: string) => found.match.options.has(flag) || fallback?.options.has(flag) === true || globals.has(flag);
  const flag = tokens.map((token) => /^(--?[a-zA-Z][\w-]*)/.exec(token)?.[1]).find((one) => one !== undefined && !declared(one) && one !== "--help" && one !== "-h");
  return flag ? { command: words, why: `amy ${words} declares no ${flag}`, flag } : undefined;
}

/** Steps over the global options a span opens with, and the value each takes, to where its command starts. */
function globalsBefore(tokens: readonly string[], globals: ReadonlyMap<string, boolean>): { next: number } | { unknown: { command: string; why: string } } {
  let at = 0;
  while (at < tokens.length && tokens[at]!.startsWith("-")) {
    const [flag, inline] = tokens[at]!.split("=", 2) as [string, string | undefined];
    const takesValue = globals.get(flag);
    if (takesValue === undefined && flag !== "--help" && flag !== "-h" && flag !== "--version" && flag !== "-V") {
      return { unknown: { command: "", why: `amy declares no global ${flag}` } };
    }
    at += takesValue && inline === undefined ? 2 : 1;
  }
  return { next: at };
}

/** The command a span's leading words name, the first word that names none, or nothing when it names no command at all. */
function commandIn(tokens: readonly string[], known: readonly Known[], globals: ReadonlyMap<string, boolean>): { match: Known } | { unknown: Unknown } | undefined {
  const words: string[] = [];
  let match: Known | undefined;
  for (let at = 0; at < tokens.length; at += 1) {
    const word = tokens[at]!;
    // An option between the words, and its value, is stepped over: the words around it still name the command.
    if (word.startsWith("-")) {
      at += valueAfter(word, match, globals) ? 1 : 0;
      continue;
    }
    // An argument before any command names none: the span is generic, like `amy <command>`.
    if (word === ARGUMENT) break;
    const next = known.find((one) => same(one.words, [...words, word]));
    if (next) {
      words.push(word);
      match = next;
      continue;
    }
    // Past a command, a word is its argument, unless the command only groups others.
    if (match && (match.takesArguments || !groups(words, known))) break;
    // A group with a default subcommand that takes arguments hands it the word.
    const fallback = defaultUnder(words, known);
    if (fallback?.takesArguments && match) {
      match = fallback;
      break;
    }
    const command = [...words, word].join(" ");
    return { unknown: { command, why: `the CLI declares no amy ${command}` } };
  }
  return match ? { match } : undefined;
}

/** Whether an option is followed by its value as the next word, rather than given inline with `=`. */
function valueAfter(token: string, match: Known | undefined, globals: ReadonlyMap<string, boolean>): boolean {
  const [flag, inline] = token.split("=", 2) as [string, string | undefined];
  return inline === undefined && (match?.options.get(flag) ?? globals.get(flag)) === true;
}

/** The subcommand a group runs when it is named alone, if it has one. */
function defaultUnder(words: readonly string[], known: readonly Known[]): Known | undefined {
  return known.find((one) => one.isDefault && one.words.length === words.length + 1 && same(one.words.slice(0, words.length), words));
}

function groups(words: readonly string[], known: readonly Known[]): boolean {
  return known.some((one) => one.words.length > words.length && same(one.words.slice(0, words.length), words));
}

function same(one: readonly string[], other: readonly string[]): boolean {
  return one.length === other.length && one.every((word, at) => word === other[at]);
}

/** `-w, --workflow <name>` names `-w` and `--workflow`; `--no-x` names `--no-x`. */
function flagsOf(flags: string): string[] {
  return flags.split(/[ ,|]+/).filter((part) => part.startsWith("-")).map((part) => part.replace(/[=<[].*$/, ""));
}
