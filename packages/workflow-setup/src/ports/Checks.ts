import { Result } from "./result.js";

/**
 * One thing a plugin's doctor found, green or red.
 *
 * A harness's doctor pings the models it was given, and its ping finding is
 * named `ping` with the model that did not answer as what it said — that is
 * the finding that stops the walk naming the model.
 */
export interface CheckFinding {
  /** The check's name, e.g. `ping`. */
  readonly name: string;
  readonly ok: boolean;
  /** What the check said: the model that answered, or the one that did not. */
  readonly said: string;
}

/**
 * Runs a plugin's setup and its doctor-shaped checks.
 *
 * The walk never pings anything itself: the port carries whatever the
 * plugin's own checks report, and a red finding stops the walk naming what
 * the finding said.
 */
export interface Checks {
  /**
   * Prepares what the plugin owns outside amy's state, answering the way a
   * check does.
   */
  setup(plugin: string): Promise<Result<readonly CheckFinding[]>>;
  /** The plugin's doctor: for a harness, the ping of the models it was given. */
  check(plugin: string): Promise<Result<readonly CheckFinding[]>>;
}
