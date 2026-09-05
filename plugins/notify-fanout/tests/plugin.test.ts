import { describe, it, expect, vi, afterEach } from "vitest";
import { Event, HostServices, Notifier, mount } from "@amykit/core";
import { CHANNEL_COLLECTION, plugin } from "../src/plugin.js";

const ANNOUNCEMENT = {
  text: "PROJ-1239 needs an answer before I can start.",
  workId: "PROJ-1239",
  state: "CLARIFYING",
};

/** A plugin contributing one channel, which is down if asked to be. */
function channelPlugin(name: string, down = false) {
  return {
    name: `@amykit/plugin-${name}`,
    version: "0.1.0",
    register(registry: Parameters<typeof plugin.register>[0]) {
      registry.contribute(CHANNEL_COLLECTION, name, {
        name,
        deliver: async () => {
          if (down) throw new Error(`${name} is down`);
        },
      });
    },
  };
}

async function hostWith(channels: ReturnType<typeof channelPlugin>[], events: Event[]) {
  const host: HostServices = {
    runner: { run: async () => ({ ok: true, exitCode: 0, stdout: "", stderr: "" }) },
    now: () => new Date("2026-09-03T12:00:00.000Z"),
    log: { append: (event) => events.push(event), read: () => [...events] },
    paths: { workspace: "/w", state: "/w/.amy" },
  };

  const outcome = await mount([plugin, ...channels], {}, host);
  if (!outcome.ok) throw new Error(outcome.problems.join("; "));
  return outcome.mounted.ports.get("notifier") as Notifier;
}

describe("the fan-out plugin's failure sink", () => {
  afterEach(() => vi.restoreAllMocks());

  it("writes down the channel it could not reach", async () => {
    const said = vi.spyOn(console, "error").mockImplementation(() => {});
    const events: Event[] = [];
    const notifier = await hostWith([channelPlugin("broken", true), channelPlugin("ok")], events);

    await notifier.announce(ANNOUNCEMENT);

    const [failed] = events.filter((e) => e.kind === "notify.failed");
    expect(failed?.workId).toBe("PROJ-1239");
    expect(failed?.state).toBe("CLARIFYING");
    expect(String(failed?.detail?.error)).toContain("broken is down");
    expect(failed?.detail?.text).toBe(ANNOUNCEMENT.text);

    // Both readers, deliberately: the log is what a report reads afterwards,
    // stderr is what somebody watching `amy run` sees at the time.
    expect(said).toHaveBeenCalledOnce();
  });

  it("says nothing when every channel delivered", async () => {
    const events: Event[] = [];
    const notifier = await hostWith([channelPlugin("ok")], events);

    await notifier.announce(ANNOUNCEMENT);

    expect(events).toEqual([]);
  });
});
