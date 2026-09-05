import { Tracker } from "@amykit/workflow-ticket-to-qa";
import { Channel } from "@amykit/plugin-notify-fanout";

/** Puts the announcement on the ticket, where it stays auditable. */
export function trackerChannel(tracker: Tracker): Channel {
  return {
    name: "tracker",
    async deliver(announcement) {
      await tracker.comment(announcement.workId, announcement.text);
    },
  };
}
