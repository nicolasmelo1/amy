import { ConfigSchema } from "@amykit/core";
import { Result } from "./result.js";

/**
 * What the machine already says, read once at the start of the walk.
 *
 * This is what each ask offers as its default: a machine already set up
 * answers its own questions first, and the person edits rather than starts
 * over. The ladder is read as written because the ping that follows an
 * install is of the models the ladder names — the walk does not invent them.
 */
export interface MachineConfig {
  /** The harness ladder, as written: entries like `codex:gpt-5`, cheapest first. */
  readonly ladder: readonly string[];
  /** The workflow the machine drives, empty when none. */
  readonly workflow: string;
  /** One settings slice per installed plugin, keyed by package name. */
  readonly settings: Readonly<Record<string, Readonly<Record<string, unknown>>>>;
}

/**
 * The machine's config.yaml, which the walk reads and writes only through
 * here. No step of the walk parses yaml, merges blocks or spells a file
 * path: the adapter owns the file's words, and every answer it gives is one
 * of the three a result can be — a file that does not parse is never read as
 * nothing set.
 */
export interface ConfigFile {
  /**
   * The current defaults and ladder.
   *
   * Refused, naming the file and the parser's first error, when the file
   * does not parse or cannot be read; internal when the read failed rather
   * than the file.
   */
  read(): Promise<Result<MachineConfig>>;
  /**
   * Writes the setup profile block: the profile `amy setup` mounts in,
   * naming this workflow. Run every time, leaving what an earlier run made
   * alone.
   */
  writeSetupProfile(workflow: string): Promise<Result<void>>;
  /** Writes the ladder for the harness the person chose. */
  writeLadder(harness: string): Promise<Result<void>>;
  /** Writes the workflow the person chose as the one the machine drives. */
  writeWorkflow(name: string, plugin: string): Promise<Result<void>>;
  /**
   * One plugin's configSchema, the closed five-type format it declares.
   *
   * Refused, naming the plugin, when it is not installed or mounts nothing
   * amy can read.
   */
  schemaOf(plugin: string): Promise<Result<ConfigSchema>>;
  /**
   * Writes one plugin's settings slice with the answers the person gave.
   *
   * A merge, never a rewrite of the whole slice: a re-run must not
   * overwrite a value the person did not answer anew.
   */
  writeSettings(plugin: string, values: Readonly<Record<string, unknown>>): Promise<Result<void>>;
}
