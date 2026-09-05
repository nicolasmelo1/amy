import { AgentResult, EventLog, ReviewThread } from "@amykit/core";
import {
  NamedAgent,
  SkillLadders,
  handoffNote,
  nextRung,
  recordHandoff,
  recordSkillHandoff,
} from "@amykit/agent-kit";
import {
  Agent,
  AttemptOutcome,
  ThreadVerdict,
  Ticket,
  TriageOutcome,
} from "@amykit/workflow-ticket-to-qa";

export interface RelayDeps {
  log?: EventLog;
  now?: () => Date;
  /** Which skills answer for a step, in the order they are tried. */
  skills?: SkillLadders;
}

/**
 * One agent made of several, and the only thing in the system that decides
 * who answers.
 *
 * Two ladders, and they are about different questions. The skill ladder is
 * who should do the step; the harness ladder is what to do when the one
 * asked ran out of quota or was not up to it. So a skill is tried across the
 * harnesses it needs before the next skill gets a turn.
 *
 * A single-harness install with no skills goes through the same code, with
 * nothing special about that case: one rung, one turn, no policy fires.
 */
export class AgentRelay implements Agent {
  constructor(
    private readonly ladder: readonly NamedAgent[],
    private readonly deps: RelayDeps = {},
  ) {
    if (ladder.length === 0) {
      throw new Error("the relay has no agent to relay to: no harness plugin contributed one");
    }
  }

  triage(ticket: Ticket): Promise<AgentResult<TriageOutcome>> {
    return this.perform("triage", ticket, (agent) => agent.triage(ticket));
  }

  /**
   * The handoff carries what happened, which is the point of continuing
   * rather than restarting.
   *
   * The working tree is left exactly as the cut-off harness left it, and the
   * next one is told it is picking up half-done work. Resetting would throw
   * away whatever was already right, and on a long ticket that is expensive
   * enough to risk hitting the same quota again.
   */
  implement(ticket: Ticket, retryContext?: string): Promise<AgentResult<AttemptOutcome>> {
    return this.perform("implement", ticket, (agent, handoff) =>
      agent.implement(ticket, join(retryContext, handoff)),
    );
  }

  addressThreads(
    ticket: Ticket,
    threads: readonly ReviewThread[],
    from: "automated" | "human",
  ): Promise<AgentResult<ThreadVerdict[]>> {
    return this.perform("address-threads", ticket, (agent) =>
      agent.addressThreads(ticket, threads, from),
    );
  }

  /**
   * Hands the step to each skill named for it, until one answers.
   *
   * With no skill configured this is one turn on amy's own prompt, which is
   * every install that has not asked for anything else.
   */
  private async perform<T>(
    step: string,
    ticket: Ticket,
    call: (agent: Agent, handoff?: string) => Promise<AgentResult<T>>,
  ): Promise<AgentResult<T>> {
    const skills = this.deps.skills?.[step] ?? [];
    if (skills.length === 0) return this.climb(step, ticket, undefined, call);

    let last: AgentResult<T> | null = null;

    for (let index = 0; index < skills.length; index += 1) {
      const skill = skills[index]!;
      last = await this.climb(step, ticket, skill, call);

      if (last.run.outcome === "completed") return last;

      // `abandoned` stops here for the same reason it stops the harness
      // ladder: it is what a killed child looks like, and the handbrake has
      // to mean the next thing does not start.
      const next = skills[index + 1];
      if (!next || last.run.outcome === "abandoned") break;

      recordSkillHandoff(this.deps, ticket.id, step, skill, next, last.run);
    }

    return last!;
  }

  /**
   * Walks the harness ladder until something works, or until the policy says
   * there is nowhere left to go.
   *
   * The result that comes back is the last one attempted, so a caller sees a
   * real outcome rather than a summary of several.
   */
  private async climb<T>(
    action: string,
    ticket: Ticket,
    skill: string | undefined,
    call: (agent: Agent, handoff?: string) => Promise<AgentResult<T>>,
  ): Promise<AgentResult<T>> {
    let index = 0;
    let handoff: string | undefined;
    let last: AgentResult<T> | null = null;

    while (index < this.ladder.length) {
      const rung = this.ladder[index]!;
      last = await call(skill ? rung.using(skill) : rung.agent, handoff);

      const next = nextRung(this.ladder, index, last.run.outcome);
      if (next === null) return last;

      const to = this.ladder[next]!;
      recordHandoff(this.deps, ticket.id, action, rung, to, last.run);
      handoff = handoffNote(rung, last.run);
      index = next;
    }

    // Unreachable while the ladder is non-empty, and the constructor refuses
    // an empty one.
    return last!;
  }
}

function join(...parts: (string | undefined)[]): string | undefined {
  const kept = parts.filter((part): part is string => Boolean(part));
  return kept.length === 0 ? undefined : kept.join("\n\n");
}
