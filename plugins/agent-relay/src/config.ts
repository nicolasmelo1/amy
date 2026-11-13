import { ConfigSchema } from "@amykit/core";

/** What this plugin needs told to it, and nothing more. */
export const configSchema = {
  ladder: {
    type: "string[]",
    description:
      "the contributed agents to try, in order, such as [claude:sonnet, claude:opus, codex:gpt-5]. Empty means every contributed agent, in the order the plugins were mounted",
    default: [],
  },
  ladderByStep: {
    type: "record",
    description:
      "a ladder for one step, overriding the one above, keyed by the workflow's action name: {\"triage\": [\"claude:haiku\"], \"implement\": [\"claude:opus\"]}. Reading a ticket and writing the change are not the same job, and one list for both means paying the expensive model to do the cheap step",
    default: {},
  },
  skills: {
    type: "record",
    description:
      "which skills answer for a step, in the order they are tried, keyed by the workflow's action name: {\"triage\": [\"/logion\"]}. A step named `chat` is the conversation itself: those skills are the ones a message may start with, such as {\"chat\": [\"/amy-groom\"]}. A skill named here must be installed, or the mount is refused",
    default: {},
  },
  skillRoots: {
    type: "string[]",
    description:
      "where installed skills are looked for, after amy's own ~/.amy/skills. A harness's own directory is never looked in unless harnessSkills chooses it",
    default: [],
  },
  harnessSkills: {
    type: "record",
    description:
      "which harnesses' own installed skills amy links into ~/.amy/skills at each run and tick, by the harness plugin's name: {\"claude\": true}. amy's own copy of a skill wins; false, or leaving a harness out, removes its links. A name no harness plugin mounted is refused at boot",
    default: {},
  },
  budget: {
    type: "record",
    description:
      "what the agents may spend, per window: perFiveHours and perWeek, each with tokens and/or costUsd, plus stopAt, the fraction of a ceiling at which new work stops being started",
    default: {},
  },
} satisfies ConfigSchema;
