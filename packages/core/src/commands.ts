import { PortKind } from "./actions.js";

/**
 * What a command writes to. The host owns the terminal; a command says what
 * it found and never decides how it is drawn.
 */
export interface CommandOutput {
  line(text?: string): void;
  error(text: string): void;
}

/**
 * What a command is handed: the profile's state directory, its own settings
 * and nothing else.
 *
 * Deliberately not the mounted machine. A command exists for the moment the
 * machine will not come up — `amy doctor` after a bad upgrade, `amy add` on a
 * bare install — so a command that needed a port to say what is wrong would
 * only speak on the machines that do not need it. A command declared
 * `mount: true` asks for the ports and is refused, by name, when the machine
 * will not assemble.
 */
export interface CommandContext<Settings extends Record<string, unknown> = Record<string, unknown>> {
  /** The profile's state directory: everything a plugin owns lives under it. */
  readonly state: string;
  /**
   * The machine's state root.
   *
   * For the one file that is nobody's profile: `amy models` reads the price
   * table every agent call shares, and a table per profile would mean one
   * machine holding several answers to what a model costs.
   */
  readonly home: string;
  /** This plugin's settings slice, validated the way a mount's are. */
  readonly settings: Settings;
  readonly args: readonly string[];
  readonly options: Readonly<Record<string, string | boolean | undefined>>;
  readonly out: CommandOutput;
  /** The mounted ports, for a command declared `mount: true`. */
  readonly ports?: ReadonlyMap<PortKind, object>;
}

/** A positional argument a command accepts, in the order it is typed. */
export interface CommandArgument {
  readonly name: string;
  readonly description?: string;
  readonly optional?: boolean;
  readonly variadic?: boolean;
}

/** A flag a command accepts, written the way the help prints it. */
export interface CommandFlag {
  readonly flags: string;
  readonly description?: string;
  readonly default?: string;
}

/**
 * A command a plugin brings.
 *
 * Plain data read after the module is imported: the host lists it in
 * `amy --help`, parses it, and hands it a directory. The plugin decides what
 * the command means; the host decides nothing about it.
 */
export interface PluginCommand<Settings extends Record<string, unknown> = Record<string, unknown>> {
  readonly name: string;
  readonly description: string;
  readonly args?: readonly CommandArgument[];
  readonly flags?: readonly CommandFlag[];
  /** Subcommands, one of which may be the default when none is typed. */
  readonly subcommands?: readonly PluginCommand<Settings>[];
  /** The subcommand `amy <name>` means when no subcommand is given. */
  readonly default?: boolean;
  /** Whether running it needs the mounted ports, rather than only this directory. */
  readonly mount?: boolean;
  /** Absent on a command that only groups subcommands. */
  run?(ctx: CommandContext<Settings>): void | Promise<void>;
}

/** The host's own check, so a plugin's red one fails the doctor the same way. */
export interface Check {
  label: string;
  ok: boolean;
  detail?: string;
}

/** What a check is handed: the same directories, settings and output a command gets. */
export type CheckContext<Settings extends Record<string, unknown> = Record<string, unknown>> =
  Pick<CommandContext<Settings>, "state" | "home" | "settings" | "out">;

/** A check a plugin brings, run by `amy doctor` after the host's own. */
export interface PluginCheck<Settings extends Record<string, unknown> = Record<string, unknown>> {
  readonly name: string;
  run(ctx: CheckContext<Settings>): Check | Promise<Check>;
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
