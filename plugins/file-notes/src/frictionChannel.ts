import { Notes } from "@amy/workflow-note-to-plan";
import { Channel } from "@amy/plugin-notify-fanout";

/**
 * Turns the machine giving up into a note about the machine.
 *
 * Only the announcement that says it has stopped, never the one that says it
 * is retrying: a step that failed once and worked on the second attempt is
 * not friction worth a plan, and filing one for it would bury the ones that
 * are. This is why the announcement carries a kind at all.
 *
 * A channel rather than something inside the engine, because it is the same
 * shape as every other way the machine reaches somebody, and because an
 * engine that wrote notes would be an engine that knows what a note is.
 */
export function frictionChannel(notes: Notes, repo: string, now: () => Date): Channel {
  return {
    name: "friction",
    async deliver(announcement) {
      if (announcement.kind !== "gave-up") return;

      notes.write(
        {
          repo,
          source: `a tick that failed in ${announcement.state}`,
          text: [
            announcement.text,
            ``,
            `This came from ${announcement.workId} in ${announcement.state}. What is worth`,
            `writing down is not the one piece of work, it is whatever made the machine`,
            `unable to finish it.`,
          ].join("\n"),
        },
        now(),
      );
    },
  };
}
