import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { CommandRunner } from "@amykit/core";
import type { UsageReader, UsageResult } from "@amykit/agent-kit";

interface ClaudeUsagePeriod {
  readonly utilization?: unknown;
  readonly resets_at?: unknown;
}

interface ClaudeUsageDocument {
  readonly five_hour?: ClaudeUsagePeriod;
  readonly seven_day?: ClaudeUsagePeriod;
}

export interface ClaudeUsageReaderOptions {
  readonly timeoutMs?: number;
  readonly token?: () => string | undefined;
  /** Where Claude Code keeps its login off macOS; a test points it elsewhere. */
  readonly credentialsFile?: string;
  /** The platform whose credential store is asked; macOS also has the Keychain. */
  readonly platform?: NodeJS.Platform;
}

/** The Keychain item Claude Code writes its login to on macOS. */
const KEYCHAIN_SERVICE = "Claude Code-credentials";

/** Reads Claude's account windows without asking Claude to run an agent turn. */
export class ClaudeUsageReader implements UsageReader {
  readonly label = "Claude";

  constructor(
    private readonly runner: CommandRunner,
    private readonly options: ClaudeUsageReaderOptions = {},
  ) {}

  async read(): Promise<UsageResult> {
    const token = this.options.token?.() ?? (await this.oauthToken());
    if (!token) return { unavailable: "Claude usage is unavailable: no OAuth token is configured" };

    try {
      const result = await this.runner.run(
        "curl",
        ["--fail", "--silent", "--show-error", "--config", "-", "https://api.anthropic.com/api/oauth/usage"],
        {
          // A curl config on stdin keeps the bearer token out of argv and process listings.
          // The endpoint refuses an OAuth bearer without the beta that enables it.
          stdin: `header = "Authorization: Bearer ${token}"\nheader = "anthropic-beta: oauth-2025-04-20"\n`,
          timeoutMs: this.options.timeoutMs,
        },
      );
      if (!result.ok) return { unavailable: "Claude usage is unavailable" };
      return parseClaudeUsage(result.stdout);
    } catch {
      return { unavailable: "Claude usage is unavailable" };
    }
  }

  /** The login Claude Code keeps: the environment, its credentials file, then on macOS the Keychain. */
  private async oauthToken(): Promise<string | undefined> {
    if (process.env.CLAUDE_CODE_OAUTH_TOKEN) return process.env.CLAUDE_CODE_OAUTH_TOKEN;
    const file = this.options.credentialsFile ?? path.join(os.homedir(), ".claude", ".credentials.json");
    const stored = readCredentials(() => fs.readFileSync(file, "utf8"));
    if (stored || (this.options.platform ?? process.platform) !== "darwin") return stored;
    try {
      // Read-only: prints the item's secret, the same JSON the file holds elsewhere.
      const result = await this.runner.run("security", ["find-generic-password", "-s", KEYCHAIN_SERVICE, "-w"], { timeoutMs: this.options.timeoutMs });
      return result.ok ? readCredentials(() => result.stdout) : undefined;
    } catch {
      return undefined;
    }
  }
}

/** Normalizes the account endpoint's percentage measurements. */
export function parseClaudeUsage(json: string): UsageResult {
  let document: ClaudeUsageDocument | undefined;
  try {
    const parsed = JSON.parse(json) as unknown;
    if (typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)) document = parsed as ClaudeUsageDocument;
  } catch {
    return { unavailable: "Claude usage returned invalid JSON" };
  }
  if (!document) return { unavailable: "Claude usage returned invalid JSON" };
  const windows = [
    windowOf("five-hour", document.five_hour),
    windowOf("seven-day", document.seven_day),
  ].flatMap((window) => window ? [window] : []);
  return windows.length > 0 ? { windows } : { unavailable: "Claude usage returned no measured windows" };
}

function windowOf(label: string, period: ClaudeUsagePeriod | undefined) {
  if (!period || typeof period.utilization !== "number" || !Number.isFinite(period.utilization)) return undefined;
  const resetsAt = typeof period.resets_at === "string" && !Number.isNaN(Date.parse(period.resets_at))
    ? period.resets_at
    : undefined;
  return {
    label,
    usedPercent: Math.max(0, Math.min(100, period.utilization)),
    ...(resetsAt ? { resetsAt } : {}),
  };
}

function readCredentials(read: () => string): string | undefined {
  try {
    const credentials = JSON.parse(read()) as { claudeAiOauth?: { accessToken?: unknown } };
    return typeof credentials.claudeAiOauth?.accessToken === "string" ? credentials.claudeAiOauth.accessToken : undefined;
  } catch {
    return undefined;
  }
}
