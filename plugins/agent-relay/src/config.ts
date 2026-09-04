import { ConfigSchema } from "@amy/core";

/** What this plugin needs told to it, and nothing more. */
export const configSchema: ConfigSchema = {
  ladder: {
    type: "string[]",
    description:
      "the contributed agents to try, in order, such as [claude:sonnet, claude:opus, codex:gpt-5]. Empty means every contributed agent, in the order the plugins were mounted",
    default: [],
  },
  skills: {
    type: "record",
    description:
      "which skills answer for a step, in the order they are tried, keyed by the workflow's action name: {\"triage\": [\"/logion\"]}. A skill named here must be installed, or the mount is refused",
    default: {},
  },
  skillRoots: {
    type: "string[]",
    description:
      "where installed skills are looked for. Empty means ~/.claude/skills, which is where the harness looks",
    default: [],
  },
  budget: {
    type: "record",
    description:
      "what the agents may spend, per window: perFiveHours and perWeek, each with tokens and/or costUsd, plus stopAt, the fraction of a ceiling at which new work stops being started",
    default: {},
  },
};
