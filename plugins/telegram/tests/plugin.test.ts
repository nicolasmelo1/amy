import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { plugin, TOKEN_VARIABLE } from "../src/index.js";

/** What the telegram plugin mounts, and what it refuses to mount with. */
function mount(slice: Record<string, unknown>, readOnly = false, state = os.tmpdir()) {
  const ports = new Map<string, object>();
  const registry = {
    port: (kind: string, impl: object) => void ports.set(kind, impl),
    contribute: () => {},
    action: () => {},
    workflow: () => {},
    observer: () => {},
  };
  plugin.register(registry as never, { config: slice, paths: { state }, readOnly } as never);
  return ports;
}

afterEach(() => {
  delete process.env[TOKEN_VARIABLE];
});

describe("the telegram plugin", () => {
  it("mounts the conversation port, which is the one thing it owns", () => {
    process.env[TOKEN_VARIABLE] = "123:abc";

    expect([...mount({ operator: "4021" }).keys()]).toEqual(["conversation"]);
  });

  it("names the variable it reads the token from", () => {
    expect(plugin.environment).toEqual(["TELEGRAM_BOT_TOKEN"]);
  });

  it("refuses to mount without the token, naming where it goes", () => {
    expect(() => mount({ operator: "4021" })).toThrow(/TELEGRAM_BOT_TOKEN is not set/);
  });

  it("refuses a username where the operator's id belongs", () => {
    process.env[TOKEN_VARIABLE] = "123:abc";

    expect(() => mount({ operator: "@ada" })).toThrow(/must be your numeric Telegram user id/);
  });

  it("does not initialize Telegram state during a read-only inspection mount", () => {
    process.env[TOKEN_VARIABLE] = "123:abc";
    const state = fs.mkdtempSync(path.join(os.tmpdir(), "amy-telegram-inspection-"));
    try {
      expect([...mount({ operator: "4021" }, true, state).keys()]).toEqual(["conversation"]);
      expect(fs.existsSync(path.join(state, "telegram"))).toBe(false);
      expect(fs.existsSync(path.join(state, "telegram-bot"))).toBe(false);
    } finally {
      fs.rmSync(state, { recursive: true, force: true });
    }
  });
});
