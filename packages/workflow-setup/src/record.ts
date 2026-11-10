import { Ask, WorkRecord } from "@amykit/core";
import type { ChannelChoice } from "./ports/Catalog.js";
import type { MachineConfig } from "./ports/ConfigFile.js";
import type { SetupState } from "./machine.js";

/**
 * One setting value as the shared accepted set spells it: the four types a
 * flag or a reply line can carry. A record field is not one of them — a
 * plugin whose schema has one is refused, not asked.
 */
export type SettingValue = string | number | boolean | readonly string[];

/** The plugin the person chose, as the ask read it. */
export interface ChosenHarness {
  readonly name: string;
  readonly plugin: string;
}

/** The workflow the person chose, or none. */
export type ChosenWorkflow = "none" | { readonly name: string; readonly plugin: string };

/**
 * The answers the walk has been given: by a flag before its ask was asked,
 * or by the person after it. Kept on the record rather than re-read from the
 * conversation, so a look that moves on an answer is a look that can say
 * what the answer was.
 */
export interface Answers {
  /** The harness chosen. */
  harness?: ChosenHarness;
  /** The workflow chosen, or `none`. */
  workflow?: ChosenWorkflow;
  /** The channels chosen, in the order they were answered. */
  channels?: readonly ChannelChoice[];
  /** The settings written, one slice per configured plugin. */
  readonly settings: Readonly<Record<string, Readonly<Record<string, SettingValue>>>>;
}

/**
 * The ask the walk has posted and not yet had answered.
 *
 * One ask is open at a time: setup asks one question at a time. `since` is
 * the marker replies are read after, so a look never mistakes the answer to
 * an earlier ask for the answer to this one.
 */
export interface OpenAsk {
  /** `harness`, `workflow`, `channels`, or `<plugin>.<field>` for a settings post. */
  readonly id: string;
  /** The ask's own form, or `post` for the plain post a setting field is asked with. */
  readonly form: Ask["form"] | "post";
  /** The thread the ask was posted to, and the marker replies are read after. */
  readonly thread: string;
  readonly since: string;
}

/**
 * One ask the walk stopped on, unanswered: what it was, and the flag that
 * would answer it. Recorded so the host can print the `amy setup` flags
 * that would get the walk moving again, with no terminal of its own to say
 * them through.
 */
export interface PendingAsk {
  readonly id: string;
  /** The flag that would answer it, spelled as the person would write it. */
  readonly flag: string;
}

/**
 * Where the walk has got to configuring the plugins the person chose.
 *
 * The cursor is progress, not plan: which plugins are left is derivable from
 * the answers, but which one is in hand and how far its fields have been
 * asked is what happened, and only the fold knows.
 */
export interface Configuring {
  /** The plugins chosen, in the order they were answered; `at` is in hand. */
  readonly plugins: readonly string[];
  /** Which one is in hand. Those before it are written, or refused. */
  readonly at: number;
  /** The answers collected for the one in hand, by field. */
  readonly values: Readonly<Record<string, SettingValue>>;
  /** The plugins refused for a record field, each naming the field. */
  readonly refused: readonly { readonly plugin: string; readonly field: string }[];
}

/**
 * Everything the walk remembers about one run of setup, between looks.
 *
 * The steps the walk took and how they came out are keyed by what each was
 * about (`install:<package>`, `ladder`, `settings:<plugin>` …), so the look
 * after a step judges it: a green key moves the walk on, a refused or failed
 * one stops it naming why. Nothing is ever inferred from an absent key.
 */
export interface SetupRecord extends WorkRecord {
  state: SetupState;
  /** What the machine already said, once read: the defaults each ask offers. */
  machine?: MachineConfig;
  /** Each step the walk has taken and how it came out, keyed by what it was about. */
  steps?: Readonly<Record<string, unknown>>;
  /** The ask posted and not yet answered. */
  ask?: OpenAsk;
  /** The ask the walk stopped on, unanswered, when it stopped on one. */
  pending?: PendingAsk;
  /** The answers the walk has been given. */
  answers: Answers;
  /** The flag spellings the walk consumed, as the person wrote them. */
  flags: readonly string[];
  /** Why the walk stopped, when it has: what the failures name. */
  stoppedReason?: string;
  /** Where the configuring has got to, once something was chosen to configure. */
  configuring?: Configuring;
}
