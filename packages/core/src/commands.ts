import { CommandRunner } from "./ports/CommandRunner.js";

/**
 * What a check or a setup writes to. The host owns the terminal; a check says
 * what it found and never decides how it is drawn.
 *
 * A plugin brings no command of its own any more: it declares operations, and
 * the command line is drawn from them like every other door
 * (docs/design/a-plugin-brings-operations-not-commands.md).
 */
export interface CommandOutput {
  line(text?: string): void;
  error(text: string): void;
}

/** The host's own check, so a plugin's red one fails the doctor the same way. */
export interface Check {
  label: string;
  ok: boolean;
  detail?: string;
}

/**
 * What a check is handed: the profile's state directory, the machine's state
 * root, its own settings and somewhere to write.
 *
 * Deliberately not the mounted machine: `amy doctor` exists for the moment
 * the machine will not come up, so a check that needed a port to say what is
 * wrong would only speak on the machines that do not need it.
 */
export interface CheckContext<Settings extends Record<string, unknown> = Record<string, unknown>> {
  /** The profile's state directory: everything a plugin owns lives under it. */
  readonly state: string;
  /** The machine's state root. */
  readonly home: string;
  /** This plugin's settings slice, validated the way a mount's are. */
  readonly settings: Settings;
  readonly out: CommandOutput;
}

/** A check a plugin brings, run by `amy doctor` after the host's own. */
export interface PluginCheck<Settings extends Record<string, unknown> = Record<string, unknown>> {
  readonly name: string;
  run(ctx: CheckContext<Settings>): Check | Promise<Check>;
}

/**
 * What a setup is handed: what a check gets, and a way to run a command.
 *
 * A setup prepares something outside amy's own state — another program's
 * profile, say — so unlike a check it is expected to run commands.
 */
export type SetupContext<Settings extends Record<string, unknown> = Record<string, unknown>> =
  CheckContext<Settings> & { readonly runner: CommandRunner };

/**
 * Something a plugin prepares outside amy's state, run by `amy init` and
 * `amy add` after the files.
 *
 * Run every time, so it must find what an earlier run made and leave it
 * alone: what is already there belongs to whoever edited it. It answers the
 * way a check does, and its own doctor check is how a later drift is told.
 */
export interface PluginSetup<Settings extends Record<string, unknown> = Record<string, unknown>> {
  readonly name: string;
  run(ctx: SetupContext<Settings>): Check | Promise<Check>;
}

/**
 * A file a plugin wants written, relative to the profile's state directory.
 *
 * Written by `amy init` and `amy add` and never overwritten: what is already
 * there belongs to whoever edited it.
 */
export interface PluginFile<Settings extends Record<string, unknown> = Record<string, unknown>> {
  readonly path: string;
  readonly content: string | ((settings: Settings) => string);
}
