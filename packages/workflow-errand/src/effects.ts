import { planning } from "@amykit/core";
import { ErrandState } from "./state.js";

/**
 * This workflow's typed view of the actions it composes.
 *
 * All three are the core's own. Nothing here is new, which is the point: an
 * errand is an agent in a checkout, a pull request if it changed anything,
 * and somebody being told. Every one of those already existed.
 */
export type Effect =
  /** Do what the task says, in the repository it is about. */
  | { type: "run-errand"; finding?: string }
  | { type: "open-pull-request" }
  | { type: "announce"; text: string };

export const { act, advance, wait, settled } = planning<ErrandState, Effect>();
