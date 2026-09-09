import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { CHANNEL_COLLECTION } from "@amykit/plugin-notify-fanout";
import { plugin } from "../src/plugin.js";

/**
 * Whether an announcement is also commented on the ticket.
 *
 * `notify.tracker: false` used to be dead configuration. This plugin
 * contributed the channel unconditionally, the fan-out reaches every
 * contributed channel, and `Announcement` carries no channel of its own — so
 * an operator who had turned it off still got "PROJ-1241 is failing in
 * IMPLEMENTING and I am retrying: git checkout ... Aborting" commented on a
 * ticket their team reads. The setting read as honoured and was not, which is
 * worse than not having it.
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

describe("the ticket channel", () => {
  beforeEach(() => {
    process.env.LINEAR_API_KEY = "lin_api_test";
  });
  afterEach(() => {
    delete process.env.LINEAR_API_KEY;
  });

  it("is not contributed when the operator did not ask for it", () => {
    const { contributed } = mount({ announceOnTicket: false });

    expect(contributed).not.toContain(`${CHANNEL_COLLECTION}/tracker`);
  });

  /** The absent case is the same case: a slice that says nothing says no. */
  it("is not contributed when nothing says either way", () => {
    const { contributed } = mount({});

    expect(contributed).not.toContain(`${CHANNEL_COLLECTION}/tracker`);
  });

  it("is contributed when it is asked for", () => {
    const { contributed } = mount({ announceOnTicket: true });

    expect(contributed).toContain(`${CHANNEL_COLLECTION}/tracker`);
  });

  /**
   * Silencing the announcements must not unmount the tracker. Every workflow
   * reads a ticket through this port, and a question about a ticket is
   * commented through it directly rather than through the channel.
   */
  it("mounts the tracker either way", () => {
    expect(mount({ announceOnTicket: false }).ports).toContain("tracker");
    expect(mount({ announceOnTicket: true }).ports).toContain("tracker");
  });
});
