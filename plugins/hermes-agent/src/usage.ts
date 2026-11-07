import { CommandRunner } from "@amykit/core";
import type { UsageReader, UsageResult } from "@amykit/agent-kit";

/** Providers whose account windows Hermes documents under `hermes usage`. */
export const HERMES_USAGE_PROVIDERS = ["openai-codex", "anthropic", "openrouter"] as const;
export type HermesUsageProvider = (typeof HERMES_USAGE_PROVIDERS)[number] | "ollama-cloud";

interface HermesUsageDocument {
  readonly windows?: unknown;
}

/**
 * The undocumented Ollama Cloud response uses fractions, not percentages.
 * This client is deliberately injected: this plugin has a command port but no
 * HTTP credential transport, and must not guess at an API key or shell it out.
 */
export interface OllamaCloudUsageClient {
  readUsage(): Promise<unknown>;
}

export interface HermesUsageReaderOptions {
  readonly profile: string;
  readonly provider: HermesUsageProvider | string;
  readonly timeoutMs?: number;
  readonly ollamaCloud?: OllamaCloudUsageClient;
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
    if (this.options.provider === "ollama-cloud") {
      if (!this.options.ollamaCloud) return unavailable("Ollama Cloud usage is unavailable: no usage client is configured");
      try {
        return parseOllamaCloudUsage(await this.options.ollamaCloud.readUsage());
      } catch {
        return unavailable("Ollama Cloud usage is unavailable");
      }
    }

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
 * Maps Ollama's undocumented 0..1 account fractions. It deliberately supplies
 * no reset: that response does not publish one, so inventing its plan period
 * would make an unofficial result look more precise than it is.
 */
export function parseOllamaCloudUsage(value: unknown): UsageResult {
  const limits = objectAt(value, "limits");
  if (!limits) return unavailable("Ollama Cloud usage returned no limits");

  const windows = [
    unofficialWindow("Session", limits.session),
    unofficialWindow("Weekly", limits.weekly),
    unofficialWindow("Monthly", limits.monthly),
  ].flatMap((window) => (window ? [window] : []));

  return windows.length > 0 ? { windows, unofficial: true } : unavailable("Ollama Cloud usage returned no measured windows");
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

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}
