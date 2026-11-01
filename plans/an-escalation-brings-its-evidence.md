---
sources:
  - { id: S1, kind: friction, said: "work escalated with \"the implementation did not come together in 3 attempts\"; the owner opened a separate agent session to learn why, and everything it found was already on disk" }
  - { id: S2, kind: friction, said: "the record held the gate's last output: four catch blocks with no evidence the case occurs, two untouched test files beside changed code; a stronger model approved twice, the gate refused twice on rules the reviewer never saw" }
  - { id: S3, kind: friction, said: "the message carried a count, not a cause: not what the last gate said or what the last review asked for" }
  - { id: S4, kind: code, ref: "packages/workflow-ticket-to-qa/src/record.ts", said: "one escalation-details field (escalationDetails) per record: an earlier escalation filled it, the second did not overwrite it, so details shown and the resume question belonged to the first" }
  - { id: S5, kind: code, ref: "packages/core/src/agent-run.ts", said: "AgentRun.output is the harness's verbatim words, used as the next prompt then dropped; the agent.run event (recordAgentRun) keeps harness, model, outcome, duration, cost, not what the agent said or its session" }
  - { id: S6, kind: friction, said: "state lives under ~/.amy/projects/<hash>/<profile>/workflow/; no command shows everything about one work, and the person and their agent first looked where records used to live" }
  - { id: S7, kind: reference, ref: "plans/a-conversation-before-the-work.md", said: "discuss and that plan's window ask have the record, checkout and brief, but not gate output, reviews or the agent's account, so both answer \"why did it stop?\" knowing less than the disk" }
  - { id: S8, kind: decision, ref: "packages/core/src/define-workflow.ts", said: "an advance may carry evidence: a short list of { source, text, at }, source being gate, review, agent or a workflow-chosen name" }
  - { id: S9, kind: decision, ref: "packages/core/src/work.ts", said: "the core keeps evidence on the history entry the move appends, beside ids of runs made since the record last entered the state it leaves; it stores evidence and words none of it" }
  - { id: S10, kind: decision, ref: "packages/workflow-ticket-to-qa/src/machine.ts", said: "ticket-to-qa ceilings attach what tripped them: gate's last output for a red gate, reviewer's last findings for an unconverged self-review, the threads for an unsettled review" }
  - { id: S11, kind: decision, said: "announcements quote the first lines of the evidence and name the command that shows the rest" }
  - { id: S12, kind: decision, ref: "packages/workflow-ticket-to-qa/src/runtime.ts", said: "one file per agent run next to the record: step, harness, model, directory, outcome, cost, verbatim output, harness session id when reported; the agent.run event carries the run's id" }
  - { id: S13, kind: code, ref: "plugins/claude/src/ClaudeHarness.ts", said: "Claude reports session_id under --output-format json" }
  - { id: S14, kind: decision, ref: "plugins/codex/src/CodexHarness.ts", said: "Codex resumes with codex exec resume <id>; the --json field carrying the id is captured from a real run and recorded as a fixture before anything relies on it" }
  - { id: S15, kind: decision, ref: "packages/cli/src/index.ts", said: "amy show <workId> finds the record in any profile and project; prints state and history with each move's why and evidence, attempts and looks per state, each run's outcome, cost, session, and every file's location" }
  - { id: S16, kind: decision, said: "amy show --json gives the same, for an agent or a script" }
  - { id: S17, kind: decision, said: "amy ask <workId> is a read-only ask with turns, kept as a file in the format a conversation before the work uses, opened by that row's window; context: amy show's output, the checkout, the brief" }
  - { id: S18, kind: decision, said: "amy ask --run <runId> resumes the failed run's session when the harness can, with nothing that writes; it never commits, pushes or reaches a mutating port; the same session-resume a cheaper follow-up step would use" }
  - { id: S19, kind: decision, said: "the person decides as today: an answer in the thread, amy withdraw (an escalation can be withdrawn), or amy poke" }
  - { id: S20, kind: decision, ref: "packages/workflow-ticket-to-qa/src/discussion.ts", said: "discuss's context includes the waiting move's evidence and the runs its history entry names (all since entering the escalated-from state, e.g. IMPLEMENTING, CHECKED), read first, its own earlier turns after" }
  - { id: S21, kind: reference, ref: "docs/design/waiting-is-not-trying.md", said: "amy show prints attempts and looks per state as separate counts" }
  - { id: S22, kind: reference, ref: "plans/an-escalation-can-be-withdrawn.md", said: "amy withdraw is one of the ways the person acts after asking" }
  - { id: S23, kind: reference, ref: "plans/amy-has-a-window.md", said: "the window draws this once amy has a window lands; this row only gives it something to draw" }
touches:
  - packages/core/src/define-workflow.ts
  - packages/core/src/work.ts
  - packages/core/src/agent-run.ts
  - packages/core/src/ports/Harness.ts
  - packages/core/src/ports/EventLog.ts
  - packages/core/events.json
  - packages/core/tests/work.test.ts
  - packages/workflow-ticket-to-qa/src/machine.ts
  - packages/workflow-ticket-to-qa/src/record.ts
  - packages/workflow-ticket-to-qa/src/runtime.ts
  - packages/workflow-ticket-to-qa/src/discussion.ts
  - packages/workflow-ticket-to-qa/tests/machine.test.ts
  - packages/workflow-ticket-to-qa/tests/runtime.test.ts
  - plugins/claude/src/ClaudeHarness.ts
  - plugins/codex/src/CodexHarness.ts
  - plugins/codex/tests/CodexHarness.test.ts
  - packages/cli/src/index.ts
  - packages/cli/tests/show.test.ts
criteria:
  - { id: A1, statement: "an advance that carries evidence stores it on the history entry it appends, and a second escalation of the same work shows only its own", proof: "deferred:test:packages/core/tests/work.test.ts", sources: [S4, S8, S9] }
  - { id: A2, statement: "ticket-to-qa's red-gate, unconverged-review and unsettled-thread escalations carry the output that tripped them, and their announcement quotes it and names amy show", proof: "deferred:test:packages/workflow-ticket-to-qa/tests/machine.test.ts", sources: [S2, S3, S10, S11] }
  - { id: A3, statement: "every agent run leaves a file with its output and, for Claude, its session id, and the agent.run event names that file", proof: "deferred:test:packages/workflow-ticket-to-qa/tests/runtime.test.ts", sources: [S5, S12, S13] }
  - { id: A4, statement: "a recorded Codex run yields its session id from a structured field, or the plan records that Codex reports none", proof: "deferred:test:plugins/codex/tests/CodexHarness.test.ts", sources: [S14] }
  - { id: A5, statement: "amy show <workId> finds a record in any profile and project without a path, and prints its history with each move's evidence and every run", proof: "deferred:test:packages/cli/tests/show.test.ts", sources: [S1, S6, S15, S16, S21, S23] }
  - { id: A6, statement: "amy ask <workId> answers from the record's evidence and runs, writes nothing outside its own file, and --run resumes the run's own session", proof: "deferred:assertion:mine.an_escalation_can_be_asked_about", sources: [S17, S18, S19, S22] }
  - { id: A7, statement: "a discussion turn in an escalated record's work thread is answered with the escalating move's evidence and the output of the runs that move names, which ran before it", proof: "deferred:assertion:plan.a_discussion_reads_the_evidence", sources: [S7, S20] }
crosses:
  - { mechanism: record-migration, answer: works, proof: "deferred:A1; evidence is optional on an advance, so an older history entry without it still reads" }
  - { mechanism: calls, answer: n/a, why: "advance only gains an optional evidence list; nothing about one workflow calling another changes" }
  - { mechanism: hooks, answer: n/a, why: "advance only gains an optional evidence list; before, after and interrupt are unchanged" }
  - { mechanism: attempts-and-waits, answer: n/a, why: "a run gains an id, a file and a session id; when attempts are charged or given back is unchanged" }
  - { mechanism: agent-replies, answer: works, proof: "deferred:test:plugins/codex/tests/CodexHarness.test.ts" }
  - { mechanism: tracker-and-host-writes, answer: refused, by: "amy ask is read-only: it never commits, pushes or reaches a mutating port (S18)" }
guarantee:
  - { holds: "each escalation shows only its own evidence", not_against: "a second escalation of the same work" }
  - { holds: "amy ask writes nothing outside its own file", not_against: "--run resuming the failed run's session" }
cut:
  - "a viewer: not this row; the window draws this once amy has a window lands"
  - "changing when work escalates: refused; the ceilings stay where they are, only what an escalation says changes"
  - "the core wording evidence: refused; it stores evidence and words none of it (S9)"
exit: "red-gate escalation names its findings and amy show; amy show <id> prints the trail, no path; amy ask <id> --run <last run> answers from the stopped session; the work thread gets the same findings; nothing moves until its owner decides"
---
# An escalation brings its evidence

An escalation said "did not come together in 3 attempts", and its owner opened a separate agent session to learn why. Everything that agent found was already on disk; nothing amy said pointed at it, and nothing amy offered could talk about it.
