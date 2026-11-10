import { describe, expect, it } from "vitest";
import { HARNESS_COLLECTION } from "@amykit/agent-kit";
import { Conversation, Harness, Plugin } from "@amykit/core";
import { SpecTable } from "@amykit/model-specs";
import { recoverChatParts } from "../src/assemble.js";
import { pricedForTheCeiling } from "../src/chat-pricing.js";

const HOST = {
  runner: { run: async () => ({ ok: true, exitCode: 0, stdout: "", stderr: "" }) },
  now: () => new Date("2026-11-10T12:00:00.000Z"),
  paths: { state: "/w/.amy" },
};

const CLI: Harness = { name: "stand-in", ask: async () => ({ text: "", run: { outcome: "completed" } }) } as unknown as Harness;

function conversation(name: string, chat: boolean): Plugin {
  const port = {
    post: async () => ({ id: "1" }),
    replies: async () => [],
    ...(chat ? { chat: async () => [], say: async () => ({ id: "2" }), settle: async () => undefined } : {}),
  } as unknown as Conversation;
  return { name, register: (registry) => registry.port("conversation", port) };
}

function harness(name: string, model = "claude-sonnet-5-5", registered?: () => void): Plugin {
  return {
    name: `@amykit/plugin-${name}`,
    register: (registry) => {
      registered?.();
      registry.contribute(HARNESS_COLLECTION, name, { name, harness: name, model, cli: CLI });
    },
  };
}

function broken(name: string, registered: () => void): Plugin {
  return { name, register: () => (registered(), (() => { throw new Error(`${name} will not mount`); })()) };
}

describe("the chat's parts when the workflow does not mount", () => {
  it("keeps a thread-only adapter out of the way of one that can answer in the chat", async () => {
    const parts = await recoverChatParts([conversation("threads-only", false), harness("claude"), conversation("telegram", true)], {}, HOST);

    expect(parts.conversation?.chat).toBeDefined();
    expect([...parts.harnesses.keys()]).toEqual(["claude"]);
  });

  it("grows past twenty plugins that will not mount in a bounded number of mounts", async () => {
    let registrations = 0;
    const count = () => (registrations += 1);
    const many = Array.from({ length: 20 }, (_, index) => broken(`@amykit/plugin-broken-${index}`, count));

    const parts = await recoverChatParts([...many, conversation("telegram", true), harness("claude", undefined, count)], {}, HOST);

    expect(parts.conversation?.chat).toBeDefined();
    expect([...parts.harnesses.keys()]).toEqual(["claude"]);
    // At most n passes of n mounts, never every subset of the twenty-two.
    expect(registrations).toBeLessThan(22 * 22);
  });
});

describe("the chat's harnesses under a dollar ceiling", () => {
  const TABLE = { source: "test", models: [{ model: "claude-sonnet-5-5", input: 3, output: 15 }] } as unknown as SpecTable;

  async function parts() {
    return recoverChatParts([conversation("telegram", true), harness("claude"), harness("codex", "gpt-unpriced")], {}, HOST);
  }

  it("does not offer a harness whose turns nothing can price", async () => {
    const priced = pricedForTheCeiling(await parts(), { perWeek: { costUsd: 50 } }, TABLE);

    expect(priced.unpriced).toEqual(["codex"]);
    expect([...priced.parts.harnesses.keys()]).toEqual(["claude"]);
  });

  it("offers every harness under a ceiling in tokens", async () => {
    const priced = pricedForTheCeiling(await parts(), { perWeek: { tokens: 1_000_000 } }, TABLE);

    expect(priced.unpriced).toEqual([]);
    expect([...priced.parts.harnesses.keys()]).toEqual(["claude", "codex"]);
  });
});
