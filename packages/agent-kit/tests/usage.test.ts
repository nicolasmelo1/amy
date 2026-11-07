import { describe, expect, it, vi } from "vitest";
import { Registry } from "@amykit/core";
import { contributeUsage, UsageReader, USAGE_COLLECTION } from "../src/index.js";

function reader(label: string): UsageReader {
  return { label, read: vi.fn() };
}

/** Only the collection contribution this helper owns. */
function recordingRegistry() {
  const contributions: { collection: string; name: string; impl: object }[] = [];
  const registry = {
    contribute: (collection: string, name: string, impl: object) =>
      void contributions.push({ collection, name, impl }),
  } as unknown as Registry;

  return { registry, contributions };
}

describe("a harness usage contribution", () => {
  it("contributes the reader under its label to the usage collection", () => {
    const { registry, contributions } = recordingRegistry();
    const contributed = reader("subscription");

    contributeUsage(registry, contributed);

    expect(contributions).toEqual([{ collection: USAGE_COLLECTION, name: "subscription", impl: contributed }]);
  });
});

describe("the usage reader contract", () => {
  it("keeps windows, their period, and an unofficial marker without naming a provider", async () => {
    const usage: UsageReader = {
      label: "subscription",
      read: async () => ({
        windows: [
          {
            label: "short window",
            usedPercent: 42,
            startsAt: "2026-11-07T09:00:00.000Z",
            resetsAt: "2026-11-07T14:00:00.000Z",
          },
        ],
        unofficial: true,
      }),
    };

    await expect(usage.read()).resolves.toEqual({
      windows: [
        {
          label: "short window",
          usedPercent: 42,
          startsAt: "2026-11-07T09:00:00.000Z",
          resetsAt: "2026-11-07T14:00:00.000Z",
        },
      ],
      unofficial: true,
    });
  });

  it("returns an unavailable reason instead of pretending a reading exists", async () => {
    const usage: UsageReader = {
      label: "subscription",
      read: async () => ({ unavailable: "the account endpoint did not answer" }),
    };

    await expect(usage.read()).resolves.toEqual({ unavailable: "the account endpoint did not answer" });
  });
});
