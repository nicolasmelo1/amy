import { afterEach, describe, expect, it, vi } from "vitest";
import { USAGE_COLLECTION } from "@amykit/agent-kit";
import { HostServices, mount } from "@amykit/core";
import { ScriptedRunner } from "@amykit/test-fixtures";
import { plugin } from "../src/plugin.js";
import { ClaudeUsageReader, parseClaudeUsage } from "../src/usage.js";

const ACCOUNT = JSON.stringify({
  five_hour: { utilization: 42, resets_at: "2026-11-07T15:00:00.000Z" },
  seven_day: { utilization: 18, resets_at: "2026-11-12T12:00:00.000Z" },
});

describe("Claude account usage", () => {
  it("contributes one reader without starting an agent turn", async () => {
    const host: HostServices = { runner: new ScriptedRunner(), now: () => new Date(), paths: { state: "/state" } };
    const mounted = await mount([plugin], {}, host);

    expect(mounted.ok && [...mounted.mounted.contributions.get(USAGE_COLLECTION)!.keys()]).toEqual(["Claude"]);
  });

  it("reads the OAuth account endpoint with its credential off argv", async () => {
    const runner = new ScriptedRunner([
      { match: (command) => command === "curl", result: { stdout: ACCOUNT } },
    ]);
    const reader = new ClaudeUsageReader(runner, { token: () => "secret-token", timeoutMs: 5000 });

    await expect(reader.read()).resolves.toEqual({
      windows: [
        { label: "five-hour", usedPercent: 42, resetsAt: "2026-11-07T15:00:00.000Z" },
        { label: "seven-day", usedPercent: 18, resetsAt: "2026-11-12T12:00:00.000Z" },
      ],
    });
    expect(runner.argvFor("curl")).toEqual(["--disable", "--fail", "--silent", "--show-error", "--config", "-", "https://api.anthropic.com/api/oauth/usage"]);
    expect(runner.callsTo("curl")[0]?.options).toMatchObject({ stdin: expect.stringContaining("secret-token"), timeoutMs: 5000 });
    expect(runner.callsTo("curl")[0]?.options?.stdin).toContain('header = "anthropic-beta: oauth-2025-04-20"');
  });

  it("returns unavailable without a token or a valid account response", async () => {
    await expect(new ClaudeUsageReader(new ScriptedRunner(), { token: () => "" }).read()).resolves.toEqual({
      unavailable: "Claude usage is unavailable: no OAuth token is configured",
    });
    expect(parseClaudeUsage("not json")).toEqual({ unavailable: "Claude usage returned invalid JSON" });
    expect(parseClaudeUsage("null")).toEqual({ unavailable: "Claude usage returned invalid JSON" });
  });

  describe("finding the login", () => {
    afterEach(() => vi.unstubAllEnvs());
    const KEYCHAIN = JSON.stringify({ claudeAiOauth: { accessToken: "keychain-token", refreshToken: "r", expiresAt: 1 } });
    const keychain = (command: string, args: readonly string[]): boolean =>
      command === "security" && args.join(" ") === "find-generic-password -s Claude Code-credentials -w";

    it("reads the macOS Keychain item Claude Code writes when there is no credentials file", async () => {
      vi.stubEnv("CLAUDE_CODE_OAUTH_TOKEN", "");
      const runner = new ScriptedRunner([
        { match: keychain, result: { stdout: KEYCHAIN } },
        { match: (command) => command === "curl", result: { stdout: ACCOUNT } },
      ]);
      const reader = new ClaudeUsageReader(runner, { credentialsFile: "/nowhere/.credentials.json", platform: "darwin" });

      await expect(reader.read()).resolves.toMatchObject({ windows: [{ label: "five-hour" }, { label: "seven-day" }] });
      expect(runner.callsTo("curl")[0]?.options?.stdin).toContain("Bearer keychain-token");
    });

    it("asks no Keychain off macOS", async () => {
      vi.stubEnv("CLAUDE_CODE_OAUTH_TOKEN", "");
      const runner = new ScriptedRunner([{ match: keychain, result: { stdout: KEYCHAIN } }]);
      const reader = new ClaudeUsageReader(runner, { credentialsFile: "/nowhere/.credentials.json", platform: "linux" });

      await expect(reader.read()).resolves.toEqual({ unavailable: "Claude usage is unavailable: no OAuth token is configured" });
      expect(runner.callsTo("security")).toEqual([]);
    });
  });
});
