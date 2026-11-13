import { AgentRun } from "../agent-run.js";

export interface HarnessReply {
  /** Just the answer, with whatever envelope carried it stripped away. */
  text: string;
  run: AgentRun;
}

/**
 * What a caller knows about a question that a relay might need and the CLI
 * answering it never does.
 *
 * Both fields are for whoever composes harnesses rather than for the harness
 * itself: one ties the account to the work it was spent on, the other lets a
 * skill named for a step be the thing that answers. A single-harness install
 * ignores both, which is why they are optional.
 */
export interface AskContext {
  workId?: string;
  /** The action being performed, in the workflow's own vocabulary. */
  step?: string;
  /**
   * The current brief the work belongs to, rendered, when there is one.
   *
   * A workflow-declared half-step — a self-review, say — is a generic `ask`
   * with no ticket in it, so without this field it would be the one step
   * blind to the reason the work exists. A caller with no brief passes
   * nothing, and the prompt is unchanged.
   */
  brief?: string;
  /**
   * Says whether a run that completed actually holds, while a relay can still
   * hand the step to the next rung.
   *
   * A run can complete and still not be the answer — an implementation that
   * changed no file is the case. Called by a relay after each completed run;
   * what it returns is the run the relay climbs on, so a step that turns the
   * outcome to `failed` gets the stronger model or the next skill.
   */
  verify?: (reply: HarnessReply) => Promise<HarnessReply>;
  /**
   * The run may read the checkout and must change nothing in it. A harness
   * that can enforce this does, through its own sandbox; one that cannot
   * refuses the run rather than relying on the prompt asking nicely.
   */
  readOnly?: boolean;
  /**
   * The skill the prompt is addressed to, and the directory its `SKILL.md`
   * is in.
   *
   * Set by a relay that addressed the prompt to a skill. A harness that runs
   * apart from the operator's own setup sees none of their skills, so it is
   * handed this one by place rather than trusting it to be found.
   */
  skill?: { readonly name: string; readonly path: string };
}

/**
 * One coding agent CLI, reduced to the only thing that differs between them.
 *
 * A prompt, a directory, and an account of what the answer cost. Nothing here
 * names a ticket, a plan or a review, which is why it is a port of the core:
 * the workflow-shaped things an agent does are built *on* this, one layer up,
 * and a second workflow wants this rather than the first workflow's prompts.
 */
export interface Harness {
  readonly name: string;
  /**
   * Whether this harness can be handed a skill by place, as `AskContext.skill`
   * asks.
   *
   * A harness whose CLI reads skills from its own home and offers no way to
   * add one leaves this unset, and a turn addressed to a skill is refused on
   * it rather than acting without the method it was told to follow.
   */
  readonly lendsSkill?: boolean;
  /**
   * Where this harness's own installed skills are, one directory per skill
   * holding its `SKILL.md`, as its plugin knows it.
   *
   * Read when the config sets `harnessSkills.<name>: true`: amy links each of
   * them into its own skill root for the run. A harness that leaves this unset
   * cannot be chosen there.
   */
  readonly skillsDirectory?: string;
  ask(prompt: string, cwd: string, context?: AskContext): Promise<HarnessReply>;
}
