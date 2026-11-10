import type { WorkRecord } from "@amykit/core";
import type { ChannelChoice } from "./ports/Catalog.js";
import type { Observation } from "./observation.js";
import type { SetupRecord } from "./record.js";
import { labelOf } from "./asks.js";

/**
 * What the flags gave before their asks were asked, read off the record a
 * caller started. Read defensively: the input was validated against the
 * workflow's input schema when the record was started, but this is the one
 * place the walk reads it, so this is where it says what it accepts.
 */
export interface Given {
  /** The one plugin `amy setup <plugin>` goes straight to configuring. */
  readonly plugin?: string;
  /** The harness the `--harness` flag chose. */
  readonly harness?: string;
  /** The workflow the `--workflow` flag chose, or `none`. */
  readonly workflow?: string;
  /** The channels the `--channels` flag chose, by name. */
  readonly channels?: readonly string[];
  /** The settings the `--<plugin>.<field>` flags gave, by plugin, by field. */
  readonly settings: Readonly<Record<string, Readonly<Record<string, unknown>>>>;
}

/** The flags a caller passed, keyed as the input schema promises. */
export function given(record: WorkRecord): Given {
  const input = record.input as Partial<Given> | undefined;
  const settings = input?.settings;
  return {
    ...(input?.plugin !== undefined ? { plugin: String(input.plugin) } : {}),
    ...(input?.harness !== undefined ? { harness: String(input.harness) } : {}),
    ...(input?.workflow !== undefined ? { workflow: String(input.workflow) } : {}),
    ...(Array.isArray(input?.channels) ? { channels: input.channels.map(String) } : {}),
    settings: typeof settings === "object" && settings !== null && !Array.isArray(settings) ? settings : {},
  };
}

/**
 * The resolvers: where each answer comes from, in the order it can come.
 *
 * An answer already on the record first (idempotent — the fold and the
 * decision read the same one), then the flag that answered before the ask
 * was asked, then the reply that answered the ask the conversation is
 * holding open. A flag that names nothing the catalog offers is not an
 * answer: the ask posts anyway, and the person chooses what the machine
 * can actually mount.
 */
export type Via = "record" | "flag" | "reply";

export function harnessIn(record: SetupRecord, obs: Observation): { via: Via; name: string; plugin: string } | undefined {
  const answered = record.answers.harness;
  if (answered) return { via: "record", ...answered };
  const flagged = given(record).harness;
  if (flagged) {
    const found = obs.harnesses.find((harness) => harness.name === flagged);
    if (found) return { via: "flag", ...found };
  }
  if (record.ask?.id === "harness" && obs.answer?.answer) {
    const chosen = obs.harnesses.find((harness) => harness.name === obs.answer?.answer?.chosen[0]);
    if (chosen) return { via: "reply", ...chosen };
  }
  return undefined;
}

export function workflowIn(record: SetupRecord, obs: Observation): { via: Via; answer: "none" | { name: string; plugin: string } } | undefined {
  const answered = record.answers.workflow;
  if (answered) return { via: "record", answer: answered };
  const flagged = given(record).workflow;
  if (flagged === "none") return { via: "flag", answer: "none" };
  if (flagged) {
    const found = obs.workflows.find((choice) => choice.name === flagged);
    if (found) return { via: "flag", answer: { name: found.name, plugin: found.plugin } };
  }
  if (record.ask?.id === "workflow" && obs.answer?.answer) {
    const chosen = obs.answer.answer.chosen[0];
    if (chosen === "none") return { via: "reply", answer: "none" };
    const found = obs.workflows.find((choice) => choice.name === chosen);
    if (found) return { via: "reply", answer: { name: found.name, plugin: found.plugin } };
  }
  return undefined;
}

/**
 * The channels the person chose: nothing is an answer too, because a
 * machine may want no channels yet, and every chosen label must name a
 * channel the catalog offers or the reply did not answer the ask.
 */
export function channelsIn(record: SetupRecord, obs: Observation): { via: Via; choices: readonly ChannelChoice[] } | undefined {
  const answered = record.answers.channels;
  if (answered) return { via: "record", choices: answered };
  const flagged = given(record).channels;
  if (flagged) {
    const choices = flagged.map((name) => obs.channels.find((channel) => channel.name === name));
    if (choices.every((channel): channel is ChannelChoice => !!channel)) return { via: "flag", choices };
  }
  if (record.ask?.id === "channels" && obs.answer?.answer) {
    const chosen = obs.answer.answer.chosen;
    if (chosen.length === 0) return { via: "reply", choices: [] };
    const choices = chosen.map((label) => obs.channels.find((channel) => labelOf(channel) === label));
    if (choices.every((channel): channel is ChannelChoice => !!channel)) return { via: "reply", choices };
  }
  return undefined;
}

/**
 * The plugins the walk is to configure: the scope's one when a plugin was
 * named, else the channels chosen. Derived, never folded — the answers say
 * it, and the cursor only says how far it has got.
 */
export function queueOf(record: SetupRecord): readonly string[] {
  const scoped = given(record).plugin;
  if (scoped) return [scoped];
  return record.answers.channels?.map((channel) => channel.plugin) ?? [];
}

/** The plugin the configuring has in hand, once it has one. */
export function handOf(record: SetupRecord): string | undefined {
  const cursor = record.configuring;
  return cursor?.plugins[cursor.at];
}

/**
 * The plugin the walk holds at PLUGIN_INSTALLED and PINGED: the scope's
 * one when a plugin was named, else the harness the person chose.
 *
 * Throws when neither, because a record only reaches those states holding
 * one — the harness ask is answered before the walk advances past it, and a
 * scoped record is started with its plugin.
 */
export function pluginInHand(record: SetupRecord): string {
  const scoped = given(record).plugin;
  if (scoped) return scoped;
  const harness = record.answers.harness?.plugin;
  if (harness) return harness;
  throw new Error("the walk holds no plugin: no scope was named and no harness was chosen");
}
