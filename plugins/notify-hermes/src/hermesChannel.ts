import { CommandRunner, ConfigSchema } from "@amykit/core";
import { Channel } from "@amykit/plugin-notify-fanout";

/** What this plugin needs told to it, and nothing more. */
export const configSchema: ConfigSchema = {
  target: {
    type: "string",
    required: true,
    description:
      "a Hermes delivery target, such as `slack:my-channel` or a bare platform name for its home channel",
  },
};

export interface HermesListing {
  platforms?: Record<string, { id?: string; name?: string }[]>;
}

/**
 * Whether Hermes actually has the target configured.
 *
 * Checked against `--list --json` rather than the human-readable listing,
 * because that listing ends with a usage line naming a platform as an
 * example. Matching on the text would pass for a platform that is only
 * mentioned in the help.
 *
 * Target format is `platform`, `platform:chat_id`,
 * `platform:chat_id:thread_id` or `platform:#channel-name`.
 */
export function hermesTargetIsKnown(listing: HermesListing, target: string): boolean {
  const separator = target.indexOf(":");
  const platform = separator === -1 ? target : target.slice(0, separator);
  const targets = listing.platforms?.[platform];

  if (!targets) return false;
  // A bare platform name sends to that platform's home channel.
  if (separator === -1) return true;

  const wanted = target.slice(separator + 1).replace(/^#/, "");

  // A thread target is `chat_id:thread_id`, which Hermes already reports
  // joined in the id, so an exact match covers it.
  return targets.some(
    (candidate) => candidate.id === wanted || candidate.name === wanted,
  );
}

/**
 * Hands the announcement to Hermes, which already owns the messaging
 * credentials, so this does not need any of its own.
 */
export function hermesChannel(runner: CommandRunner, target: string): Channel {
  return {
    name: `hermes:${target}`,
    async deliver(announcement) {
      const result = await runner.run(
        "hermes",
        ["send", "--to", target, "--quiet", "--subject", `amy ${announcement.workId}`],
        { stdin: announcement.text, timeoutMs: 60_000 },
      );

      if (!result.ok) {
        throw new Error(result.stderr || result.stdout || "hermes send failed");
      }
    },
  };
}
