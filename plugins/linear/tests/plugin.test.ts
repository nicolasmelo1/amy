import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { plugin } from "../src/plugin.js";

/**
 * What the linear plugin mounts, and nothing more.
 *
 * It used to contribute a notification channel to the fan-out, which made
 * every progress notice the engine emits a comment on the ticket — under the
 * operator's own name, because amy authenticates with a key issued to a
 * person. A tracker comment is for a question that needs a person, and the
 * workflow posts those itself, so the channel is gone rather than taught to
 * filter its own writing.
 */
function mount(slice: Record<string, unknown>) {
  const contributed: string[] = [];
  const ports: string[] = [];
  const registry = {
    port: (kind: string) => void ports.push(kind),
    contribute: (collection: string, name: string) => void contributed.push(`${collection}/${name}`),
    action: () => {},
    workflow: () => {},
    observer: () => {},
  };
  plugin.register(registry as never, { config: slice } as never);
  return { contributed, ports };
}

describe("the linear plugin", () => {
  beforeEach(() => {
    process.env.LINEAR_API_KEY = "lin_api_test";
  });
  afterEach(() => {
    delete process.env.LINEAR_API_KEY;
  });

  it("mounts the tracker, which is the one thing it owns", () => {
    expect(mount({}).ports).toContain("tracker");
  });

  it("contributes no channel at all", () => {
    // The fan-out reaches every contributed channel with no way to route one
    // announcement, so "a channel on the tracker" meant every retry notice
    // the engine wrote became a comment on a ticket a team reads.
    expect(mount({}).contributed).toEqual([]);
  });
});