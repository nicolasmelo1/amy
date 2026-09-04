import fs from "node:fs";
import path from "node:path";
import { CommandRunner, ConfigSchema } from "@amy/core";
import { Channel } from "@amy/plugin-notify-fanout";

/** What this plugin needs told to it, and nothing more. */
export const configSchema: ConfigSchema = {
  directory: {
    type: "string",
    description: "where the questions are left, relative to the workspace",
    default: "needs-input",
  },
};

/**
 * Writes the announcement to a directory of files the operator can answer in
 * their own time, and raises a desktop notification so they know it is there.
 *
 * The file is the durable half: a notification that is missed is gone, but
 * the question stays on disk until it is dealt with.
 */
export function inboxChannel(directory: string, runner: CommandRunner): Channel {
  return {
    name: "inbox",
    async deliver(announcement) {
      fs.mkdirSync(directory, { recursive: true });

      const stamp = new Date().toISOString().replace(/[:.]/g, "");
      const file = path.join(directory, `${stamp}-${announcement.workId}.md`);

      fs.writeFileSync(
        file,
        [
          `# ${announcement.workId}`,
          ``,
          `State: ${announcement.state}`,
          `Asked: ${new Date().toISOString()}`,
          ``,
          announcement.text,
          ``,
          `---`,
          `Answer on the ticket, then delete this file.`,
          ``,
        ].join("\n"),
        "utf-8",
      );

      await runner.run("osascript", [
        "-e",
        `display notification ${quote(announcement.text)} with title ${quote(
          `amy ${announcement.workId}`,
        )}`,
      ]);
    },
  };
}

/** AppleScript string literal, kept to one line so a newline cannot break it. */
function quote(text: string): string {
  const flattened = text.replace(/\s+/g, " ").trim();
  const escaped = flattened.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
  return `"${escaped}"`;
}
