/**
 * A workflow's shape, read from the Mermaid `stateDiagram-v2` beside it.
 *
 * amy reads a subset of Mermaid, and every line of it is ordinary Mermaid, so
 * the file renders on GitHub and in Obsidian with nothing installed. The
 * reader is amy's own: the subset is a handful of line forms, smaller than
 * the dependency that would replace it, and the core has none.
 */

import { DiagramError } from "./errors.js";

/** The file a workflow's directory holds beside its entry. */
export const DIAGRAM_FILE = "workflow.mmd";

/** One arrow the diagram draws. A label is prose for a reader; amy does not interpret it. */
export interface DrawnTransition {
  readonly from: string;
  readonly to: string;
  readonly label?: string;
}

export interface Diagram {
  /** Every state the diagram draws, the initial one first, then in the order they appear. */
  readonly states: readonly string[];
  readonly initial: string;
  readonly terminal: readonly string[];
  /** Nothing moves until the world does. */
  readonly waiting: readonly string[];
  /** It waits on the person whose work it is. */
  readonly attention: readonly string[];
  /** Any state that is not terminal may move to it. */
  readonly anywhere: readonly string[];
  /** It leaves to the state the record came from. */
  readonly returns: readonly string[];
  readonly transitions: readonly DrawnTransition[];
  /** The file as it was read, so every view draws the same text. */
  readonly text: string;
}

/** The four classes amy reads. Any other class is left for whoever renders the file. */
export const DIAGRAM_CLASSES = ["waiting", "attention", "anywhere", "returns"] as const;
type DiagramClass = (typeof DIAGRAM_CLASSES)[number];

const START = "[*]";
/** A state is a name of letters, digits and underscores; `[*]` is where work starts and ends. */
const END = /^(?:[A-Za-z_]\w*|\[\*\])$/;
const NAME = /^[A-Za-z_]\w*$/;

/**
 * Constructs a record in one flat state cannot be in, refused by name rather
 * than drawn as something the machine does not do.
 */
const REFUSED: readonly [RegExp, string][] = [
  [/^state\s+.*\{\s*$/, "a composite state is not read: a record is in one flat state"],
  [/^\}\s*$/, "a composite state is not read: a record is in one flat state"],
  [/<<choice>>/, "`<<choice>>` is not read: the decision is code, and the diagram draws where it can lead"],
  [/<<fork>>/, "`<<fork>>` is not read: a record is in one state at a time"],
  [/<<join>>/, "`<<join>>` is not read: a record is in one state at a time"],
  [/^--\s*$/, "a concurrent region is not read: a record is in one state at a time"],
  [/:::/, "the `:::` class shorthand is not read; write `class STATE name` on a line of its own"],
];

/** Lines that are for whoever renders the file, and say nothing about where work can go. */
const LEFT_FOR_THE_RENDERER: readonly RegExp[] = [
  /^%%/,
  /^classDef\s/,
  /^style\s/,
  /^direction\s+(TB|BT|LR|RL)\s*$/,
  /^accTitle\s*:/,
  /^accDescr\s*:/,
  /^note\s+(left|right)\s+of\s+[^\s:]+\s*:/,
];

interface Reading {
  readonly states: string[];
  readonly initial: string[];
  readonly terminal: Set<string>;
  readonly classes: Map<DiagramClass, Set<string>>;
  /** Every state a line names outside an arrow — a class, a style, a note — and the first line naming it. */
  readonly named: Map<string, number>;
  readonly transitions: DrawnTransition[];
}

/**
 * Reads the subset, or refuses with the line that is outside it.
 *
 * `source` names the file in a refusal, for a caller that knows where it
 * came from.
 */
export function readDiagram(text: string, source = DIAGRAM_FILE): Diagram {
  const reading: Reading = {
    states: [],
    initial: [],
    terminal: new Set(),
    classes: new Map(DIAGRAM_CLASSES.map((name) => [name, new Set<string>()])),
    named: new Map(),
    transitions: [],
  };
  const lines = text.split(/\r?\n/);
  let index = frontMatterEnd(lines);
  index = header(lines, index, source);

  for (; index < lines.length; index += 1) {
    const line = lines[index]!.trim();
    const number = index + 1;
    if (line === "") continue;
    for (const state of namedBy(line)) if (!reading.named.has(state)) reading.named.set(state, number);
    const block = blockEnd(lines, index, line, source);
    if (block !== undefined) {
      index = block;
      continue;
    }
    readLine(line, number, reading, source);
  }

  return settle(reading, text, source);
}

/** A Mermaid front-matter block (`---` … `---`) ahead of the header is configuration for the renderer. */
function frontMatterEnd(lines: readonly string[]): number {
  const first = lines.findIndex((line) => line.trim() !== "");
  if (first < 0 || lines[first]!.trim() !== "---") return 0;
  const close = lines.findIndex((line, at) => at > first && line.trim() === "---");
  return close < 0 ? lines.length : close + 1;
}

function header(lines: readonly string[], from: number, source: string): number {
  for (let index = from; index < lines.length; index += 1) {
    const line = lines[index]!.trim();
    if (line === "" || line.startsWith("%%")) continue;
    if (line === "stateDiagram-v2") return index + 1;
    throw new DiagramError(index + 1, `the first line is \`${line}\`, and amy reads a \`stateDiagram-v2\``, source);
  }
  throw new DiagramError(0, "it is empty, and amy reads a `stateDiagram-v2`", source);
}

/** A multi-line `note … end note` or `accDescr { … }` is prose, skipped whole. Returns the index of its last line. */
function blockEnd(lines: readonly string[], index: number, line: string, source: string): number | undefined {
  if (/^note\s+(left|right)\s+of\s+[^\s:]+\s*$/.test(line)) {
    return closingLine(lines, index, (next) => next === "end note", "a `note` is never closed with `end note`", source);
  }
  if (!/^accDescr\s*\{/.test(line)) return undefined;
  return /\}\s*$/.test(line) ? index : closingLine(lines, index, (next) => /\}\s*$/.test(next), "an `accDescr {` is never closed with `}`", source);
}

/**
 * The line a block closes on. One left open is refused at the line that
 * opened it: Mermaid would not draw it, and what follows would be read as
 * prose rather than as states.
 */
function closingLine(lines: readonly string[], index: number, closes: (line: string) => boolean, unclosed: string, source: string): number {
  for (let at = index + 1; at < lines.length; at += 1) {
    if (closes(lines[at]!.trim())) return at;
  }
  throw new DiagramError(index + 1, unclosed, source);
}

function readLine(line: string, number: number, reading: Reading, source: string): void {
  // Prose first: a comment, a note or a label may mention `<<choice>>` or
  // `:::` without drawing either.
  if (LEFT_FOR_THE_RENDERER.some((pattern) => pattern.test(line))) return;
  const drawn = withoutLabel(line);
  for (const [pattern, reason] of REFUSED) {
    if (pattern.test(drawn)) throw new DiagramError(number, reason, source);
  }

  const arrow = arrowIn(line);
  if (arrow) return readTransition(arrow.from, arrow.to, arrow.label, number, reading, source);

  const marked = classIn(line);
  if (marked) return readClass(marked.states, marked.name, number, reading);

  throw new DiagramError(number, `\`${line}\` is not a line amy reads; it reads \`A --> B\`, \`[*] --> A\`, \`A --> [*]\` and \`class A name\``, source);
}

/** An arrow's line up to its label: the label's first colon is one with no colon beside it. */
function withoutLabel(line: string): string {
  const at = line.indexOf("-->");
  if (at < 0) return line;
  const label = line.slice(at + 3).search(/(?<!:):(?!:)/);
  return label < 0 ? line : line.slice(0, at + 3 + label);
}

/**
 * The states a line names without drawing them: a `class` of any name, a
 * `style`, a `note`. Each has to be a state an arrow draws, or the diagram
 * renders a state the workflow does not have.
 */
function namedBy(line: string): string[] {
  const marked = classIn(line);
  if (marked) return marked.states;
  const styled = /^style\s+(\S+)\s/.exec(line);
  if (styled) return styled[1]!.split(",").map((state) => state.trim());
  const noted = /^note\s+(?:left|right)\s+of\s+([^\s:]+)/.exec(line);
  return noted ? [noted[1]!] : [];
}

/** `A --> B`, or `A --> B: label`. Everything after the first colon is the label, arrows included. */
function arrowIn(line: string): { from: string; to: string; label?: string } | undefined {
  const at = line.indexOf("-->");
  if (at < 0) return undefined;
  const rest = line.slice(at + 3);
  const colon = rest.indexOf(":");
  const from = line.slice(0, at).trim();
  const to = (colon < 0 ? rest : rest.slice(0, colon)).trim();
  if (!END.test(from) || !END.test(to)) return undefined;
  return colon < 0 ? { from, to } : { from, to, label: rest.slice(colon + 1) };
}

/** `class A,B name`. */
function classIn(line: string): { states: string[]; name: string } | undefined {
  const words = /^class\s+(.+)\s+(\S+)$/.exec(line.replace(/;$/, "").trim());
  if (!words) return undefined;
  const states = words[1]!.split(",").map((state) => state.trim());
  const name = words[2]!;
  return states.every((state) => NAME.test(state)) && NAME.test(name) ? { states, name } : undefined;
}

function readTransition(from: string, to: string, label: string | undefined, number: number, reading: Reading, source: string): void {
  if (from === START && to === START) throw new DiagramError(number, "`[*] --> [*]` draws no state", source);
  if (from === START) {
    reading.initial.push(to);
    see(reading, to);
    return;
  }
  see(reading, from);
  if (to === START) {
    reading.terminal.add(from);
    return;
  }
  see(reading, to);
  const said = label?.trim();
  reading.transitions.push(said ? { from, to, label: said } : { from, to });
}

function readClass(states: readonly string[], name: string, number: number, reading: Reading): void {
  if (!(DIAGRAM_CLASSES as readonly string[]).includes(name)) return;
  for (const state of states) {
    reading.classes.get(name as DiagramClass)!.add(state);
  }
}

function see(reading: Reading, state: string): void {
  if (!reading.states.includes(state)) reading.states.push(state);
}

function settle(reading: Reading, text: string, source: string): Diagram {
  if (reading.initial.length === 0) throw new DiagramError(0, "no `[*] --> STATE` names the initial state", source);
  if (reading.initial.length > 1) {
    throw new DiagramError(0, `\`[*]\` leads to ${reading.initial.map((state) => `\`${state}\``).join(" and ")}; a workflow starts in one state`, source);
  }
  for (const [state, line] of reading.named) {
    if (!reading.states.includes(state)) throw new DiagramError(line, `\`${state}\` is named here, and no transition draws it`, source);
  }
  if (reading.terminal.size === 0) throw new DiagramError(0, "no `STATE --> [*]` names a state where the work ends", source);

  const initial = reading.initial[0]!;
  const of = (name: DiagramClass) => reading.states.filter((state) => reading.classes.get(name)!.has(state));
  return {
    states: [initial, ...reading.states.filter((state) => state !== initial)],
    initial,
    terminal: reading.states.filter((state) => reading.terminal.has(state)),
    waiting: of("waiting"),
    attention: of("attention"),
    anywhere: of("anywhere"),
    returns: of("returns"),
    transitions: reading.transitions,
    text,
  };
}

/**
 * Whether the diagram connects one state to another.
 *
 * Drawn, or reached through a class: any state that is not terminal may
 * move to an `anywhere` state, and a `returns` state may leave to the state
 * the record came from, which `cameFrom` names.
 */
export function connects(diagram: Diagram, from: string, to: string, cameFrom?: string): boolean {
  if (diagram.transitions.some((edge) => edge.from === from && edge.to === to)) return true;
  if (diagram.anywhere.includes(to) && !diagram.terminal.includes(from)) return true;
  return diagram.returns.includes(from) && cameFrom === to;
}

/** The state a record was in before it last entered `state`, read from its history. */
export function cameFrom(history: readonly { readonly from: string; readonly to: string }[], state: string): string | undefined {
  for (let index = history.length - 1; index >= 0; index -= 1) {
    if (history[index]!.to === state) return history[index]!.from;
  }
  return undefined;
}

/**
 * The diagram with one state marked as where a piece of work is.
 *
 * Two ordinary Mermaid lines at the end, so the result renders wherever the
 * file does and a pull request comment shows where the work stands.
 */
export function markState(diagram: Diagram, state: string): string {
  if (!diagram.states.includes(state)) throw new Error(`the diagram draws no \`${state}\``);
  const text = diagram.text.replace(/\s*$/, "");
  return `${text}\n\n    classDef current stroke-width:3px,font-weight:bold\n    class ${state} current\n`;
}
