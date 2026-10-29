# An escalation brings its evidence

A piece of work escalated today with one line, "the implementation did not
come together in 3 attempts". Its owner then opened a separate agent session to
find out why. Everything that agent found was already on the disk. Nothing
amy said pointed at it, and nothing amy offered could talk about it.

The record held the reason. The gate's last output was on it, and it named six
findings: four `catch` blocks with no evidence that the case occurs, and two
test files beside changed code that the branch never touched. The trail was
plain. A stronger model approved the change twice, and the gate refused it
twice on rules the reviewer never saw. None of it reached the person:

- **The message carried a count, not a cause.** The escalation said how many
  attempts there were, and not what the last gate said or what the last review
  asked for.
- **The details on the record were somebody else's.** The workflow keeps one
  `escalationDetails` field, and an earlier escalation of the same work had
  filled it. The second escalation did not overwrite it, so the details
  shown, and the question a resume would ask, belonged to the first. A field
  per record is stale the moment a second escalation happens.
- **What the agent said was not kept.** `AgentRun.output` is "whatever the
  harness said, verbatim" (`packages/core/src/agent-run.ts`), and it is used
  as the next prompt and then dropped. The `agent.run` event keeps the harness,
  the model, the outcome, the duration and the cost
  (`recordAgentRun` in `packages/workflow-ticket-to-qa/src/runtime.ts`). It
  does not keep what the agent said it did, and it does not keep the session
  it said it in.
- **Finding the record took knowing a hash.** A profile's state lives under
  `~/.amy/projects/<hash>/<profile>/workflow/`. No command shows everything
  about one piece of work. The person, and the agent they asked, first looked
  in the directory records used to live in.
- **The conversation had nothing to read.** `ticket-to-qa` already answers
  a discussion turn in the work thread with a read-only agent (`discuss`).
  [A conversation before the work](a-conversation-before-the-work.md) gives
  the window an ask with the record, its checkout and its brief as context.
  Neither has the gate's output, the reviews or the agent's own account, so
  both would answer "why did it stop?" knowing less than the disk does.

## What changes

**Evidence goes on the transition, not on the record.** An `advance` may carry
`evidence`: a short list of `{ source, text, at }` entries, where `source` is
`gate`, `review`, `agent` or a name the workflow picks. The core keeps it on
the history entry that move appends. Every escalation therefore has its own
evidence, and a second escalation cannot show the first one's.
`ticket-to-qa`'s ceilings attach what tripped them:

- the gate's last output for a red gate;
- the reviewer's last findings for a self-review that did not converge;
- the threads for a review that did not settle.

Its announcements quote the first lines and name the command that shows the
rest. The core stores the evidence and words none of it.

**Every agent run is kept.** Next to the record, one file per run holds:

- the step, the harness and the model;
- the directory it ran in;
- the outcome and the cost;
- the agent's output, verbatim;
- the harness's session id, when the harness reports one.

The `agent.run` event carries the run's id, so the log points to the file. For
the session id, Claude reports `session_id` under `--output-format json`.
Codex resumes with `codex exec resume <id>`, but the field its `--json` stream
carries the id in is captured from a real run and recorded as a fixture before
anything relies on it.

**`amy show <workId>` is everything about one piece of work.** It finds the
record in whichever profile and project holds it, and prints:

- the state and the history, each move with its `why` and its evidence;
- the attempts and looks per state (*waiting is not trying*);
- each agent run with its outcome, cost and session;
- where every one of those files is.

`--json` gives the same, for an agent or a script.

**`amy ask <workId>` talks about it, and moves nothing.** It is a read-only ask
with turns, kept as a file like the asks *a conversation before the work*
keeps, and in the same format. That row's window opens the same files. The
context it starts from:

- what `amy show` prints;
- the record's checkout;
- its brief.

`--run <runId>` resumes the session of the run that failed instead of starting
a new one, when the harness can, with nothing that writes. That way the
question goes to the agent that holds the whole context, and it is the same
session-resume a cheaper follow-up step would use. It never commits, pushes or
reaches a mutating port. When the person decides, they do it the way they
already do: an answer in the thread, `amy resume` (*an escalation can be
withdrawn*), or `amy poke`.

**The thread's discussion reads the same evidence.** The context `discuss`
prompts with includes the evidence of the move that is waiting and the output
of the runs since the record entered that state. So "why did the gate go red?"
in the work thread gets the six findings, and not a guess.

## What this is not

- Not a viewer. The window draws this once *amy has a window* lands. This row
  gives it something to draw.
- Not a change to when work escalates. The ceilings stay where they are. What
  changes is what an escalation says.

## Acceptance criteria

- [ ] An `advance` that carries evidence stores it on the history entry it
      appends, and a second escalation of the same work shows only its own
      (proof: deferred:test:packages/core/tests/work.test.ts)
- [ ] `ticket-to-qa`'s red-gate, unconverged-review and unsettled-thread
      escalations carry the output that tripped them, and their announcement
      quotes it and names `amy show`
      (proof: deferred:test:packages/workflow-ticket-to-qa/tests/machine.test.ts)
- [ ] Every agent run leaves a file with its output and, for Claude, its
      session id, and the `agent.run` event names that file
      (proof: deferred:test:packages/workflow-ticket-to-qa/tests/runtime.test.ts)
- [ ] A recorded Codex run yields its session id from a structured field, or
      the plan records that Codex reports none
      (proof: deferred:test:plugins/codex/tests/CodexHarness.test.ts)
- [ ] `amy show <workId>` finds a record in any profile and project without a
      path, and prints its history with each move's evidence and every run
      (proof: deferred:test:packages/cli/tests/show.test.ts)
- [ ] `amy ask <workId>` answers from the record's evidence and runs, writes
      nothing outside its own file, and `--run` resumes the run's own session
      (proof: deferred:assertion:mine.an_escalation_can_be_asked_about)
- [ ] A discussion turn in the work thread of an escalated record is answered
      with the evidence of the move that escalated it
      (proof: deferred:assertion:plan.a_discussion_reads_the_evidence)

**Exit condition:** a ticket escalates on a red gate. The message names the
gate's findings and `amy show`. `amy show <id>` prints the whole trail without
a path. `amy ask <id> --run <last run>` answers "why did you stop?" from the
session that stopped, and the same question in the work thread gets the same
findings. Nothing about the work moves until its owner decides.
