import { AskContext, Harness, HarnessReply } from "@amykit/core";
import { NamedHarness } from "./collection.js";
import { HandoffLog, handoffNote, recordHandoff, recordSkillHandoff } from "./handoff.js";
import { nextRung } from "./ladder.js";
import { Ladders, everyRung, rungsFor } from "./ladders.js";

/** Which skills answer for a step, in the order they are tried. */
export type SkillLadders = Readonly<Record<string, readonly string[]>>;

export interface HarnessRelayDeps extends HandoffLog {
  skills?: SkillLadders;
}

/**
 * One harness made of several, with nobody's prompts in it.
 *
 * The same two ladders the ticket-shaped relay climbs, over the same rungs,
 * for the same reasons: the skill ladder is who should do the step, the
 * harness ladder is what to do when the one asked ran out of quota or was not
 * up to it. What is missing here is any notion of what the step *is* — a
 * caller hands over a prompt and a directory, and gets back an answer and an
 * account of what it cost.
 *
 * That is the whole difference between a harness plugin one workflow can use
 * and a harness plugin any workflow can.
 */
export class HarnessRelay implements Harness {
  readonly name = "relay";

  constructor(
    private readonly ladders: Ladders<NamedHarness>,
    private readonly deps: HarnessRelayDeps = {},
  ) {
    if (everyRung(ladders).length === 0) {
      throw new Error("the relay has no harness to relay to: no harness plugin contributed one");
    }
  }

  /**
   * Hands the question to each skill named for the step, until one answers.
   *
   * With no skill configured this is one turn on the caller's own prompt,
   * which is every install that has not asked for anything else.
   */
  async ask(prompt: string, cwd: string, context: AskContext = {}): Promise<HarnessReply> {
    const skills = (context.step && this.deps.skills?.[context.step]) || [];
    if (skills.length === 0) return this.climb(prompt, cwd, context, undefined);

    let last: HarnessReply | null = null;

    for (let index = 0; index < skills.length; index += 1) {
      const skill = skills[index]!;
      last = await this.climb(prompt, cwd, context, skill);

      if (last.run.outcome === "completed") return last;

      // `abandoned` stops here for the same reason it stops the harness
      // ladder: it is what a killed child looks like, and the handbrake has
      // to mean the next thing does not start.
      const next = skills[index + 1];
      if (!next || last.run.outcome === "abandoned") break;

      recordSkillHandoff(this.deps, context.workId, step(context), skill, next, last.run);
    }

    return last!;
  }

  /**
   * Walks the harness ladder until something answers, or until the policy
   * says there is nowhere left to go.
   *
   * The reply that comes back is the last one attempted, so a caller sees a
   * real outcome rather than a summary of several.
   */
  private async climb(
    prompt: string,
    cwd: string,
    context: AskContext,
    skill: string | undefined,
  ): Promise<HarnessReply> {
    // Chosen once per climb rather than per rung: a step that swapped ladders
    // half way up would make "the next rung" mean nothing.
    const ladder = rungsFor(this.ladders, context.step);

    let index = 0;
    let handoff: string | undefined;
    let last: HarnessReply | null = null;

    while (index < ladder.length) {
      const rung = ladder[index]!;
      last = await rung.cli.ask(asked(prompt, skill, handoff), cwd, context);

      const next = nextRung(ladder, index, last.run.outcome);
      if (next === null) return last;

      const to = ladder[next]!;
      recordHandoff(this.deps, context.workId, step(context), rung, to, last.run);
      handoff = handoffNote(rung, last.run);
      index = next;
    }

    // Unreachable while the ladder is non-empty, and the constructor refuses
    // an empty one.
    return last!;
  }
}

/**
 * The prompt as it is actually sent: addressed to a skill when one was named,
 * and carrying what the previous rung left behind.
 */
function asked(prompt: string, skill: string | undefined, handoff: string | undefined): string {
  const body = handoff ? `${prompt}\n\n${handoff}` : prompt;
  return skill ? `/${skill}\n\n${body}` : body;
}

/** What the log calls the step, for a caller that did not say. */
function step(context: AskContext): string {
  return context.step ?? "ask";
}
