import { describe, it } from "vitest";
import { AttemptOutcome, Git, Harness, PullRequestView, Store } from "@amykit/core";
import { World, conforms } from "@amykit/workflow-testkit";
import { ScriptedRunner, fakeHost, fakeRun, pullRequest, whenArgsInclude } from "@amykit/test-fixtures";
import { DEFAULT_POLICY, Note, PlanRecord, newRecord, noteToPlan, planRuntime } from "../src/index.js";

const REPO = "acme/widgets";

/**
 * One note's world: the notes directory, the other plans this machine is
 * already carrying, the repository's own check and the code host.
 *
 * `inFlight` is how many other plans for the same repository are open when
 * the note arrives; one of them is merged each time the machine waits, which
 * is what somebody reading them looks like from here.
 */
class NoteWorld implements World {
  readonly meanwhile: (() => void)[];
  readonly workId: string;
  private readonly others: PlanRecord[];
  private pr: PullRequestView | null = null;
  private checks = 0;

  constructor(
    readonly name: string,
    private readonly note: Note,
    inFlight = 0,
  ) {
    this.others = Array.from({ length: inFlight }, (_, index) => ({
      ...newRecord(`other-${index}`, new Date(note.writtenAt)),
      state: "PR_OPEN",
      repo: note.repo,
    }));
    this.workId = note.id;
    this.meanwhile = Array.from({ length: 4 }, () => () => this.oneIsMerged());
  }

  runtime(now: () => Date) {
    // The agent writes a file, so there is always something to commit.
    const runner = new ScriptedRunner([{ match: whenArgsInclude("status", "--porcelain"), result: { stdout: " M plans/x.md\n" } }]);
    const agent: Harness = { name: "relay", ask: async () => ({ text: "wrote the plan", run: fakeRun() }) };
    const records: Store<PlanRecord> = { all: () => [...this.others], load: () => null, save: () => undefined };

    return planRuntime({
      notes: { all: () => [this.note], get: (id) => (id === this.note.id ? this.note : null), write: () => this.note },
      agent,
      check: { check: async () => this.check(now) },
      host: fakeHost(null, {
        findPullRequest: async () => this.pr,
        openPullRequest: async () => (this.pr = pullRequest({ number: 12 })).number,
      }),
      notifier: { announce: async () => {} },
      records,
      git: new Git(runner, { workspaceRoot: "/checkouts", defaultBranch: "main" }),
      layout: { workspaceRoot: "/checkouts", defaultBranch: "main" },
      now,
      config: { repos: [REPO] },
      policy: DEFAULT_POLICY,
    });
  }

  private oneIsMerged(): void {
    const open = this.others.find((other) => other.state === "PR_OPEN");
    if (open) open.state = "DONE";
  }

  /** Red the first time, so `CHECKED` sends the draft back once before it holds. */
  private check(now: () => Date): AttemptOutcome {
    this.checks += 1;
    return { ok: this.checks > 1, output: this.checks > 1 ? "ok" : "the plan has no exit condition", at: now().toISOString() };
  }
}

const note = (repo: string): Note => ({
  id: "note-1",
  repo,
  text: "the gate output is truncated before the agent ever sees it",
  source: "a tick that failed in CHECKED",
  writtenAt: "2026-09-03T11:00:00.000Z",
});

describe("note-to-plan", () => {
  conforms(noteToPlan, {
    runner: { describe, it },
    runtime: (world, now) => world.runtime(now),
    worlds: [
      new NoteWorld("a note about a repository plans are written into", note(REPO)),
      new NoteWorld("a note about somewhere plans are not written", note("acme/elsewhere")),
      new NoteWorld("a note that arrives while two plans are unread", note(REPO), 2),
    ],
  });
});
