import { Announcement, Plugin, PluginContext } from "@amy/core";
import { Channel, FanOutNotifier } from "./FanOutNotifier.js";

/** The collection other plugins add their channels to. */
export const CHANNEL_COLLECTION = "notify-channel";

/**
 * Where a channel failure goes: the log, and stderr as well.
 *
 * The log is what a report reads afterwards; stderr is what somebody
 * watching `amy run` needs to see at the moment it happens. Neither one on
 * its own covers both readers.
 */
function sinkFor(ctx: PluginContext, announcement: Announcement) {
  return (message: string): void => {
    console.error(message);
    ctx.log?.append({
      at: ctx.now().toISOString(),
      kind: "notify.failed",
      workId: announcement.workId,
      state: announcement.state,
      detail: { error: message, text: announcement.text },
    });
  };
}

export const plugin: Plugin = {
  name: "@amy/plugin-notify-fanout",
  version: "0.1.0",
  register(registry, ctx) {
    // Read when an announcement is made, not when this is mounted: the
    // channels are contributed by plugins listed after this one.
    registry.port("notifier", {
      announce: (announcement: Announcement) => {
        const channels = [...ctx.contributions(CHANNEL_COLLECTION).values()] as Channel[];
        return new FanOutNotifier(channels, sinkFor(ctx, announcement)).announce(announcement);
      },
    });
  },
};
