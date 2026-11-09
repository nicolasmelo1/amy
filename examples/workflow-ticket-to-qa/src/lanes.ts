import {
  Agent,
  AttemptOutcome,
  BriefStore,
  Gate,
  HarnessReply,
  AskContext,
  Tracker,
  WorkRecord,
  Worktree,
  defineWorkflow,
  optional,
  port,
  renderBrief,
  withDiagram,
} from "@amykit/core";

/**
 * The two checks an implementation goes through, as two lanes of one fork:
 * the gate and the work's review of itself, side by side, against the same
 * commit. Each is a workflow of its own, called from `checks` in this
 * package's diagram, and returns what it found to the verdict.
 *
 * They used to run one after the other, and a change the gate refused went
 * back to the implementation without what the review would have said about
 * it. See `docs/design/a-workflow-runs-on-lanes.md`.
 */

/** What every check is called with: where the work is, whose it is, and the commit to check. */
const CHECK_INPUT = {
  repo: { type: "string", required: true, description: "the repository the work is in" },
  workId: { type: "string", required: true, description: "the work whose change is checked" },
  revision: { type: "string", description: "the commit to check, lent read-only; the work's own tree when absent" },
} as const;

type CheckInput = { repo: string; workId: string; revision?: string };

/** What a check found, whichever way it ended. */
export type Finding = AttemptOutcome & { revision?: string };

type GateRecord = WorkRecord & { state: "CHECKING" | "GREEN" | "RED"; input: CheckInput; result?: Finding };

/**
 * Where a check runs: its own tree, which the host lends detached at the
 * commit the lane was bound to, when a worktree is mounted to lend one; and
 * the work's own tree when not — a shared checkout is already on the work's
 * branch.
 */
async function treeFor(
  git: { acquire(repo: string, workId?: string): Promise<string> },
  worktree: Worktree | undefined,
  record: WorkRecord & { input: CheckInput },
): Promise<{ readonly path: string; readonly workId: string }> {
  const { repo, workId } = record.input;
  if (worktree && record.revision) return { path: await git.acquire(repo, record.id), workId: record.id };
  return { path: await git.acquire(repo, workId), workId };
}

export const gateLane = withDiagram(defineWorkflow({
  name: "ticket-gate",
  configSchema: {},
  policy: {},
  needs: { gate: port<Gate>(), worktree: optional<Worktree>() },
  input: CHECK_INPUT,
  output: {
    GREEN: (record: GateRecord): Finding => record.result!,
    RED: (record: GateRecord): Finding => record.result!,
  },
  decide: {
    CHECKING: (record: GateRecord) => {
      if (!record.result) return { kind: "act", effects: [{ type: "run-gate" }], why: "the gate has not run against this commit" };
      return record.result.ok
        ? { kind: "advance", to: "GREEN", effects: [], why: "the gate is green" }
        : { kind: "advance", to: "RED", effects: [], why: "the gate is red" };
    },
    GREEN: () => ({ kind: "settled", why: "the gate is green" }),
    RED: () => ({ kind: "settled", why: "the gate is red" }),
  },
  record: () => ({}),
  observe: async () => ({}),
  actions: {
    "run-gate": async (scope, work) => {
      const record = work.record as GateRecord;
      const tree = await treeFor(scope.checkouts.git, scope.ports.worktree, record);
      const outcome = await scope.ports.gate.run({ repo: record.input.repo, workId: tree.workId });
      work.outcomes.result = { ...outcome, ...(record.input.revision ? { revision: record.input.revision } : {}) };
    },
  },
  remember: (_scope, record: GateRecord, outcomes) => (outcomes.result ? { ...record, result: outcomes.result as Finding } : record),
}), `stateDiagram-v2
    [*] --> CHECKING
    CHECKING --> GREEN: the gate passed
    CHECKING --> RED: the gate failed
    GREEN --> [*]
    RED --> [*]
`, "ticket-gate.mmd");

type ReviewRecord = WorkRecord & { state: "REVIEWING" | "APPROVED" | "CHANGES_ASKED"; input: CheckInput & { ticketId: string }; result?: Finding & { verdict: "APPROVED" | "CHANGES_ASKED" } };

interface ReviewObservation {
  readonly id: string;
  readonly title: string;
  /** The brief as it reads now, so a revision between looks reaches the review. */
  readonly brief?: string;
}

type Asking = Agent & { ask(prompt: string, cwd: string, context?: AskContext): Promise<HarnessReply> };

/**
 * The verdict a review ends on: a line of its own saying `CHANGES_ASKED`
 * sends the work back; anything else is a review that found nothing to stop
 * it, which is what every review was before it could say so.
 */
export function reviewVerdict(text: string): "APPROVED" | "CHANGES_ASKED" {
  const asked = text.split("\n").some((line) => verdictWord(line).startsWith("CHANGES_ASKED"));
  return asked ? "CHANGES_ASKED" : "APPROVED";
}

/**
 * A line as a verdict reads, its markdown let go of: a bullet, a quote, a
 * heading, bold or code around it, and a `Verdict:` before it — an agent
 * writes the line it is asked for the way it writes any other.
 */
function verdictWord(line: string): string {
  const unmarked = (text: string) => text.replace(/^[\s>*_`#-]+/, "");
  return unmarked(unmarked(line).replace(/^verdict\s*:?/i, "")).toUpperCase();
}

export const selfReviewLane = withDiagram(defineWorkflow({
  name: "ticket-self-review",
  configSchema: {},
  policy: {},
  needs: { tracker: port<Tracker>(), agent: port<Asking>(), brief: optional<BriefStore>(), worktree: optional<Worktree>() },
  input: { ...CHECK_INPUT, ticketId: { type: "string", required: true, description: "the ticket the change is for" } },
  output: {
    APPROVED: (record: ReviewRecord): Finding => record.result!,
    CHANGES_ASKED: (record: ReviewRecord): Finding => record.result!,
  },
  decide: {
    REVIEWING: (record: ReviewRecord) => {
      if (!record.result) return { kind: "act", effects: [{ type: "self-review" }], why: "the change has not been read against what it was for" };
      return { kind: "advance", to: record.result.verdict, effects: [], why: record.result.verdict === "APPROVED" ? "the review found nothing to stop it" : "the review asked for changes" };
    },
    APPROVED: () => ({ kind: "settled", why: "approved" }),
    CHANGES_ASKED: () => ({ kind: "settled", why: "changes asked" }),
  },
  record: () => ({}),
  observe: async (scope, record): Promise<ReviewObservation> => {
    const ticketId = (record as ReviewRecord).input.ticketId;
    const ticket = await scope.ports.tracker.get(ticketId);
    if (!ticket) throw new Error(`${ticketId} is not in the tracker any more`);
    const brief = ticket.briefId && scope.ports.brief ? await scope.ports.brief.get(ticket.briefId) : null;
    return { id: ticket.id, title: ticket.title, ...(brief ? { brief: renderBrief(brief).text } : {}) };
  },
  actions: {
    // The work reads itself against the brief before a person is asked to,
    // in its own tree at the commit the gate checks too. The brief travels in
    // the context as well, the field every generic `ask` reads.
    "self-review": async (scope, work) => {
      const record = work.record as ReviewRecord;
      const ticket = work.observation as ReviewObservation;
      const tree = await treeFor(scope.checkouts.git, scope.ports.worktree, record);
      const reply = await scope.ports.agent.ask(
        [
          `The ticket ${ticket.id} was implemented in this repository. Review`,
          `the change at the current commit against what the work was for,`,
          `and say what a reviewer should look at first.`,
          `End with a line saying APPROVED if it is ready for a reviewer, or`,
          `CHANGES_ASKED and what has to change before it is.`,
          ...(ticket.brief ? [``, `The current brief for the feature this ticket belongs to:`, ``, ticket.brief] : []),
        ].join("\n"),
        tree.path,
        { workId: record.id, step: "self-review", brief: ticket.brief },
      );
      // A review that did not finish found nothing either way, so it never
      // ends the lane. Out of quota, it was not a try and waits; anything
      // else fails the look, the way every other agent step here does.
      if (reply.run.outcome === "rate-limited") {
        work.outcomes.waited = { notATry: true };
        return;
      }
      if (reply.run.outcome !== "completed") {
        throw new Error(`self-review did not complete: ${reply.run.outcome} on ${reply.run.harness}${reply.run.output ? `\n\n${reply.run.output}` : ""}`);
      }
      work.outcomes.result = {
        ok: true,
        output: reply.text,
        at: scope.ctx.now().toISOString(),
        verdict: reviewVerdict(reply.text),
        ...(record.input.revision ? { revision: record.input.revision } : {}),
      };
    },
  },
  remember: (_scope, record: ReviewRecord, outcomes) => (outcomes.result ? { ...record, result: outcomes.result as ReviewRecord["result"] } : record),
}), `stateDiagram-v2
    [*] --> REVIEWING
    REVIEWING --> APPROVED: nothing to stop it
    REVIEWING --> CHANGES_ASKED: it asks for changes
    APPROVED --> [*]
    CHANGES_ASKED --> [*]
`, "ticket-self-review.mmd");
