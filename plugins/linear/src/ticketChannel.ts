import { Tracker } from "@amykit/workflow-ticket-to-qa";
import { Channel } from "@amykit/plugin-notify-fanout";

/**
 * Puts the announcement on the ticket, saying that a machine wrote it.
 *
 * The prefix and the footer are not decoration. amy authenticates with a key
 * issued to a person, so a comment it leaves is authored by that person: the
 * raw text went up under the operator's own name with nothing to mark it, and
 * "REVV-7716 is moving again in DONE after 2 failed attempt(s)" reached a
 * ticket a team reads. A colleague replied to it asking what it meant.
 *
 * The first line carries it because the first line is what a notification
 * shows. The footer carries it too, because a body can be quoted back and a
 * reader who scrolled past the top still deserves to know.
 */
export function trackerChannel(tracker: Tracker): Channel {
  return {
    name: "tracker",
    async deliver(announcement) {
      await tracker.comment(
        announcement.workId,
        `amy:\n\n${announcement.text}\n\n---\n\`amy:notify\` written by a tool, not typed by hand.`,
      );
    },
  };
}
