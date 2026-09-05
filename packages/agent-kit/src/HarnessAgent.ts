import { AgentResult, Git, Harness, HarnessReply, ReviewThread } from "@amykit/core";
import {
  Agent,
  AttemptOutcome,
  ThreadVerdict,
  Ticket,
  TriageOutcome,
} from "@amykit/workflow-ticket-to-qa";
import { extractJson } from "./json.js";

export interface HarnessAgentConfig {
  /**
   * Extra guidance to append when answering a particular reviewer, keyed by
   * their host login. A reviewer with known habits is cheaper to satisfy on
   * the first pass than on the third.
   */
  reviewerHints?: Readonly<Record<string, string>>;
  /**
   * A skill to hand the step to, instead of amy asking in its own words.
   *
   * The step's own instructions still follow the invocation, because the
   * answer has to arrive in the same shape whoever does the work.
   */
  skill?: string;
}

interface TriageReply {
  clear: boolean;
  questions?: string[];
}

interface VerdictReply {
  verdicts: { threadId: string; verdict: "fixed" | "disagreed"; note: string }[];
}

/**
 * An agent for a ticket, over any harness.
 *
 * Every call runs in the ticket's own checkout, on the branch the tracker
 * named, and anything the harness leaves behind is committed and pushed. The
 * machine's notion of "implemented" means the work is on the remote, because
 * that is what a pull request can be opened against.
 */
export class HarnessAgent implements Agent {
  constructor(
    private readonly harness: Harness,
    private readonly git: Git,
    private readonly config: HarnessAgentConfig = {},
  ) {}

  async triage(ticket: Ticket): Promise<AgentResult<TriageOutcome>> {
    const reply = await this.ask(
      ticket,
      [
        `You are deciding whether a ticket can be implemented as written.`,
        ``,
        `Ticket ${ticket.id}: ${ticket.title}`,
        `Tracker: ${ticket.url}`,
        ``,
        `Read the ticket and enough of this repository to judge it. Answer with a`,
        `single JSON object and nothing else:`,
        ``,
        `{"clear": true}`,
        ``,
        `if you could start implementing right now, or:`,
        ``,
        `{"clear": false, "questions": ["...", "..."]}`,
        ``,
        `listing only questions that genuinely block the work. A question you`,
        `could answer yourself by reading the code is not a blocking question.`,
      ].join("\n"),
    );

    // A run that did not complete has no answer to parse, and this returns
    // rather than throwing so that a relay above can read the cause and try
    // another harness. Throwing here would skip the whole escalation exactly
    // when it is needed. Nothing consumes this value: an agent action whose
    // run did not complete is failed by the engine.
    if (reply.run.outcome !== "completed") {
      return { value: { clear: false, questions: [], at: new Date().toISOString() }, run: reply.run };
    }

    const answer = extractJson<TriageReply>(reply.text);

    return {
      value: {
        clear: answer.clear,
        questions: answer.clear ? [] : (answer.questions ?? []),
        at: new Date().toISOString(),
      },
      run: reply.run,
    };
  }

  async implement(ticket: Ticket, retryContext?: string): Promise<AgentResult<AttemptOutcome>> {
    await this.git.prepareBranch(ticket.repo, ticket.branchName);

    const reply = await this.ask(
      ticket,
      [
        `Implement this ticket in the current repository.`,
        ``,
        `Ticket ${ticket.id}: ${ticket.title}`,
        `Tracker: ${ticket.url}`,
        ...(retryContext
          ? [
              ``,
              `A previous attempt did not hold. This is what went wrong, verbatim:`,
              ``,
              retryContext,
              ``,
              `Fix the underlying cause. Do not discard work that was already correct.`,
            ]
          : []),
        ``,
        `Follow the conventions already in this repository. Do not commit: that is`,
        `handled for you.`,
      ].join("\n"),
    );

    const at = new Date().toISOString();

    if (reply.run.outcome !== "completed") {
      return { value: { ok: false, output: reply.run.output, at }, run: reply.run };
    }

    const pushed = await this.git.commitAndPush(
      ticket.repo,
      ticket.branchName,
      `${ticket.id}: ${ticket.title}`,
    );

    if (!pushed) {
      // The harness exited cleanly and changed nothing. For a ticket that
      // asked for work, that is a failure worth reporting rather than a
      // success, and the account has to agree so a relay can act on it.
      return {
        value: {
          ok: false,
          output: `the agent finished without changing any file\n\n${reply.run.output}`,
          at,
        },
        run: { ...reply.run, outcome: "failed" },
      };
    }

    return { value: { ok: true, output: reply.run.output, at }, run: reply.run };
  }

  async addressThreads(
    ticket: Ticket,
    threads: readonly ReviewThread[],
    from: "automated" | "human",
  ): Promise<AgentResult<ThreadVerdict[]>> {
    await this.git.prepareBranch(ticket.repo, ticket.branchName);

    const reply = await this.ask(ticket, this.threadPrompt(ticket, threads, from));

    // Returned rather than thrown, for the same reason as in `triage`: the
    // relay above decides whether another harness gets a turn, and it needs
    // the run to decide. The engine is what fails the action once every
    // harness has been tried, so an empty list is never mistaken for "no
    // comment needed answering".
    if (reply.run.outcome !== "completed") {
      return { value: [], run: reply.run };
    }

    const answer = extractJson<VerdictReply>(reply.text);
    const verdicts = threads.map((thread) => {
      const given = answer.verdicts?.find((v) => v.threadId === thread.id);
      return {
        threadId: thread.id,
        // A comment the agent did not answer is not silently dropped. It is
        // pushed to the owner, because an unanswered review comment is the
        // one thing that must never disappear.
        verdict: given?.verdict ?? ("disagreed" as const),
        note: given?.note ?? "the agent did not answer this comment",
      };
    });

    await this.git.commitAndPush(
      ticket.repo,
      ticket.branchName,
      `${ticket.id}: address review comments`,
    );

    return { value: verdicts, run: reply.run };
  }

  private threadPrompt(
    ticket: Ticket,
    threads: readonly ReviewThread[],
    from: "automated" | "human",
  ): string {
    const hints = [
      ...new Set(
        threads
          .map((thread) => this.config.reviewerHints?.[thread.author.toLowerCase()])
          .filter((hint): hint is string => Boolean(hint)),
      ),
    ];

    return [
      from === "automated"
        ? `An automated reviewer left comments on the pull request for this ticket.`
        : `A human reviewer left comments on the pull request for this ticket.`,
      ``,
      `Ticket ${ticket.id}: ${ticket.title}`,
      ``,
      `Comments:`,
      ...threads.map((thread) => `\n[${thread.id}] ${thread.author} said:\n${thread.body}`),
      ...(hints.length ? [``, `Reviewer notes:`, ...hints.map((hint) => `- ${hint}`)] : []),
      ``,
      `For each comment, either change the code or say why you disagree. Do not`,
      `argue on the pull request. Do not commit: that is handled for you.`,
      ``,
      `Then answer with a single JSON object and nothing else:`,
      ``,
      `{"verdicts": [{"threadId": "...", "verdict": "fixed", "note": "what you changed"}]}`,
      ``,
      `Use "disagreed" only when you did not change the code, and say why in the`,
      `note. A disagreement goes to the ticket owner to settle, so be specific.`,
    ].join("\n");
  }

  private ask(ticket: Ticket, prompt: string): Promise<HarnessReply> {
    return this.harness.ask(this.invoke(prompt), this.git.pathFor(ticket.repo), {
      workId: ticket.id,
    });
  }

  /** The prompt, addressed to a skill when one was named. */
  private invoke(prompt: string): string {
    return this.config.skill ? `/${this.config.skill}\n\n${prompt}` : prompt;
  }
}
