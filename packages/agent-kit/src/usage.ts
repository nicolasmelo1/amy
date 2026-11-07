import { Registry } from "@amykit/core";

/** One provider-reported period of subscription usage. */
export interface UsageWindow {
  readonly label: string;
  readonly usedPercent: number;
  readonly startsAt?: string;
  readonly resetsAt?: string;
}

/** A usage answer the provider documents or otherwise offers. */
export interface UsageAvailable {
  readonly windows: readonly UsageWindow[];
  readonly unofficial?: boolean;
}

/** A provider whose usage answer could not be read at this moment. */
export interface UsageUnavailable {
  readonly unavailable: string;
}

export type UsageResult = UsageAvailable | UsageUnavailable;

/** A harness's on-demand view of one subscription's usage. */
export interface UsageReader {
  readonly label: string;
  read(): Promise<UsageResult>;
}

/** The collection harness plugins add usage readers to. */
export const USAGE_COLLECTION = "usage";

/** Adds one harness usage reader for a host to read on demand. */
export function contributeUsage(registry: Registry, reader: UsageReader): void {
  registry.contribute(USAGE_COLLECTION, reader.label, reader);
}
