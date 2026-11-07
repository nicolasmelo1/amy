import { UsageReader, UsageResult } from "@amykit/agent-kit";
import { CodexRateLimits, StdioCodexAppServer } from "./CodexHarness.js";

export interface CodexUsageSource {
  readRateLimits(): Promise<CodexRateLimits>;
}

/** Reads the account windows without starting a thread or an agent turn. */
export class CodexUsageReader implements UsageReader {
  readonly label = "Codex";
  private readonly source: CodexUsageSource;

  constructor(source: CodexUsageSource = new StdioCodexAppServer()) {
    this.source = source;
  }

  async read(): Promise<UsageResult> {
    try {
      const limits = await this.source.readRateLimits();
      const windows = [
        normalizeWindow("primary", limits.rateLimits?.primary),
        normalizeWindow("secondary", limits.rateLimits?.secondary),
      ].filter((window): window is NonNullable<typeof window> => Boolean(window));
      return windows.length > 0
        ? { windows }
        : { unavailable: "Codex returned no account rate limits" };
    } catch (error) {
      return { unavailable: errorMessage(error) };
    }
  }
}

type RateLimitWindow = {
  usedPercent?: number | null;
  windowDurationMins?: number | null;
  resetsAt?: number | null;
};

function normalizeWindow(
  label: string,
  source: RateLimitWindow | null | undefined,
) {
  if (
    !source ||
    typeof source.usedPercent !== "number" ||
    !Number.isFinite(source.usedPercent)
  )
    return undefined;
  const resetsAt = resetOf(source);
  const startsAt = resetsAt ? startOf(source, resetsAt) : undefined;
  return {
    label: labelOf(label, source.windowDurationMins),
    usedPercent: source.usedPercent,
    ...(startsAt ? { startsAt: startsAt.toISOString() } : {}),
    ...(resetsAt ? { resetsAt: resetsAt.toISOString() } : {}),
  };
}

function labelOf(slot: string, duration: number | null | undefined): string {
  if (duration === 300) return "five-hour";
  if (duration === 10_080) return "weekly";
  return slot;
}

function resetOf(source: RateLimitWindow): Date | undefined {
  if (typeof source.resetsAt !== "number") return undefined;
  const resetsAt = new Date(source.resetsAt * 1000);
  return Number.isNaN(resetsAt.valueOf()) ? undefined : resetsAt;
}

function startOf(
  source: { windowDurationMins?: number | null },
  resetsAt: Date,
): Date | undefined {
  if (
    typeof source.windowDurationMins !== "number" ||
    !Number.isFinite(source.windowDurationMins)
  )
    return undefined;
  return new Date(resetsAt.valueOf() - source.windowDurationMins * 60_000);
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
