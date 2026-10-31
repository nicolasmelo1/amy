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
  /** It calls another workflow, and its edges out are named for where that one ends. */
  readonly calls: readonly string[];
  /**
   * Every `<<fork>>`, with the lanes drawn out of it and the `<<join>>` they
   * all lead to. A record waits in the fork while its lanes run, each lane a
   * call of its own, and moves to the join when every one has ended.
   */
  readonly forks: Readonly<Record<string, Fork>>;
  /** A state's description, from `state "…" as NAME`: prose for a reader, never read as a binding. */
  readonly labels: Readonly<Record<string, string>>;
  readonly transitions: readonly DrawnTransition[];
  /** The file as it was read, so every view draws the same text. */
  readonly text: string;
}

/** One `<<fork>>`: the lanes it starts, in the order they are drawn, and the join they meet at. */
export interface Fork {
  readonly lanes: readonly string[];
  readonly join: string;
}

/** The five classes amy reads. Any other class is left for whoever renders the file. */
export const DIAGRAM_CLASSES = ["waiting", "attention", "anywhere", "returns", "call"] as const;
type DiagramClass = (typeof DIAGRAM_CLASSES)[number];

const START = "[*]";
/** A state is a name of letters, digits and underscores; `[*]` is where work starts and ends. */
const END = /^(?:[A-Za-z_]\w*|\[\*\])$/;
const NAME = /^[A-Za-z_]\w*$/;
/** `state "a description" as NAME`, which names a state and draws nothing. */
const DESCRIBED = /^state\s+"([^"]*)"\s+as\s+([A-Za-z_]\w*)\s*$/;
/** `state NAME <<fork>>` or `state NAME <<join>>`: where lanes split, and where they meet again. */
const PSEUDO = /^state\s+([A-Za-z_]\w*)\s+<<(fork|join)>>\s*$/;
/**
 * Names Mermaid's state grammar takes as keywords, compared without case: a
 * state called one of them would mount and never render.
 */
const RESERVED = new Set(["class", "classdef", "click", "default", "href", "note", "scale", "state", "statediagram", "style"]);

/**
 * Constructs a record in one flat state cannot be in, refused by name rather
 * than drawn as something the machine does not do.
 */
const REFUSED: readonly [RegExp, string][] = [
  [/^state\s+.*\{\s*$/, "a composite state is not read: a record is in one flat state"],
  [/^\}\s*$/, "a composite state is not read: a record is in one flat state"],
  [/<<choice>>/, "`<<choice>>` is not read: the decision is code, and the diagram draws where it can lead"],
  [/<<fork>>/, "`<<fork>>` is read only as `state NAME <<fork>>`, on a line of its own"],
  [/<<join>>/, "`<<join>>` is read only as `state NAME <<join>>`, on a line of its own"],
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
  readonly labels: Record<string, string>;
  readonly transitions: DrawnTransition[];
  readonly forks: Set<string>;
  readonly joins: Set<string>;
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
    labels: {},
    transitions: [],
    forks: new Set(),
    joins: new Set(),
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
  // A description is prose too, whatever it mentions.
  const described = DESCRIBED.exec(line);
  if (described) {
    reading.labels[described[2]!] = described[1]!;
    return;
  }
  const pseudo = PSEUDO.exec(line);
  if (pseudo) {
    (pseudo[2] === "fork" ? reading.forks : reading.joins).add(pseudo[1]!);
    return;
  }
  const drawn = withoutLabel(line);
  for (const [pattern, reason] of REFUSED) {
    if (pattern.test(drawn)) throw new DiagramError(number, reason, source);
  }

  const arrow = arrowIn(line);
  if (arrow) return readTransition(arrow.from, arrow.to, arrow.label, number, reading, source);

  const marked = classIn(line);
  if (marked) return readClass(marked.states, marked.name, number, reading);

  throw new DiagramError(number, `\`${line}\` is not a line amy reads; it reads \`A --> B\`, \`[*] --> A\`, \`A --> [*]\`, \`class A name\` and \`state "description" as A\``, source);
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
  const described = DESCRIBED.exec(line);
  if (described) return [described[2]!];
  const pseudo = PSEUDO.exec(line);
  if (pseudo) return [pseudo[1]!];
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
  for (const end of [from, to]) {
    if (RESERVED.has(end.toLowerCase())) {
      throw new DiagramError(number, `\`${end}\` is a word Mermaid reads as a keyword, in any case, not as a state; name the state something else`, source);
    }
  }
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
    calls: of("call"),
    forks: forksOf(reading, source),
    labels: reading.labels,
    transitions: reading.transitions,
    text,
  };
}

/**
 * Every fork with its lanes and the join they meet at, or the refusal that
 * names what is drawn wrong.
 *
 * A record is in one state at a time, and that stays true: the record waits
 * in the fork, and every lane is a call, so each one is a record of its own.
 * A lane that is not a call, a lane whose edges lead anywhere but the join,
 * and a join some lane never reaches would each be a drawing of something the
 * machine does not do.
 */
function forksOf(reading: Reading, source: string): Record<string, Fork> {
  const refuse = (why: string): never => {
    throw new DiagramError(0, why, source);
  };
  for (const state of [...reading.forks, ...reading.joins]) pseudoFits(reading, state, refuse);
  const forks: Record<string, Fork> = {};
  const laned = new Set<string>();
  for (const fork of reading.forks) forks[fork] = forkOf(reading, fork, laned, refuse);
  for (const join of reading.joins) joinFits(reading, join, forks, refuse);
  return forks;
}

type Refuse = (why: string) => never;

const out = (reading: Reading, state: string) => reading.transitions.filter((edge) => edge.from === state);
const into = (reading: Reading, state: string) => reading.transitions.filter((edge) => edge.to === state);

/** A fork or a join is one or the other, never where work starts or ends, and never a call. */
function pseudoFits(reading: Reading, state: string, refuse: Refuse): void {
  if (reading.forks.has(state) && reading.joins.has(state)) refuse(`\`${state}\` is drawn as a fork and as a join; a state is one or the other`);
  if (reading.initial.includes(state) || reading.terminal.has(state)) refuse(`\`${state}\` is a fork or a join, and work neither starts nor ends in one`);
  if (reading.classes.get("call")!.has(state)) refuse(`\`${state}\` is a fork or a join and a call; the lanes are the calls`);
}

/** One fork's lanes, each a call started only there, and the join every one of them leads to. */
function forkOf(reading: Reading, fork: string, laned: Set<string>, refuse: Refuse): Fork {
  const lanes = out(reading, fork).map((edge) => edge.to);
  if (lanes.length < 2) refuse(`the fork \`${fork}\` draws ${lanes.length} lane(s); a fork splits work into two or more, and one is a call`);
  for (const lane of lanes) laneFits(reading, fork, lane, laned, refuse);
  const join = [...new Set(lanes.flatMap((lane) => out(reading, lane).map((edge) => edge.to)))].find((state) => reading.joins.has(state));
  if (!join) return refuse(`the lanes of \`${fork}\` lead to no \`<<join>>\`; draw where they meet again`);
  for (const lane of lanes) meetsAt(reading, fork, lane, join, refuse);
  return { lanes, join };
}

function laneFits(reading: Reading, fork: string, lane: string, laned: Set<string>, refuse: Refuse): void {
  if (!reading.classes.get("call")!.has(lane)) refuse(`\`${lane}\` is a lane of the fork \`${fork}\` and not a call: every lane is a record of its own — add \`class ${lane} call\``);
  if (laned.has(lane)) refuse(`\`${lane}\` is drawn twice out of a fork; each lane is drawn once`);
  laned.add(lane);
  const from = into(reading, lane).map((edge) => edge.from).filter((state) => state !== fork);
  if (from.length > 0) refuse(`\`${lane}\` is a lane of \`${fork}\` and is also reached from \`${from[0]}\`; a lane starts only at its fork`);
}

/** Every end of a lane leads to its join, and nowhere else. */
function meetsAt(reading: Reading, fork: string, lane: string, join: string, refuse: Refuse): void {
  const edges = out(reading, lane);
  if (edges.length === 0) refuse(`\`${lane}\` is a lane of \`${fork}\` and never reaches the join \`${join}\``);
  const elsewhere = edges.find((edge) => edge.to !== join);
  if (elsewhere) refuse(`\`${lane} --> ${elsewhere.to}\` leaves a lane of \`${fork}\` for somewhere other than its join \`${join}\`; every end of a lane leads to the join`);
}

/** A join is where one fork's lanes meet, only they lead into it, and it leads somewhere. */
function joinFits(reading: Reading, join: string, forks: Record<string, Fork>, refuse: Refuse): void {
  const met = Object.values(forks).filter((fork) => fork.join === join);
  if (met.length !== 1) refuse(`the join \`${join}\` is ${met.length === 0 ? "reached by no fork's lanes" : "where two forks meet"}; a join is where one fork's lanes meet again`);
  const strays = into(reading, join).filter((edge) => !met[0]!.lanes.includes(edge.from));
  if (strays.length > 0) refuse(`\`${strays[0]!.from} --> ${join}\` reaches the join from outside its fork; only the lanes lead into a join`);
  if (out(reading, join).length === 0) refuse(`the join \`${join}\` leads nowhere; draw where the work goes once its lanes have met`);
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
  // A record waits in the fork while its lanes run, and moves to the join
  // once they have met: the lines between are the lanes'.
  if (diagram.forks[from]?.join === to) return true;
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
