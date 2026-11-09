---
base: 0dc5319c214126f161b0b576588db3a02f1c18ae
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
  - { id: S12, kind: decision, ref: "packages/core/src/action-ports.ts", said: "one file per agent run next to the record: step, harness, model, directory, outcome, cost, verbatim output, harness session id when reported; the agent.run event carries the run's id" }
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
  - { id: S23, kind: reference, ref: "plans/a-record-is-seen-everywhere.md", said: "the window draws this once a record is seen everywhere lands; this row only gives it something to draw" }
  - { id: S24, kind: friction, said: "one install's 715 agent.run events: SELF_REVIEW on Opus was 73% of the spend, 0.71 US$ a run against 0.21 for IMPLEMENTING on Sonnet, and 524 triage runs were abandoned in about 2 ms; nothing showed either" }
  - { id: S25, kind: reference, ref: "https://www.deepseek.com/en/harness/", said: "a run's trajectory shows its duration, turn and tool-call counts, its input, model and tools, each turn's messages, and each tool call's payload, result, schema and timing" }
  - { id: S26, kind: reference, ref: "https://code.claude.com/docs/en/headless", said: "--output-format json returns the result, cost and usage; stream-json with --verbose emits every message with its tool_use and tool_result, api_retry and permission_denied events, and a system/init naming the model and tools" }
  - { id: S27, kind: code, ref: "packages/core/src/agent-run.ts", symbol: "AgentRun", said: "a run keeps its outcome, harness, model, tokens, cost, duration and final output; nothing about the turns, tool calls or timing inside it" }
  - { id: S28, kind: decision, said: "each run keeps its trace: its turns, the assistant's messages, and every tool call with its arguments, result and timing, read from what the harness streams. Decided 2026-11-06" }
  - { id: S29, kind: code, ref: "packages/cli/src/paths.ts", said: "packaged profiles keep records and queue under <profile>/ and share daemon.pid and log at Amy home; a project keeps records, queue and log under projects/<hash>/<profile>/, its pid under profiles/<profile>/; auto-update sits under workflows/<profile>/" }
  - { id: S30, kind: decision, said: "a profile's state lives in one directory, workflows/<profile>/: records, queue, pid, log, auto-update, and the shared artifacts when it is a project; projects/<hash>/ and profiles/ go. Decided 2026-11-06" }
  - { id: S31, kind: decision, said: "one directory per profile for everything it owns, its own daemon, pid and log included; what is the machine's (the Slack thread map, plugins, config, leases) stays at Amy home. Decided 2026-11-07" }
  - { id: S32, kind: decision, said: "a trace records the event types the harness plugin knows; a stream line of an unknown type, or one that does not parse, is dropped, never fatal and never the run's outcome. Decided 2026-11-08" }
  - { id: S33, kind: decision, said: "when the move finds the same workId under two old roots, the most recently modified record wins and the other is archived under workflows/<profile>/archived/, named in the move's output. Decided 2026-11-08" }
  - { id: S34, kind: decision, said: "a move whose I/O fails partway leaves the old layout in place and is an internal error, never reported as moved. Decided 2026-11-08" }
touches:
  - packages/core/src/define-workflow.ts
  - packages/core/src/work.ts
  - packages/core/src/agent-run.ts
  - packages/core/src/ports/Harness.ts
  - packages/core/src/ports/EventLog.ts
  - packages/core/events.json
  - packages/core/tests/work.test.ts
  - packages/core/tests/history.property.test.ts
  - examples/workflow-ticket-to-qa/src/machine.ts
  - examples/workflow-ticket-to-qa/src/record.ts
  - packages/core/src/action-ports.ts
  - examples/workflow-ticket-to-qa/src/discussion.ts
  - examples/workflow-ticket-to-qa/tests/machine.test.ts
  - packages/core/tests/action-ports.test.ts
  - plugins/claude/src/ClaudeHarness.ts
  - plugins/codex/src/CodexHarness.ts
  - plugins/codex/tests/CodexHarness.test.ts
  - packages/cli/src/index.ts
  - packages/cli/tests/show.test.ts
  - plugins/claude/tests/ClaudeHarness.test.ts
  - packages/cli/src/paths.ts
  - packages/cli/src/profiles.ts
  - packages/cli/src/auto-update.ts
  - packages/cli/src/update.ts
  - packages/cli/tests/update.test.ts
  - packages/cli/tests/state-move.property.test.ts
  - packages/cli/src/daemon.ts
  - packages/cli/tests/paths.test.ts
criteria:
  - { id: A1, statement: "an advance that carries evidence stores it on the history entry it appends, and a second escalation of the same work shows only its own", proof: "deferred:property:packages/core/tests/history.property.test.ts#first_evidence_never_overwritten", sources: [S4, S8, S9] }
  - { id: A2, statement: "ticket-to-qa's red-gate, unconverged-review and unsettled-thread escalations carry the output that tripped them, and their announcement quotes it and names amy show", proof: "deferred:test:examples/workflow-ticket-to-qa/tests/machine.test.ts", sources: [S2, S3, S10, S11] }
  - { id: A3, statement: "every agent run leaves a file with its output and, for Claude, its session id, and the agent.run event names that file", proof: "deferred:test:packages/core/tests/action-ports.test.ts", sources: [S5, S12, S13] }
  - { id: A4, statement: "a recorded Codex run yields its session id from a structured field, or the plan records that Codex reports none", proof: "deferred:test:plugins/codex/tests/CodexHarness.test.ts", sources: [S14] }
  - { id: A5, statement: "amy show <workId> finds a record in any profile and project without a path, and prints its history with each move's evidence and every run", proof: "deferred:test:packages/cli/tests/show.test.ts", sources: [S1, S6, S15, S16, S21, S23] }
  - { id: A6, statement: "amy ask <workId> answers from the record's evidence and runs, writes nothing outside its own file, and --run resumes the run's own session", proof: "deferred:assertion:mine.an_escalation_can_be_asked_about", sources: [S17, S18, S19, S22] }
  - { id: A7, statement: "a discussion turn in an escalated record's work thread is answered with the escalating move's evidence and the output of the runs that move names, which ran before it", proof: "deferred:assertion:plan.a_discussion_reads_the_evidence", sources: [S7, S20] }
  - { id: A8, statement: "a Claude run's file holds its turns and every tool call with its arguments, result and duration, read from stream-json, and the run answers what the json format answered", proof: "deferred:test:plugins/claude/tests/ClaudeHarness.test.ts", sources: [S25, S26, S27, S28] }
  - { id: A9, statement: "a Codex run's file holds its turns and every tool call, read from the items its app-server emits", proof: "deferred:test:plugins/codex/tests/CodexHarness.test.ts", sources: [S25, S27, S28] }
  - { id: A10, statement: "amy show prints each run's turn and tool-call counts beside its model and cost, and amy show <id> --run <runId> prints that run's trace turn by turn", proof: "deferred:test:packages/cli/tests/show.test.ts", sources: [S24, S25, S28] }
  - { id: A11, statement: "every file of one profile lives under workflows/<profile>/, and amy update moves an install's records, queue, pid, log and artifacts there from where S29 finds them, naming each move", proof: "deferred:test:packages/cli/tests/update.test.ts", sources: [S6, S29, S30] }
  - { id: A12, statement: "for any layout an older install left, a second amy update after the move moves nothing and changes no file", proof: "deferred:property:packages/cli/tests/state-move.property.test.ts#move_again", sources: [S29, S30] }
  - { id: A13, statement: "after the move each packaged profile runs its own daemon with its pid and log in its directory, and the Slack thread map, plugins and config stay at Amy home, read by every profile", proof: "deferred:test:packages/cli/tests/paths.test.ts", sources: [S29, S31] }
  - { id: A14, statement: "a stream holding a line that does not parse and an event of a type the plugin does not know yields the same run outcome and trace as the stream without them", proof: "deferred:test:plugins/claude/tests/ClaudeHarness.test.ts", sources: [S28, S32] }
  - { id: A15, statement: "the same workId under two old roots moves the newer record and archives the older under workflows/<profile>/archived/, naming both", proof: "deferred:test:packages/cli/tests/update.test.ts", sources: [S29, S33] }
  - { id: A16, statement: "for any layout, a write that fails partway through the move leaves every old file where it was and exits as an internal error", proof: "deferred:property:packages/cli/tests/state-move.property.test.ts#a_failed_move_moves_nothing", sources: [S30, S34] }
crosses:
  - { mechanism: profiles-and-state, answer: works, proof: "deferred:A11, A12, A13; each profile keeps its own state, daemon included, under one directory" }
  - { mechanism: install-and-update, answer: works, proof: "deferred:A11, A12" }
  - { mechanism: record-migration, answer: works, proof: "deferred:A1; evidence is optional on an advance, so an older history entry without it still reads" }
  - { mechanism: calls, answer: n/a, why: "advance only gains an optional evidence list; nothing about one workflow calling another changes" }
  - { mechanism: hooks, answer: n/a, why: "advance only gains an optional evidence list; before, after and interrupt are unchanged" }
  - { mechanism: attempts-and-waits, answer: n/a, why: "a run gains an id, a file and a session id; when attempts are charged or given back is unchanged" }
  - { mechanism: agent-replies, answer: works, proof: "deferred:A8, A9; the reply is read from the stream's result as it was from the json envelope" }
  - { mechanism: mount-and-capabilities, answer: works, proof: "deferred:A3; the port that logs agent.run gains the run's file and id, and what an action may reach is unchanged" }
  - { mechanism: tracker-and-host-writes, answer: refused, by: "amy ask is read-only: it never commits, pushes or reaches a mutating port (S18)" }
guarantee:
  - { holds: "amy update moves a profile's state without losing a record or a queued item", not_against: "another process writing the old directories while the move runs" }
  - { holds: "a workId found twice keeps both records, the newer in place and the older archived", not_against: "two records whose modification times are equal: the move picks one by root order and archives the other" }
  - { holds: "each escalation shows only its own evidence", not_against: "a second escalation of the same work" }
  - { holds: "amy ask writes nothing outside its own file", not_against: "--run resuming the failed run's session" }
  - { holds: "keeping a run's trace never changes what the run answered", not_against: "a stream that ends before its result, recorded as the outcome it reached with the trace up to there" }
  - { holds: "a vendor event the plugin does not know never fails a run", not_against: "what that event said: a dropped line is not in the trace" }
cut:
  - "a viewer: not this row; the window draws this once a-record-is-seen-everywhere lands"
  - "changing when work escalates: refused; the ceilings stay where they are, only what an escalation says changes"
  - "the core wording evidence: refused; it stores evidence and words none of it (S9)"
exit: "red-gate escalation names its findings and amy show; amy show <id> prints the trail, no path; amy ask <id> --run <last run> answers from the stopped session; the work thread gets the same findings; nothing moves until its owner decides"
---
# An escalation brings its evidence

An escalation said "did not come together in 3 attempts", and its owner opened a separate agent session to learn why. Everything that agent found was already on disk; nothing amy said pointed at it, and nothing amy offered could talk about it.
