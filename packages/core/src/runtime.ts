import { Action, Plan, WorkRecord } from "./work.js";

/**
 * The collection a workflow contributes its runtime to.
 *
 * Named here rather than by the engine that reads it, because a workflow
 * should not have to know which engine will drive it — and an engine should
 * not have to name the workflow. The same reasoning as the notification
 * channels, one level up.
 */
export const WORKFLOW_RUNTIME = "workflow-runtime";

/**
 * What one action needs to do its work, and where it writes what happened.
 *
 * `outcomes` is a bag the workflow owns at both ends: its handlers fill it
 * and its `apply` reads it. The engine only carries it between the two,
 * which is why it is typed as loosely here as it is.
 */
export interface ActionContext<R extends WorkRecord = WorkRecord, O = unknown> {
  readonly record: R;
  readonly observation: O;
  readonly outcomes: Record<string, unknown>;
}

export type ActionHandler<R extends WorkRecord = WorkRecord, O = unknown> = (
  action: Action,
  context: ActionContext<R, O>,
) => Promise<void>;

/**
 * How a workflow's actions actually run.
 *
 * The decision — `Workflow.plan` — is pure and says *what* should happen. This
 * is the other half: what the outside world looks like before deciding, what
 * each action does, and how what it produced folds back into the record. All
 * three are domain knowledge, and none of them belongs in an engine.
 *
 * An engine that takes this drives any workflow. One that reaches for a
 * tracker or a pull request itself drives exactly one, whatever its types
 * say.
 */
export interface WorkflowRuntime<R extends WorkRecord = WorkRecord, O = unknown> {
  /**
   * What the decision function is given as its policy.
   *
   * Carried here because a policy is written in the workflow's own
   * vocabulary — attempt ceilings, backoffs, how many open reviews one person
   * may be handed — and an engine that held it would be an engine that has an
   * opinion about all three.
   */
  readonly policy: unknown;
  /** Work that exists and is not on the queue yet, by id. */
  found(): Promise<string[]>;
  /** The record a work id starts with, before anything has happened to it. */
  newRecord(workId: string, now: Date): R;
  /** A snapshot of the outside world for one record, gathered before deciding. */
  observe(record: R): Promise<O>;
  /** One handler per action this workflow can emit, keyed by action name. */
  handlers(): Readonly<Record<string, ActionHandler<R, O>>>;
  /**
   * Folds what the actions produced, and what was observed, into the record.
   *
   * The engine has already folded the state, the attempt count and the
   * history through `applyPlan`; it cannot fold the rest, because it does not
   * know what a triage or a gate result is. The observation is here because
   * not everything a record learns comes from an action — an answer somebody
   * left elsewhere arrives as an observation, and a fold that could not see
   * one would leave the record waiting on it forever.
   */
  apply(
    record: R,
    plan: Plan,
    outcomes: Record<string, unknown>,
    observation: O,
    now: Date,
  ): R;
}
