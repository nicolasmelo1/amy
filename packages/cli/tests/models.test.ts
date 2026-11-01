import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Plugin } from "@amykit/core";
import { DEFAULT_CONFIG } from "../src/config.js";
import { Contribution, gather, runNamed } from "../src/plugin-commands.js";
import { STALE_AFTER_DAYS, refreshPricesWhenStale } from "../src/prices.js";
import { profiles } from "../src/profiles.js";

/**
 * The price table is the relay's, and so is the command that refreshes it.
 * What the host owns is the *moment*: an update or a start on a machine that
 * mounted the relay, and nothing at all on one that did not.
 */
const WORKFLOW = "@acme/workflow-priced";

function config() {
  return {
    ...DEFAULT_CONFIG,
    workflows: { work: { workflow: WORKFLOW, plugins: ["@amykit/plugin-agent-relay"] } },
  };
}

function fakeRelay(): Plugin {
  return {
    name: "@amykit/plugin-agent-relay",
    register() {},
    commands: [
      {
        name: "models",
        description: "What each model is believed to cost",
        subcommands: [
          { name: "refresh", description: "Refresh the table", run: () => {} },
        ],
      },
    ],
  };
}

async function contributionsIn(home: string, plugin?: Plugin): Promise<readonly Contribution[]> {
  const known = Object.values(profiles(config(), home));
  const gathered = await gather(config(), known, async (specs) => ({
    plugins: plugin ? [plugin] : [],
    problems: [],
    bySpec: new Map(plugin ? specs.filter((spec) => spec === plugin.name).map((spec) => [spec, plugin]) : []),
  }));
  return gathered.contributions;
}

function environment() {
  const said: string[] = [];
  return {
    said,
    env: {
      home: "/amy",
      config: config(),
      profileFor: () => {
        const first = Object.values(profiles(config(), "/amy"))[0]!;
        return { ok: true as const, profile: first };
      },
      mount: async () => ({ ok: true as const, ports: new Map() }),
      out: { line: (text = "") => said.push(text), error: (text: string) => said.push(`error: ${text}`) },
    },
  };
}

describe("keeping the price table current", () => {
  let home: string;

  beforeEach(() => {
    home = fs.mkdtempSync(path.join(os.tmpdir(), "amy-prices-"));
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    fs.rmSync(home, { recursive: true, force: true });
    process.exitCode = 0;
  });

  it("asks the relay's own command, and only a table older than a week", async () => {
    const { said, env } = environment();
    await refreshPricesWhenStale(await contributionsIn(home, fakeRelay()), env);

    // Nothing was asked of the file: the command was invoked, and it is the
    // one that decides whether a week has passed.
    expect(await runNamed(await contributionsIn(home, fakeRelay()), ["models", "refresh"], [], { staleAfter: STALE_AFTER_DAYS }, env)).toBe(true);
    expect(STALE_AFTER_DAYS).toBe("7");
    expect(said).toEqual([]);
  });

  it("asks nothing of a machine that mounted no relay", async () => {
    const { said, env } = environment();
    const asked = vi.fn();
    const withoutRelay = (await contributionsIn(home)).map((contribution) => ({
      ...contribution,
      commands: contribution.commands.filter((command) => command.name !== "models"),
    }));

    await refreshPricesWhenStale(withoutRelay, { ...env, out: { line: asked, error: asked } });
    expect(asked).not.toHaveBeenCalled();
    expect(said).toEqual([]);
  });

  it("refreshes a stale table, keeps a fresh one, and writes nothing when the network fails", async () => {
    const { plugin } = await import("@amykit/plugin-agent-relay");
    const settings = { "@amykit/plugin-agent-relay": {} };
    const gathered = await gather(
      { ...config(), plugins: settings },
      Object.values(profiles({ ...config(), plugins: settings }, home)),
      async (specs) => ({ plugins: [plugin], problems: [], bySpec: new Map(specs.map((spec) => [spec, plugin])) }),
    );

    const table = path.join(home, "model-specs.json");
    const before = JSON.stringify({ source: "models.dev", models: [{ model: "claude-sonnet-5", inputPerToken: 1e-9 }] }, null, 2);
    fs.writeFileSync(table, `${before}\n`, "utf-8");
    const eightDaysAgo = new Date(Date.now() - 8 * 86_400_000);
    fs.utimesSync(table, eightDaysAgo, eightDaysAgo);

    const catalog = {
      "claude-sonnet-5": { cost: { input: 3, output: 15, cache_read: 0.3, cache_write: 3.75 } },
    };
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, json: async () => catalog })));

    const { env } = environment();
    const ran = await runNamed(gathered.contributions, ["models", "refresh"], [], { staleAfter: STALE_AFTER_DAYS }, { ...env, home });
    expect(ran).toBe(true);
    expect(fs.readFileSync(table, "utf-8")).not.toBe(`${before}\n`);

    // Newer than the window: the table is left exactly as it was, and the
    // command says why it did nothing.
    const fresh = fs.readFileSync(table, "utf-8");
    const said: string[] = [];
    await runNamed(gathered.contributions, ["models", "refresh"], [], { staleAfter: STALE_AFTER_DAYS }, { ...env, home, out: { line: (text = "") => said.push(text), error: (text) => said.push(text) } });
    expect(fs.readFileSync(table, "utf-8")).toBe(fresh);
    expect(said.join("\n")).toContain("nothing to refresh");

    // The network fails: the table is the one that was there, byte for byte.
    fs.utimesSync(table, eightDaysAgo, eightDaysAgo);
    vi.stubGlobal("fetch", vi.fn(async () => {
      throw new Error("getaddrinfo ENOTFOUND models.dev");
    }));
    const failed: string[] = [];
    await runNamed(gathered.contributions, ["models", "refresh"], [], { staleAfter: STALE_AFTER_DAYS }, { ...env, home, out: { line: (text = "") => failed.push(text), error: (text: string) => failed.push(text) } });

    expect(fs.readFileSync(table, "utf-8")).toBe(fresh);
    expect(failed.join("\n")).toContain("left as it was");
    expect(process.exitCode).toBe(1);
  });
});
