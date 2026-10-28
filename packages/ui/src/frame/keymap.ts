import type { Frame, Mode } from "./frame.js";

/**
 * Keys in Neovim's own notation (`:help key-notation`): a printable key is
 * itself, a special one is named between angle brackets — `<CR>`, `<Esc>`,
 * `<Space>`, `<C-k>` — and `<leader>` is whatever the leader is.
 */
const SPECIAL: Readonly<Record<string, string>> = {
  cr: "CR",
  return: "CR",
  enter: "CR",
  esc: "Esc",
  space: "Space",
  tab: "Tab",
  bs: "BS",
  del: "Del",
  up: "Up",
  down: "Down",
  left: "Left",
  right: "Right",
  home: "Home",
  end: "End",
  pageup: "PageUp",
  pagedown: "PageDown",
  bar: "Bar",
  bslash: "Bslash",
};

/** Printable characters that are named keys: a literal space is the same key as `<Space>`. */
const LITERAL: Readonly<Record<string, string>> = { " ": "<Space>", "\t": "<Tab>" };

/** Modifiers in the order a canonical key spells them. `D` is the command key. */
const MODIFIERS = ["C", "M", "S", "D"] as const;
const ALIASES: Readonly<Record<string, (typeof MODIFIERS)[number]>> = { c: "C", m: "M", a: "M", s: "S", d: "D" };

function refuse(at: string, said: string): never {
  throw new TypeError(`${at}: ${said}`);
}

/** The base of a bracketed key, `k` of `<C-k>` or `CR` of `<C-CR>`. */
function base(name: string, at: string): string {
  if (name.length === 1) return name;
  const special = SPECIAL[name.toLowerCase()];
  return special ?? refuse(at, `<${name}> is not a key Neovim names`);
}

function bracketed(inside: string, at: string): string {
  if (inside.toLowerCase() === "lt") return "<";
  const parts = inside.split("-");
  // `<C-->` is control and minus: the last part is the key, even when empty.
  const key = parts.length > 1 && parts.at(-1) === "" ? "-" : (parts.pop() ?? "");
  if (key === "-") parts.splice(-2, 2);
  const modifiers = new Set(parts.map((each) => ALIASES[each.toLowerCase()] ?? refuse(at, `${each}- is not a modifier`)));
  let name = base(key, at);
  // Neovim reads <C-K> as <C-k>: under Control a letter has no case. <M-a> and <M-A> stay two keys.
  if (modifiers.has("C") && name.length === 1) name = name.toLowerCase();
  if (modifiers.size === 0) return name.length === 1 ? name : `<${name}>`;
  return `<${MODIFIERS.filter((each) => modifiers.has(each)).map((each) => `${each}-`).join("")}${name}>`;
}

/**
 * A key sequence as its keys, each one canonical, so `<cr>` and `<CR>` are
 * one key and `<leader>p` is the leader and then `p`.
 */
export function parseKeys(notation: string, leader = "<Space>"): readonly string[] {
  const keys: string[] = [];
  let i = 0;
  while (i < notation.length) {
    const close = notation[i] === "<" ? notation.indexOf(">", i + 2) : -1;
    if (close === -1) {
      keys.push(LITERAL[notation.charAt(i)] ?? notation.charAt(i));
      i += 1;
      continue;
    }
    const inside = notation.slice(i + 1, close);
    if (inside.toLowerCase() === "leader") keys.push(...parseKeys(leader, leader === "<leader>" ? "<Space>" : leader));
    else keys.push(bracketed(inside, notation));
    i = close + 1;
  }
  if (keys.length === 0) refuse(JSON.stringify(notation), "is no key at all");
  return keys;
}

/** What a person's `ui.keys` in `config.yaml` may say: a key per mode, and the leader. */
export interface KeyOverrides {
  readonly normal?: Readonly<Record<string, string>>;
  readonly insert?: Readonly<Record<string, string>>;
  readonly leader?: string;
}

interface Binding {
  readonly notation: string;
  readonly keys: readonly string[];
  readonly action: string;
}

export interface Keymap {
  readonly leader: string;
  /** Per mode, a person's bindings first, then the frame's. */
  readonly bindings: Readonly<Record<Mode, readonly Binding[]>>;
}

const MODES: readonly Mode[] = ["normal", "insert"];

const same = (a: readonly string[], b: readonly string[]): boolean => a.length === b.length && a.every((key, i) => key === b[i]);
const startsWith = (long: readonly string[], short: readonly string[]): boolean => short.every((key, i) => key === long[i]);

function bindingsOf(map: Readonly<Record<string, unknown>>, leader: string, actions: readonly string[], at: string): Binding[] {
  return Object.entries(map).map(([notation, action]) => {
    if (typeof action !== "string" || !actions.includes(action)) {
      refuse(`${at}.${notation}`, `${JSON.stringify(action)} is not an action the frame declares`);
    }
    return { notation, keys: parseKeys(notation, leader), action };
  });
}

/** Two bindings where one is the other, or begins it, cannot both be meant; nor can a count's digit begin one. */
function checkUnambiguous(mode: Mode, bindings: readonly Binding[]): void {
  for (const [i, one] of bindings.entries()) {
    if (mode === "normal" && /^[1-9]$/.test(one.keys[0] ?? "")) {
      refuse(`ui.keys.${mode}.${one.notation}`, "begins with a digit, which is a count");
    }
    for (const other of bindings.slice(i + 1)) {
      const clash = same(one.keys, other.keys)
        ? "is the same keys as"
        : startsWith(other.keys, one.keys) || startsWith(one.keys, other.keys)
          ? "begins, or is begun by,"
          : undefined;
      if (clash !== undefined) refuse(`ui.keys.${mode}.${one.notation}`, `${clash} ${other.notation}, so neither can be pressed for sure`);
    }
  }
}

/**
 * The frame's keymap with a person's remaps over it, checked the way boot
 * checks it: a remap to an action the frame does not declare, or two
 * bindings a keypress cannot tell apart, is refused, naming the key.
 *
 * A remapped key replaces the frame's binding of that same key; the frame's
 * other bindings stay, so `<C-n>` for `nav.next` leaves `j` working too.
 */
export function buildKeymap(frame: Frame, overrides: KeyOverrides = {}): Keymap {
  const leader = overrides.leader ?? frame.keys.leader;
  parseKeys(leader);
  const bindings = Object.fromEntries(
    MODES.map((mode) => {
      const mine = bindingsOf(overrides[mode] ?? {}, leader, frame.actions, `ui.keys.${mode}`);
      const theirs = bindingsOf(frame.keys[mode], leader, frame.actions, `keys.${mode}`).filter(
        (binding) => !mine.some((remap) => same(remap.keys, binding.keys)),
      );
      const all = [...mine, ...theirs];
      checkUnambiguous(mode, all);
      return [mode, all];
    }),
  ) as Record<Mode, Binding[]>;
  return { leader, bindings };
}

/** The keys that perform an action in a mode: a person's binding before the frame's. */
export function keysFor(keymap: Keymap, mode: Mode, action: string): readonly string[] | undefined {
  return keymap.bindings[mode].find((binding) => binding.action === action)?.keys;
}

/** What one key did: completed a binding, began one, or nothing. */
export type KeyResult =
  | { readonly kind: "action"; readonly action: string; readonly count: number }
  | { readonly kind: "pending" }
  | { readonly kind: "none" };

/**
 * Keys in, actions out, the way Neovim reads them: a sequence completes a
 * binding, a count before it in normal mode (`5j`) repeats it, and a key that
 * neither completes nor begins a binding clears what was pending.
 */
export class KeyReader {
  private pending: string[] = [];
  private count = "";

  constructor(private readonly keymap: Keymap) {}

  press(mode: Mode, key: string): KeyResult {
    if (mode === "normal" && this.pending.length === 0 && /^[0-9]$/.test(key) && (key !== "0" || this.count !== "")) {
      this.count += key;
      return { kind: "pending" };
    }
    const keys = [...this.pending, key];
    const bindings = this.keymap.bindings[mode];
    const done = bindings.find((binding) => same(binding.keys, keys));
    if (done !== undefined) {
      const count = this.count === "" ? 1 : Number(this.count);
      this.reset();
      return { kind: "action", action: done.action, count };
    }
    if (bindings.some((binding) => startsWith(binding.keys, keys))) {
      this.pending = keys;
      return { kind: "pending" };
    }
    this.reset();
    return { kind: "none" };
  }

  private reset(): void {
    this.pending = [];
    this.count = "";
  }
}
