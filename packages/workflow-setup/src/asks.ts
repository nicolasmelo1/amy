import { Ask, ConfigField, ConfigSchema, Reply } from "@amykit/core";
import type { Harness } from "./ports/Harnesses.js";
import type { ChannelChoice, WorkflowChoice } from "./ports/Catalog.js";
import type { OpenAsk, SettingValue } from "./record.js";

/**
 * The asks, the posts and the flags — pure, so the decision that plans one
 * and the fold that records one read a reply the same way.
 *
 * A controlled ask is an Ask on the conversation port; a plugin setting is
 * not one — the Ask type has no free-text form — so it is a plain post
 * answered by an ordinary reply line, parsed to the field's type here.
 */

/** The harness ask: claude, codex and hermes, the ones detected here first. */
export function harnessAsk(harnesses: readonly Harness[], current?: string): Ask {
  // The current one first when the machine has one, then the detected, then
  // the rest: a detected harness is the likeliest answer and the first thing
  // a person should read. The sort is stable, so the catalog's own order
  // survives inside each band.
  const order = [...harnesses].sort((a, b) => rankOf(b, current) - rankOf(a, current));
  return {
    id: "harness",
    prompt: "Which harness should do the work?",
    form: "choice",
    answers: order.map((harness) => harness.name),
  };
}

function rankOf(harness: Harness, current?: string): number {
  if (harness.name === current) return 2;
  return harness.detected ? 1 : 0;
}

/** The workflow ask: the host's workflows and none, the current one first. */
export function workflowAsk(workflows: readonly WorkflowChoice[]): Ask {
  const order = [...workflows].sort((a, b) => Number(b.current) - Number(a.current));
  return {
    id: "workflow",
    prompt: "Which workflow should this machine drive?",
    form: "choice",
    answers: [...order.map((choice) => choice.name), "none"],
  };
}

/** How one channel appears in the channels ask: its name and its kind together. */
export function labelOf(channel: ChannelChoice): string {
  return `${channel.name} (${channel.kind})`;
}

/** The channels ask: one choices ask, conversation and notifier plugins grouped by kind. */
export function channelsAsk(channels: readonly ChannelChoice[]): Ask {
  const order = [...channels].sort((a, b) => (a.kind === b.kind ? 0 : a.kind === "conversation" ? -1 : 1));
  return {
    id: "channels",
    prompt: "Which channels should reach you?",
    form: "choices",
    answers: order.map(labelOf),
  };
}

/**
 * The plain post that asks one setting field, offering the current value as
 * its default: a reply of nothing keeps what the machine already holds.
 */
export function settingsPost(plugin: string, field: string, spec: ConfigField, current: unknown): string {
  const kept = current === undefined ? "" : ` Answer nothing to keep \`${JSON.stringify(current)}\`.`;
  return `What should ${plugin}'s \`${field}\` be? — ${spec.description}${kept}`;
}

/**
 * One reply line parsed to the field's type: a string as it was typed, a
 * number, a boolean, a string[] comma-separated.
 *
 * Nothing back when the line does not say a value of the field's type — an
 * unparsable line is not an answer, and the ask it failed to answer stays
 * open for the person to try again. An empty line answers with the current
 * value when one exists, which is what "offered as its default" means; for
 * a string[] with no current value an empty line is an empty list, the one
 * value an empty line can spell for it.
 */
export function parseSetting(spec: ConfigField, line: string, current: unknown): SettingValue | undefined {
  if (spec.type === "record") return undefined; // never asked: the plugin was refused for it
  const trimmed = line.trim();
  if (trimmed === "") {
    if (holds(spec, current)) return current as SettingValue;
    return spec.type === "string[]" ? [] : undefined;
  }
  switch (spec.type) {
    case "string":
      return line;
    case "number": {
      const asNumber = Number(trimmed);
      return Number.isFinite(asNumber) ? asNumber : undefined;
    }
    case "boolean":
      return trimmed === "true" ? true : trimmed === "false" ? false : undefined;
    case "string[]":
      return trimmed.split(",").map((item) => item.trim()).filter((item) => item !== "");
  }
}

/** Whether a current value is one the field's type accepts, so offering it is honest. */
function holds(spec: ConfigField, current: unknown): boolean {
  switch (spec.type) {
    case "string":
      return typeof current === "string";
    case "number":
      return typeof current === "number" && Number.isFinite(current);
    case "boolean":
      return typeof current === "boolean";
    case "string[]":
      return Array.isArray(current) && current.every((item) => typeof item === "string");
    case "record":
      return false;
  }
}

/** The flag that would answer one ask, spelled as the person would write it. */
export function flagFor(ask: string): string {
  switch (ask) {
    case "harness":
      return "--harness <name>";
    case "workflow":
      return "--workflow <name|none>";
    case "channels":
      return "--channels <a,b>";
    default:
      return `--${ask} <value>`;
  }
}

/** How a flag-given answer was spelled, as the person wrote it. */
export function spelledFlag(id: string, value: unknown): string {
  const text = Array.isArray(value) ? value.join(",") : String(value);
  return `--${id} ${text}`.trimEnd();
}

/** The field a settings ask id names: everything after the plugin. */
export function fieldOf(askId: string): string | undefined {
  const at = askId.indexOf(".");
  return at < 0 ? undefined : askId.slice(at + 1);
}

/**
 * The reply that answers the open ask, when one did.
 *
 * A marked answer answers a controlled ask by naming it; any line after the
 * ask answers a plain post, because a plain post is what a setting field is
 * asked with and a line is all its medium owes it.
 */
export function answerTo(open: OpenAsk, replies: readonly Reply[]): Reply | undefined {
  const after = replies.filter((reply) => reply.at > open.since);
  if (open.form === "post") return after[0];
  return after.find((reply) => reply.answer?.ask === open.id);
}

/** The fields a schema asks, in its own order. */
export function fieldsOf(schema: ConfigSchema): readonly { field: string; spec: ConfigField }[] {
  return Object.entries(schema).map(([field, spec]) => ({ field, spec }));
}

/** The first record field a schema declares, which refuses the plugin that has it. */
export function recordFieldIn(schema: ConfigSchema): string | undefined {
  return fieldsOf(schema).find(({ spec }) => spec.type === "record")?.field;
}
