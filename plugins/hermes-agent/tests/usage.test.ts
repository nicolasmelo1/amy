import { describe, expect, it, vi } from "vitest";
import { USAGE_COLLECTION } from "@amykit/agent-kit";
import { ScriptedRunner } from "@amykit/test-fixtures";
import { HermesUsageReader, parseHermesUsage, parseOllamaCloudUsage, plugin } from "../src/index.js";

const OFFICIAL_USAGE = JSON.stringify({
  provider: "openai-codex",
  windows: [
    { label: "Session", used_percent: 37, resets_at: "2026-11-07T14:00:00.000Z" },
    { label: "Weekly", used_percent: 12.5, starts_at: "2026-11-01T00:00:00.000Z", resets_at: "2026-11-14T00:00:00.000Z" },
  ],
});

describe("Hermes account usage", () => {
  it("contributes its configured subscription reader", () => {
    const contributions: { collection: string; name: string; reader: HermesUsageReader }[] = [];
    const registry = {
      contribute: (collection: string, name: string, reader: HermesUsageReader) =>
        void contributions.push({ collection, name, reader }),
    } as never;
    const ctx = {
      config: { provider: "openrouter", profile: "amy", model: "", models: [], timeoutMs: 12_000 },
      runner: new ScriptedRunner(),
    } as never;

    plugin.register(registry, ctx);

    expect(contributions.map(({ collection, name, reader }) => ({ collection, name, label: reader.label }))).toContainEqual({
      collection: USAGE_COLLECTION,
      name: "Hermes (openrouter)",
      label: "Hermes (openrouter)",
    });
  });

  it("runs the documented profile-scoped command and normalizes its windows", async () => {
    const runner = new ScriptedRunner([
      { match: (command) => command === "hermes", result: { stdout: OFFICIAL_USAGE, exitCode: 0 } },
    ]);
    const usage = new HermesUsageReader(runner, { profile: "amy", provider: "openai-codex", timeoutMs: 12_000 });

    await expect(usage.read()).resolves.toEqual({
      windows: [
        { label: "Session", usedPercent: 37, resetsAt: "2026-11-07T14:00:00.000Z" },
        {
          label: "Weekly",
          usedPercent: 12.5,
          startsAt: "2026-11-01T00:00:00.000Z",
          resetsAt: "2026-11-14T00:00:00.000Z",
        },
      ],
    });
    expect(usage.label).toBe("Hermes (openai-codex)");
    expect(runner.argvFor("hermes")).toEqual(["-p", "amy", "usage", "--provider", "openai-codex", "--json"]);
    expect(runner.callsTo("hermes")[0]?.options?.timeoutMs).toBe(12_000);
  });

  it("returns a clean unavailable result when Hermes cannot read the account", async () => {
    const runner = new ScriptedRunner([
      { match: (command) => command === "hermes", result: { stderr: "Bearer secret-would-be-here", exitCode: 1 } },
    ]);

    await expect(new HermesUsageReader(runner, { profile: "amy", provider: "anthropic" }).read()).resolves.toEqual({
      unavailable: "Hermes usage is unavailable",
    });
  });

  it("does not invoke Hermes for a provider the documented command does not support", async () => {
    const runner = new ScriptedRunner();

    await expect(new HermesUsageReader(runner, { profile: "amy", provider: "gemini" }).read()).resolves.toEqual({
      unavailable: "Hermes does not provide usage windows for gemini",
    });
    expect(runner.calls).toEqual([]);
  });

  it("fails closed on malformed documents and measurements Hermes did not provide", () => {
    expect(parseHermesUsage("not json")).toEqual({ unavailable: "Hermes usage returned invalid JSON" });
    expect(parseHermesUsage(JSON.stringify({ windows: [{ label: "Session", used_percent: null }] }))).toEqual({
      unavailable: "Hermes usage returned no measured windows",
    });
  });
});

describe("Ollama Cloud account usage", () => {
  const OLLAMA_USAGE = {
    limits: {
      session: { usage: 0.03 },
      weekly: { usage: 0.005 },
      monthly: { usage: 1.2 },
    },
  };

  it("maps undocumented fractions as unofficial windows without inventing resets", () => {
    expect(parseOllamaCloudUsage(OLLAMA_USAGE)).toEqual({
      windows: [
        { label: "Session", usedPercent: 3 },
        { label: "Weekly", usedPercent: 0.5 },
        { label: "Monthly", usedPercent: 100 },
      ],
      unofficial: true,
    });
  });

  it("uses an injected client instead of guessing an HTTP credential transport", async () => {
    const client = { readUsage: vi.fn(async () => OLLAMA_USAGE) };
    const runner = new ScriptedRunner();

    await expect(new HermesUsageReader(runner, { profile: "amy", provider: "ollama-cloud", ollamaCloud: client }).read()).resolves.toEqual({
      windows: [
        { label: "Session", usedPercent: 3 },
        { label: "Weekly", usedPercent: 0.5 },
        { label: "Monthly", usedPercent: 100 },
      ],
      unofficial: true,
    });
    expect(client.readUsage).toHaveBeenCalledOnce();
    expect(runner.calls).toEqual([]);
  });

  it("reads the documented balance endpoint with an API key off argv", async () => {
    const runner = new ScriptedRunner([
      { match: (command) => command === "curl", result: { stdout: JSON.stringify({
        included: {
          balance_usd: 72.5,
          allowance_usd: 100,
          period: { from: "2026-09-15T09:30:00Z", until: "2026-10-15T09:30:00Z" },
        },
      }) } },
    ]);

    await expect(new HermesUsageReader(runner, {
      profile: "amy", provider: "ollama-cloud", ollamaToken: () => "cloud-secret", timeoutMs: 12_000,
    }).read()).resolves.toEqual({
      windows: [{
        label: "Included credits", usedPercent: 27.5,
        startsAt: "2026-09-15T09:30:00Z", resetsAt: "2026-10-15T09:30:00Z",
      }],
    });
    expect(runner.argvFor("curl")).toEqual(["--fail", "--silent", "--show-error", "--config", "-", "https://ollama.com/api/balance"]);
    expect(runner.callsTo("curl")[0]?.options).toMatchObject({ stdin: expect.stringContaining("cloud-secret"), timeoutMs: 12_000 });
  });

  it("does not make an Ollama request without an API key", async () => {
    const runner = new ScriptedRunner();

    await expect(new HermesUsageReader(runner, {
      profile: "amy", provider: "ollama-cloud", ollamaToken: () => "",
    }).read()).resolves.toEqual({
      unavailable: "Ollama Cloud usage is unavailable: no API key is configured",
    });
    expect(runner.calls).toEqual([]);
  });
});
