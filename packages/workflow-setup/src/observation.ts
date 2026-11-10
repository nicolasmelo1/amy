import { ConfigSchema, Conversation, Reply, WorkflowActionScope, WorkflowPieceContext } from "@amykit/core";
import { answerTo } from "./asks.js";
import { green } from "./ports/result.js";
import type { Harness } from "./ports/Harnesses.js";
import type { ChannelChoice, WorkflowChoice } from "./ports/Catalog.js";
import { Result } from "./ports/result.js";
import type { SetupRecord } from "./record.js";
import { handOf } from "./answers.js";
import type { configSchema, needs } from "./plugin.js";

/** What the declaration hands every piece: the mounted ports, the settings and the policy. */
export type Scope = WorkflowPieceContext<typeof configSchema, Policy, typeof needs>;
export type ActionScope = WorkflowActionScope<typeof configSchema, Policy, typeof needs>;

/**
 * A snapshot of the world for one look, gathered before deciding.
 *
 * The decision function reads nothing else, so a test can put the machine
 * in any situation by building one of these. The conversation's reply is
 * reduced to the one that answers the open ask, and a plugin's schema is
 * only read once its install is green — a schema read for a package that is
 * not there is a refusal no walk can act on.
 */
export interface Observation {
  now: Date;
  /** Whether a conversation adapter is mounted: the terminal, or a channel like Slack. */
  readonly asks: boolean;
  /** Every harness the catalog knows, the ones detected here marked. */
  readonly harnesses: readonly Harness[];
  /** The workflows the host offers, the current one first. */
  readonly workflows: readonly WorkflowChoice[];
  /** The channel plugins, conversation and notifier. */
  readonly channels: readonly ChannelChoice[];
  /** The reply that answers the open ask, when one is open and a person answered it. */
  readonly answer: Reply | undefined;
  /** The configSchema of the plugin being configured, once its install is green. */
  readonly schema: Result<ConfigSchema> | undefined;
}

/** The defaults every policy key reads, so a decision reading one is honest about it. */
export interface Policy {
  /**
   * How long the walk waits between looks at an ask the person has not
   * answered. Setup asks a person, not a machine, and a person answers in
   * their own time.
   */
  askBackoffMs: number;
}

export const DEFAULT_POLICY: Policy = { askBackoffMs: 30_000 };

/**
 * Gathers what the current look can see.
 *
 * Every state gets the same snapshot: setup runs once, and the price of a
 * look is a few port calls — cheaper than a decision that reads a world it
 * was not built for.
 */
export async function observe(scope: Scope, current: SetupRecord): Promise<Observation> {
  const conversation: Conversation | undefined = scope.ports.conversation;
  const [harnesses, workflows, channels] = await Promise.all([
    scope.ports.harnesses.all(),
    scope.ports.catalog.workflows(),
    scope.ports.catalog.channels(),
  ]);
  const replies =
    current.ask && conversation ? await conversation.replies({ id: current.ask.thread }, current.ask.since) : [];
  const inHand = handOf(current);
  const schema =
    inHand && green(current.steps?.[`install:${inHand}`] as Result<void> | undefined)
      ? await scope.ports.config.schemaOf(inHand)
      : undefined;
  return {
    now: scope.ctx.now(),
    asks: conversation !== undefined,
    harnesses,
    workflows,
    channels,
    answer: current.ask ? answerTo(current.ask, replies) : undefined,
    schema,
  };
}
