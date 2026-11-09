import { describe, expect, it } from "vitest";
import { defineContract, invoke } from "@amykit/core";
import { browserOperations, configSchema as browserSettings } from "../src/plugin.js";
import { configSchema as desktopSettings, desktopOperations } from "../../agent-desktop/src/plugin.js";
import { configSchema as terminalSettings, terminalOperations } from "../../terminal/src/plugin.js";
import { FakeRunner, scope } from "./runner.js";

const defaults = (schema: Record<string, { default?: unknown }>) => Object.fromEntries(Object.entries(schema).map(([key, field]) => [key, field.default]));
const context = (settings: Record<string, unknown>) => ({ port: () => undefined, plugin: scope(settings) });

describe("the browser plugin drives agent-browser", () => {
  const ok = (data: unknown) => ({ stdout: JSON.stringify({ success: true, data }) });

  it("opens, snapshots, acts on refs and diffs, each one agent-browser command in the session", async () => {
    const runner = new FakeRunner([
      { when: ["snapshot"], answer: ok({ snapshot: '- button "Pay" [ref=e1]', refs: { e1: { role: "button", name: "Pay" } } }) },
      { when: ["diff", "snapshot"], answer: ok({ diff: "+ - text \"Paid\"\n1 additions, 0 removals, 40 unchanged" }) },
      { when: ["diff", "screenshot"], answer: ok({ result: "diff written to d.png: 120 pixels differ (0.4%)" }) },
    ]);
    const contract = defineContract(browserOperations(runner));
    const at = context(defaults(browserSettings));

    expect(await invoke(contract, "browser.open", { url: "https://shop.localhost" }, at)).toEqual({ kind: "output", output: { opened: "https://shop.localhost" } });
    expect(await invoke(contract, "browser.snapshot", { interactive: true }, at)).toMatchObject({ kind: "output", output: { refs: { e1: { name: "Pay" } } } });
    expect(await invoke(contract, "browser.act", { action: "click", ref: "e1" }, at)).toEqual({ kind: "output", output: { done: "click @e1" } });
    expect(await invoke(contract, "browser.act", { action: "fill", ref: "@e2", text: "--ada" }, at)).toEqual({ kind: "output", output: { done: "fill @e2" } });
    expect(await invoke(contract, "browser.diff-snapshot", { baseline: "a.tree" }, at)).toMatchObject({ kind: "output", output: { identical: false, additions: 1, removals: 0 } });
    expect(await invoke(contract, "browser.diff-screenshot", { baseline: "a.png", threshold: 0.2 }, at)).toEqual({ kind: "output", output: { sizeMismatch: false, mismatchPercent: 0.4 } });

    expect(runner.lines.map((line) => line.slice(1).join(" "))).toEqual([
      "--json --session amy open https://shop.localhost",
      "--json --session amy snapshot -i",
      "--json --session amy click @e1",
      "--json --session amy fill @e2 -- --ada",
      "--json --session amy diff snapshot --baseline a.tree",
      "--json --session amy diff screenshot --baseline a.png --threshold 0.2",
    ]);
  });

  it("answers agent-browser's own error as the declared one", async () => {
    const runner = new FakeRunner([{ when: ["click"], answer: { ok: false, exitCode: 1, stdout: JSON.stringify({ success: false, error: { code: "covered", message: "e9 is covered" } }) } }]);
    const ran = await invoke(defineContract(browserOperations(runner)), "browser.act", { action: "click", ref: "e9" }, context(defaults(browserSettings)));

    expect(ran).toMatchObject({ kind: "error", error: { code: "browser.failed", message: expect.stringContaining("e9 is covered") } });
  });
});

describe("the desktop plugin drives agent-desktop", () => {
  it("snapshots an app and acts on its qualified refs", async () => {
    const envelope = (data: unknown) => ({ stdout: `${JSON.stringify({ version: "2.6", ok: true, command: "x", data })}\n` });
    const runner = new FakeRunner([{ when: ["snapshot"], answer: envelope({ snapshot_id: "s1", app: "Calculator", tree: { role: "window" } }) }, { when: [], answer: envelope({}) }]);
    const contract = defineContract(desktopOperations(runner));
    const at = context(defaults(desktopSettings));

    expect(await invoke(contract, "desktop.snapshot", { app: "Calculator", interactive: true }, at)).toEqual({ kind: "output", output: { snapshot: "s1", app: "Calculator", tree: { role: "window" } } });
    expect(await invoke(contract, "desktop.click", { ref: "@s1:e3" }, at)).toEqual({ kind: "output", output: { done: "click @s1:e3" } });
    expect(await invoke(contract, "desktop.type", { ref: "@s1:e2", text: "2+2" }, at)).toEqual({ kind: "output", output: { done: "type @s1:e2" } });
    expect(await invoke(contract, "desktop.press", { combo: "cmd+z" }, at)).toEqual({ kind: "output", output: { done: "press cmd+z" } });
    expect(await invoke(contract, "desktop.click", { ref: "@e3" }, at)).toMatchObject({ kind: "refused" });

    expect(runner.lines.map((line) => line.slice(1).join(" "))).toEqual([
      "snapshot --app Calculator -i",
      "click @s1:e3",
      "type @s1:e2 2+2",
      "press cmd+z",
    ]);
  });

  it("answers agent-desktop's structured error as the declared one", async () => {
    const runner = new FakeRunner([{ when: [], answer: { ok: false, exitCode: 1, stdout: JSON.stringify({ ok: false, error: { code: "STALE_REF", message: "the snapshot moved", suggestion: "snapshot again" } }) } }]);
    const ran = await invoke(defineContract(desktopOperations(runner)), "desktop.click", { ref: "@s1:e3" }, context(defaults(desktopSettings)));

    expect(ran).toMatchObject({ kind: "error", error: { code: "desktop.failed", message: expect.stringContaining("STALE_REF: the snapshot moved (snapshot again)") } });
  });
});

describe("the terminal plugin drives terminal-use", () => {
  it("runs a program, sends keys, waits for text and reads the screen", async () => {
    const runner = new FakeRunner([
      { when: ["run"], answer: { stdout: JSON.stringify({ type: "session_created", name: "amy", pid: 4242 }) } },
      { when: ["screenshot"], answer: { stdout: JSON.stringify({ type: "screenshot", format: "text", content: "~\n-- INSERT --", rows: 24, cols: 80 }) } },
      { when: ["--text=never"], answer: { ok: false, exitCode: 1, stderr: "Error: Wait timed out" } },
    ]);
    const contract = defineContract(terminalOperations(runner));
    const at = context(defaults(terminalSettings));

    expect(await invoke(contract, "terminal.run", { command: "vim", args: ["notes.md"] }, at)).toEqual({ kind: "output", output: { pid: 4242 } });
    expect(await invoke(contract, "terminal.press", { keys: ["i"] }, at)).toEqual({ kind: "output", output: { done: true } });
    expect(await invoke(contract, "terminal.type", { text: "hello" }, at)).toEqual({ kind: "output", output: { done: true } });
    expect(await invoke(contract, "terminal.type", { text: "--help" }, at)).toEqual({ kind: "output", output: { done: true } });
    expect(await invoke(contract, "terminal.wait", { text: "-+" }, at)).toEqual({ kind: "output", output: { matched: true } });
    expect(await invoke(contract, "terminal.wait", { text: "INSERT" }, at)).toEqual({ kind: "output", output: { matched: true } });
    expect(await invoke(contract, "terminal.wait", { text: "never", timeoutMs: 100 }, at)).toEqual({ kind: "output", output: { matched: false } });
    expect(await invoke(contract, "terminal.screen", {}, at)).toEqual({ kind: "output", output: { content: "~\n-- INSERT --", rows: 24, cols: 80 } });
    expect(await invoke(contract, "terminal.kill", {}, at)).toEqual({ kind: "output", output: { done: true } });
    expect(await invoke(contract, "terminal.wait", {}, at)).toMatchObject({ kind: "error", error: { code: "terminal.wait" } });

    expect(runner.lines.map((line) => line.slice(1).join(" "))).toEqual([
      "--json run --name amy vim notes.md",
      "--json press --name amy -- i",
      "--json type --name amy -- hello",
      "--json type --name amy -- --help",
      "--json wait --name amy --text=-+ --timeout=5000",
      "--json wait --name amy --text=INSERT --timeout=5000",
      "--json wait --name amy --text=never --timeout=100",
      "--json screenshot --name amy",
      "--json kill --name amy",
    ]);
  });
});
