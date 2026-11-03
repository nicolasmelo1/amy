import os from "node:os";
import { afterEach, describe, expect, it } from "vitest";
import { plugin, TOKEN_VARIABLE } from "../src/index.js";

/** What the telegram plugin mounts, and what it refuses to mount with. */
function mount(slice: Record<string, unknown>) {
  const ports = new Map<string, object>();
  const registry = {
    port: (kind: string, impl: object) => void ports.set(kind, impl),
    contribute: () => {},
    action: () => {},
    workflow: () => {},
    observer: () => {},
  };
  plugin.register(registry as never, { config: slice, paths: { state: os.tmpdir() } } as never);
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
});
