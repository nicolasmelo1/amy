import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { configSchema, plugin, resolveToken, SlackApi } from "../src/index.js";

/** What the slack plugin mounts, and what it refuses to mount with. */
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

const SLICE = { channel: "C0WORK", operator: "U0ADA", token: "env:AMY_TEST_SLACK_TOKEN" };

afterEach(() => {
  delete process.env.AMY_TEST_SLACK_TOKEN;
});

describe("the slack plugin", () => {
  it("mounts the conversation port, which is the one thing it owns", () => {
    process.env.AMY_TEST_SLACK_TOKEN = "xoxb-test";

    expect([...mount(SLICE).keys()]).toEqual(["conversation"]);
  });

  it("refuses a token written inline in the config", () => {
    // Anything that is not a reference is the token itself, pasted in.
    expect(() => mount({ ...SLICE, token: "pasted-straight-into-the-config" })).toThrow(/never written into the config itself/);
  });

  it("refuses a token reference whose variable is not set, naming it", () => {
    expect(() => mount(SLICE)).toThrow(/AMY_TEST_SLACK_TOKEN, which is not set/);
  });

  it("refuses a channel name where an id belongs", () => {
    process.env.AMY_TEST_SLACK_TOKEN = "xoxb-test";

    expect(() => mount({ ...SLICE, channel: "#amy-work" })).toThrow(/must be a channel id/);
  });

  it("refuses an operator that is not a user id", () => {
    process.env.AMY_TEST_SLACK_TOKEN = "xoxb-test";

    expect(() => mount({ ...SLICE, operator: "ada" })).toThrow(/must be a user id/);
  });
});

describe("where the token lives", () => {
  it("reads it from the environment", () => {
    expect(resolveToken("env:SLACK_BOT_TOKEN", { env: { SLACK_BOT_TOKEN: "xoxb-env" }, readFile: () => "" })).toBe("xoxb-env");
  });

  it("reads one key out of a dotenv-shaped file", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "amy-slack-secret-"));
    const file = path.join(dir, ".env");
    fs.writeFileSync(file, "# amy\nLINEAR_API_KEY=lin_api_x\nexport SLACK_BOT_TOKEN=\"xoxb-file\"\n");
    try {
      expect(resolveToken(`file:${file}#SLACK_BOT_TOKEN`)).toBe("xoxb-file");
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it("names the key a file does not have", () => {
    expect(() => resolveToken("file:/x/.env#SLACK_BOT_TOKEN", { env: {}, readFile: () => "OTHER=1\n" })).toThrow(
      "/x/.env has no SLACK_BOT_TOKEN",
    );
  });

  it("refuses a file reference that names no key", () => {
    expect(() => resolveToken("file:/x/.env", { env: {}, readFile: () => "" })).toThrow(/file:<path>#<KEY>/);
  });
});

describe("the rate limit and retention settings", () => {
  it("default to what the plan names: five retries, a minute's wait, thirty days", () => {
    expect(configSchema.maxRateLimitRetries!.default).toBe(5);
    expect(configSchema.defaultRetryAfterSeconds!.default).toBe(60);
    expect(configSchema.retentionDays!.default).toBe(30);
  });

  it("refuses a negative one, naming it", () => {
    process.env.AMY_TEST_SLACK_TOKEN = "xoxb-test";

    expect(() => mount({ ...SLICE, maxRateLimitRetries: -1 })).toThrow(/`maxRateLimitRetries` must be zero or more/);
    expect(() => mount({ ...SLICE, retentionDays: -3 })).toThrow(/`retentionDays` must be zero or more/);
  });

  it("waits the configured time when a 429 names none, and gives up after the configured retries", async () => {
    const sleeps: number[] = [];
    const limited = async () => ({ status: 429, headers: {}, body: new Uint8Array() });
    const api = new SlackApi("xoxb-test", {
      transport: limited,
      sleep: async (ms) => void sleeps.push(ms),
      maxRateLimitRetries: 2,
      defaultRetryAfterSeconds: 7,
    });

    await expect(api.call("chat.postMessage")).rejects.toThrow(/after 3 tries/);
    expect(sleeps).toEqual([7_000, 7_000]);
  });

  it("fails on the first 429 when told not to retry at all", async () => {
    const sleeps: number[] = [];
    const api = new SlackApi("xoxb-test", {
      transport: async () => ({ status: 429, headers: { "retry-after": "1" }, body: new Uint8Array() }),
      sleep: async (ms) => void sleeps.push(ms),
      maxRateLimitRetries: 0,
    });

    await expect(api.call("chat.postMessage")).rejects.toThrow(/after 1 tries/);
    expect(sleeps).toEqual([]);
  });
});
