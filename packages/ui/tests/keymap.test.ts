import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import YAML from "yaml";
import { buildKeymap, checkFrame, KeyReader, keysFor, parseKeys, type KeyOverrides } from "@amykit/ui/frame";

const ui = path.resolve(import.meta.dirname, "..");
const frame = checkFrame(YAML.parse(fs.readFileSync(path.join(ui, "frame.yaml"), "utf-8")));
const conformance = YAML.parse(fs.readFileSync(path.join(ui, "conformance/config.yaml"), "utf-8")) as { ui: { keys: KeyOverrides } };

function press(overrides: KeyOverrides, mode: "normal" | "insert", notation: string) {
  const reader = new KeyReader(buildKeymap(frame, overrides));
  return parseKeys(notation, overrides.leader ?? frame.keys.leader).map((key) => reader.press(mode, key));
}

describe("keys are read in Neovim's notation", () => {
  it.each([
    ["<CR>", ["<CR>"]],
    ["<cr>", ["<CR>"]],
    ["<Enter>", ["<CR>"]],
    ["<C-k>", ["<C-k>"]],
    ["<c-K>", ["<C-k>"]],
    ["<S-C-Tab>", ["<C-S-Tab>"]],
    ["gT", ["g", "T"]],
    ["]s", ["]", "s"]],
    ["<leader>p", ["<Space>", "p"]],
    ["<lt>", ["<"]],
    ["<M-a>", ["<M-a>"]],
    ["<M-A>", ["<M-A>"]],
    ["<C-M-A>", ["<C-M-a>"]],
    [" ", ["<Space>"]],
    ["<Bar>", ["|"]],
    ["<Bslash>", ["\\"]],
    ["<S-g>", ["G"]],
    ["<S-G>", ["G"]],
    ["<C-S-g>", ["<C-S-g>"]],
    ["\t", ["<Tab>"]],
  ])("%s is %j", (notation, keys) => {
    expect(parseKeys(notation)).toEqual(keys);
  });

  it("expands <leader> to whatever the leader is", () => {
    expect(parseKeys("<leader>m", ",")).toEqual([",", "m"]);
  });

  it("refuses a key Neovim does not name", () => {
    expect(() => parseKeys("<Hyper>")).toThrow("<Hyper> is not a key Neovim names");
    expect(() => parseKeys("<X-k>")).toThrow("X- is not a modifier");
  });
});

describe("the frame's keymap", () => {
  it("is unambiguous on its own", () => {
    expect(() => buildKeymap(frame)).not.toThrow();
  });

  it("reads a sequence, a count and the leader the way Neovim does", () => {
    expect(press({}, "normal", "5j").at(-1)).toEqual({ kind: "action", action: "nav.next", count: 5 });
    expect(press({}, "normal", "gg")).toEqual([{ kind: "pending" }, { kind: "action", action: "nav.first", count: 1 }]);
    expect(press({}, "normal", "<leader>p").at(-1)).toEqual({ kind: "action", action: "panel.toggle", count: 1 });
    expect(press({}, "normal", "gx").at(-1)).toEqual({ kind: "none" });
  });

  it("drops a sequence begun in one mode when the next key comes in another", () => {
    // `g` then `x` is a binding in insert mode only: a `g` pressed in normal mode does not begin it.
    const reader = new KeyReader(buildKeymap(frame, { insert: { gx: "mode.normal" } }));

    expect(reader.press("normal", "g")).toEqual({ kind: "pending" });
    expect(reader.press("insert", "x")).toEqual({ kind: "none" });
  });

  it("posts to the discussion on enter in a composer, and never decides", () => {
    expect(press({}, "insert", "<CR>")).toEqual([{ kind: "action", action: "thread.post-discussion", count: 1 }]);
    expect(keysFor(buildKeymap(frame), "insert", "thread.decide")).toBeUndefined();
  });

  it("takes a remap over the frame's binding, and keeps the frame's other keys", () => {
    const keymap = buildKeymap(frame, { normal: { "<C-n>": "nav.next", j: "nav.prev" } });

    expect(keysFor(keymap, "normal", "nav.next")).toEqual(["<C-n>"]);
    expect(press({ normal: { j: "nav.prev" } }, "normal", "j")).toEqual([{ kind: "action", action: "nav.prev", count: 1 }]);
    expect(press({ normal: { "<C-n>": "nav.next" } }, "normal", "k")).toEqual([{ kind: "action", action: "nav.prev", count: 1 }]);
  });

  it("accepts the conformance config's remapped keymap", () => {
    expect(() => buildKeymap(frame, conformance.ui.keys)).not.toThrow();
  });
});

describe("a remap is refused at boot, by name", () => {
  it("when it binds an action the frame does not declare", () => {
    expect(() => buildKeymap(frame, { normal: { "<C-n>": "nav.nextt" } })).toThrow(
      'ui.keys.normal.<C-n>: "nav.nextt" is not an action the frame declares',
    );
  });

  it("when it binds a key to something that is not an action at all", () => {
    expect(() => buildKeymap(frame, { insert: { "<C-s>": 3 as unknown as string } })).toThrow("ui.keys.insert.<C-s>: 3 is not an action the frame declares");
  });

  it("when one binding begins another, so neither can be pressed for sure", () => {
    expect(() => buildKeymap(frame, { normal: { g: "nav.first" } })).toThrow(/ui\.keys\.normal\.g: begins, or is begun by, (gg|gt|gT)/);
  });

  it("when two spellings are the same keys bound to two actions", () => {
    expect(() => buildKeymap(frame, { normal: { "<C-x>": "nav.next", "<c-X>": "nav.prev" } })).toThrow(
      "ui.keys.normal.<C-x>: is the same keys as <c-X>",
    );
  });

  it("when a remapped leader makes a binding collide with another", () => {
    expect(() => buildKeymap(frame, { leader: "<Esc>" })).toThrow(/keys\.normal\.<leader>m: begins, or is begun by, <Esc>|keys\.normal\.<Esc>: begins, or is begun by, <leader>m/);
  });

  it("when a literal space begins a binding the leader also begins", () => {
    expect(() => buildKeymap(frame, { normal: { " ": "nav.next" } })).toThrow(/begins, or is begun by, <leader>/);
  });

  it("when two spellings of one printable key are bound to two actions", () => {
    expect(() => buildKeymap(frame, { normal: { "|": "nav.next", "<Bar>": "nav.prev" } })).toThrow("ui.keys.normal.|: is the same keys as <Bar>");
  });

  it("not when <S-g> remaps G, which replaces the frame's binding of it", () => {
    const keymap = buildKeymap(frame, { normal: { "<S-g>": "nav.first" } });
    expect(keysFor(keymap, "normal", "nav.last")).toBeUndefined();
    expect(press({ normal: { "<S-g>": "nav.first" } }, "normal", "G")).toEqual([{ kind: "action", action: "nav.first", count: 1 }]);
  });

  it("not when two Alt keys differ only in case, which Neovim reads as two keys", () => {
    expect(() => buildKeymap(frame, { normal: { "<M-a>": "nav.next", "<M-A>": "nav.prev" } })).not.toThrow();
  });

  it("when a binding begins with a digit, which is a count", () => {
    expect(() => buildKeymap(frame, { normal: { "5": "nav.last" } })).toThrow("ui.keys.normal.5: begins with a digit, which is a count");
  });
});
