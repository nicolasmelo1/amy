import { CommandRunner } from "@amykit/core";
import type { UsageReader, UsageResult } from "@amykit/agent-kit";

/** Providers whose account windows Hermes documents under `hermes usage`. */
export const HERMES_USAGE_PROVIDERS = ["openai-codex", "anthropic", "openrouter"] as const;
export type HermesUsageProvider = (typeof HERMES_USAGE_PROVIDERS)[number] | "ollama-cloud";

interface HermesUsageDocument {
  readonly windows?: unknown;
}

/**
 * A client that answers with Ollama Cloud's usage document, either the
 * balance response or the legacy fractions. Injected only by tests; a mounted
 * reader asks the balance endpoint with `OLLAMA_API_KEY` through the
 * command runner, the key on stdin rather than argv.
 */
export interface OllamaCloudUsageClient {
  readUsage(): Promise<unknown>;
}

export interface HermesUsageReaderOptions {
  readonly profile: string;
  readonly provider: HermesUsageProvider | string;
  readonly timeoutMs?: number;
  /** Test seam for a custom Cloud client; production uses Ollama's API key. */
  readonly ollamaCloud?: OllamaCloudUsageClient;
  readonly ollamaToken?: () => string | undefined;
}

/** Reads the account window for the Hermes provider the harness is configured for. */
export class HermesUsageReader implements UsageReader {
  readonly label: string;

  constructor(
    private readonly runner: CommandRunner,
    private readonly options: HermesUsageReaderOptions,
  ) {
    this.label = `Hermes (${options.provider})`;
  }

  async read(): Promise<UsageResult> {
    if (this.options.provider === "ollama-cloud") return await this.readOllamaCloud();

    if (!isHermesUsageProvider(this.options.provider)) {
      return unavailable(`Hermes does not provide usage windows for ${this.options.provider}`);
    }

    let result;
    try {
      result = await this.runner.run(
        "hermes",
        ["-p", this.options.profile, "usage", "--provider", this.options.provider, "--json"],
        { timeoutMs: this.options.timeoutMs },
      );
    } catch {
      return unavailable("Hermes usage is unavailable");
    }

    if (!result.ok) return unavailable("Hermes usage is unavailable");
    return parseHermesUsage(result.stdout);
  }

  /** Reads the documented balance endpoint with the operator's API key. */
  private async readOllamaCloud(): Promise<UsageResult> {
    if (this.options.ollamaCloud) {
      try {
        return parseOllamaCloudUsage(await this.options.ollamaCloud.readUsage());
      } catch {
        return unavailable("Ollama Cloud usage is unavailable");
      }
    }

    const token = this.options.ollamaToken?.() ?? process.env.OLLAMA_API_KEY;
    if (!token) return unavailable("Ollama Cloud usage is unavailable: no API key is configured");

    try {
      const result = await this.runner.run(
        "curl",
        ["--fail", "--silent", "--show-error", "--config", "-", "https://ollama.com/api/balance"],
        {
          // Keep the bearer token off argv and process listings.
          stdin: `header = "Authorization: Bearer ${token}"\n`,
          timeoutMs: this.options.timeoutMs,
        },
      );
      return result.ok ? parseOllamaCloudUsage(result.stdout) : unavailable("Ollama Cloud usage is unavailable");
    } catch {
      return unavailable("Ollama Cloud usage is unavailable");
    }
  }
}

/** Maps Hermes's documented snake_case report to the host's usage contract. */
export function parseHermesUsage(json: string): UsageResult {
  let document: HermesUsageDocument;
  try {
    document = JSON.parse(json) as HermesUsageDocument;
  } catch {
    return unavailable("Hermes usage returned invalid JSON");
  }

  if (!Array.isArray(document.windows)) return unavailable("Hermes usage returned no windows");
  const windows = document.windows.flatMap((value) => officialWindow(value));
  return windows.length > 0 ? { windows } : unavailable("Hermes usage returned no measured windows");
}

/**
 * Maps Ollama Cloud's legacy fractions and current balance response. Both are
 * provider-owned account measurements, so neither borrows Amy's ledger.
 */
export function parseOllamaCloudUsage(value: unknown): UsageResult {
  const document = typeof value === "string" ? parseDocument(value) : value;
  const included = objectAt(document, "included");
  const balance = included ? balanceWindows(included) : [];
  if (balance.length > 0) return { windows: balance };
  // No balance and allowance to measure against: whatever is left is the legacy fractions, wherever they sit.
  const windows = included ? legacyWindows({ limits: included }) : legacyWindows(document);
  return windows.length > 0 ? { windows, unofficial: true } : unavailable("Ollama Cloud usage returned no measured windows");
}

function parseDocument(value: string): unknown {
  try {
    return JSON.parse(value) as unknown;
  } catch {
    return undefined;
  }
}

/** Current API: one included-credit allowance with the provider's real period. */
function balanceWindows(included: Record<string, unknown>): { label: string; usedPercent: number; startsAt?: string; resetsAt?: string }[] {
  const balance = number(included.balance_usd);
  const allowance = number(included.allowance_usd);
  if (balance === undefined || allowance === undefined || allowance <= 0) return [];
  const period = objectAt(included, "period");
  const startsAt = iso(period?.from);
  const resetsAt = iso(period?.until);
  return [{
    label: "Included credits",
    usedPercent: percentOf(balance, allowance),
    ...(startsAt ? { startsAt } : {}),
    ...(resetsAt ? { resetsAt } : {}),
  }];
}

/** Legacy API responses use 0..1 fractions under session and weekly limits. */
function legacyWindows(value: unknown): { label: string; usedPercent: number }[] {
  const limits = objectAt(value, "limits");
  if (!limits) return [];
  return [
    unofficialWindow("Session", limits.session),
    unofficialWindow("Weekly", limits.weekly),
    unofficialWindow("Monthly", limits.monthly),
  ].flatMap((window) => (window ? [window] : []));
}

function officialWindow(value: unknown): { label: string; usedPercent: number; startsAt?: string; resetsAt?: string }[] {
  if (!isObject(value) || typeof value.label !== "string") return [];
  const usedPercent = value.used_percent;
  if (!percent(usedPercent)) return [];
  const startsAt = iso(value.starts_at);
  const resetsAt = iso(value.resets_at);
  return [{ label: value.label, usedPercent, ...(startsAt ? { startsAt } : {}), ...(resetsAt ? { resetsAt } : {}) }];
}

function unofficialWindow(label: string, value: unknown): { label: string; usedPercent: number } | undefined {
  const window = object(value);
  const fraction = window?.usage;
  if (typeof fraction !== "number" || !Number.isFinite(fraction)) return undefined;
  return { label, usedPercent: clamp(fraction * 100, 0, 100) };
}

function unavailable(reason: string): UsageResult {
  return { unavailable: reason };
}

function isHermesUsageProvider(provider: string): provider is (typeof HERMES_USAGE_PROVIDERS)[number] {
  return (HERMES_USAGE_PROVIDERS as readonly string[]).includes(provider);
}

function objectAt(value: unknown, key: string): Record<string, unknown> | undefined {
  const root = object(value);
  return object(root?.[key]);
}

function object(value: unknown): Record<string, unknown> | undefined {
  return isObject(value) ? value : undefined;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function percent(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= 100;
}

function iso(value: unknown): string | undefined {
  return typeof value === "string" && !Number.isNaN(Date.parse(value)) ? value : undefined;
}

function number(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function percentOf(balance: number, allowance: number): number {
  return Math.round(clamp((1 - balance / allowance) * 100, 0, 100) * 1_000_000) / 1_000_000;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}
