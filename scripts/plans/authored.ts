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

const PROOF = /\b(?:test|property):([^\s#,;"]+)/g;

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
  readonly options: ReadonlySet<string>;
  readonly takesArguments: boolean;
}

const SPAN = /`amy ([^`]+)`/g;

function commandProblems(file: string, text: string, criteria: Declaration["criteria"] & object, cli: CliFacts): string[] {
  const promised = criteria.map((one) => (typeof one?.statement === "string" ? one.statement : "")).join("\n");
  const globals = new Set(cli.options.flatMap((option) => flagsOf(option.flags)));
  const known: Known[] = cli.commands.map((command) => ({
    words: command.path.map((word) => word.split(" ")[0]!),
    options: new Set(command.options.flatMap((option) => flagsOf(option.flags))),
    takesArguments: command.arguments.length > 0 || command.path.some((word) => word.includes(" ")),
  }));
  const problems: string[] = [];
  for (const [, span] of text.matchAll(SPAN)) {
    const said = `amy ${span!.trim()}`;
    const problem = unknownIn(span!, known, globals);
    if (problem === undefined) continue;
    if (promised.includes(said) || promised.includes(`amy ${problem.command}`)) continue;
    problems.push(`${file} names \`${said}\`, and ${problem.why}: name what the CLI declares at the base, or the criterion that builds it`);
  }
  return [...new Set(problems)];
}

function unknownIn(span: string, known: readonly Known[], globals: ReadonlySet<string>): { command: string; why: string } | undefined {
  const tokens = span.trim().split(/\s+/);
  const found = commandIn(tokens, known);
  if (found === undefined || "unknown" in found) return found?.unknown;
  const words = found.match.words.join(" ");
  const flag = tokens.map((token) => /^(--?[a-zA-Z][\w-]*)/.exec(token)?.[1]).find((one) => one !== undefined && !found.match.options.has(one) && !globals.has(one) && one !== "--help" && one !== "-h");
  return flag ? { command: words, why: `amy ${words} declares no ${flag}` } : undefined;
}

/** The command a span's leading words name, the first word that names none, or nothing when it names no command at all. */
function commandIn(tokens: readonly string[], known: readonly Known[]): { match: Known } | { unknown: { command: string; why: string } } | undefined {
  const words: string[] = [];
  let match: Known | undefined;
  for (const token of tokens) {
    if (!/^[a-z][a-z0-9-]*$/.test(token)) break;
    const next = known.find((one) => same(one.words, [...words, token]));
    if (next) {
      words.push(token);
      match = next;
      continue;
    }
    // Past a command, a word is its argument, unless the command only groups others.
    if (match && (match.takesArguments || !groups(words, known))) break;
    const command = [...words, token].join(" ");
    return { unknown: { command, why: `the CLI declares no amy ${command}` } };
  }
  return match ? { match } : undefined;
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
