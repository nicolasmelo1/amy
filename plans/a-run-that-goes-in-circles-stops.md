---
base: af5864fcf44077836a3c81ce473f86318dd4cc88
sources:
  - { id: S1, kind: friction, said: "2026-11-12: a Claude run that repeats the same failing call spends its whole turn and timeout before amy sees anything; no-retry-is-free judges only between runs" }
  - { id: S2, kind: reference, ref: "docs/design/no-retry-is-free.md", said: "a run that adds no evidence counts toward budget.progress.maxUnchanged; nothing looks inside one run" }
  - { id: S3, kind: reference, ref: "https://github.com/agentes-chat/agentes-chat/blob/34e66b6a5ca57548c590bbe85a13c30560e199e4/packages/engine/src/stuck.ts", symbol: "STUCK", said: "per step: the same call three times, the same error three times, four steps whose calls all failed, five steps only repeating earlier calls and answers; eight steps remembered" }
  - { id: S4, kind: reference, ref: "https://github.com/agentes-chat/agentes-chat/blob/34e66b6a5ca57548c590bbe85a13c30560e199e4/packages/engine/src/stuck.ts", symbol: "noteStep", said: "results compare with digits and spacing normalised; a judge then tells polls from loops, and the repetition decides when no judge answers" }
  - { id: S5, kind: reference, ref: "plans/claude-says-its-limit-while-it-runs.md", said: "the Claude harness reads stream-json, whose assistant and user lines carry each tool_use and its tool_result" }
  - { id: S6, kind: code, ref: "plugins/codex/src/CodexHarness.ts", symbol: "ask", said: "a harness that reads its CLI while it runs uses the runner's managed spawn and refuses at mount a runner without one" }
  - { id: S7, kind: decision, said: "amy has no judge yet, so a repeated call counts only when its result repeats too: a poll whose answer moves is not stuck. Proposed 2026-11-12" }
  - { id: S8, kind: decision, said: "a run found in circles is ended and reads as failed, its output naming the sign and the repeated call, so no-retry-is-free and the escalation carry it. Proposed 2026-11-12" }
  - { id: S9, kind: decision, said: "the detector is harness-neutral in agent-kit; Claude uses it first, behind stopInCircles, on unless set false. Proposed 2026-11-12" }
  - { id: S10, kind: decision, said: "results compare with spacing normalised only, never digits: with no judge, a number that moved (10%, 20%, 30%) is progress, not a repeat. Proposed 2026-11-12" }
  - { id: S11, kind: reference, ref: "https://github.com/agentes-chat/agentes-chat/blob/34e66b6a5ca57548c590bbe85a13c30560e199e4/apps/server/runner/brain.ts", said: "tool_use blocks arrive in assistant lines and their tool_result in later user lines, matched by tool_use_id; only lines with no parent_tool_use_id are the main run" }
  - { id: S12, kind: reference, ref: "https://github.com/agentes-chat/agentes-chat/blob/34e66b6a5ca57548c590bbe85a13c30560e199e4/apps/server/runner/brain.ts", said: "each assistant line carries message.usage under its message id, repeated across that message's lines, so usage is kept once per message id" }
  - { id: S13, kind: code, ref: "packages/core/src/budget.ts", symbol: "tokensIn", said: "the budget sums each agent.run's tokens; a run with no tokens counts as zero" }
touches:
  - packages/agent-kit/src/circles.ts
  - packages/agent-kit/src/index.ts
  - packages/agent-kit/tests/circles.test.ts
  - packages/agent-kit/tests/circles.property.test.ts
  - plugins/claude/src/steps.ts
  - plugins/claude/src/ClaudeHarness.ts
  - plugins/claude/src/config.ts
  - plugins/claude/src/plugin.ts
  - plugins/claude/tests/ClaudeHarness.test.ts
  - plugins/claude/tests/fixtures/stream-in-circles.jsonl
  - plugins/claude/README.md
  - docs/reference/plugins.md
  - registry/plugin-claude.json
  - docs/concepts/harnesses.md
  - .software-factory/policy.yaml
  - .software-factory/evidence/circles-scenario.sh
criteria:
  - { id: A1, statement: "three steps in a row with the same calls, inputs and results are same_call; the same calls whose result moved, a number included, are not", proof: "deferred:test:packages/agent-kit/tests/circles.test.ts", sources: [S3, S4, S7, S10] }
  - { id: A2, statement: "the same normalised error three times, four steps whose calls all failed, and five steps that only repeat earlier calls and answers each give their sign", proof: "deferred:test:packages/agent-kit/tests/circles.test.ts", sources: [S3, S4] }
  - { id: A3, statement: "for any steps where every call or its result is new, neither same_call nor nothing_new is given; same_error and failing stay A2's", proof: "deferred:property:packages/agent-kit/tests/circles.property.test.ts#results_ignored_for_same_call", sources: [S4, S7] }
  - { id: A4, statement: "for any steps, spacing never makes two results differ, a changed digit always does, and only the last eight steps count", proof: "deferred:property:packages/agent-kit/tests/circles.property.test.ts#digits_normalised_away", sources: [S3, S10] }
  - { id: A5, statement: "the recorded stream in circles ends the Claude child at the step that gives the sign, and the run is failed naming the sign and the call", proof: "deferred:test:plugins/claude/tests/ClaudeHarness.test.ts", sources: [S1, S2, S5, S8] }
  - { id: A6, statement: "a stream that gives no sign, no repeat and no run of failures, runs to its result with the same account as with stopInCircles false", proof: "deferred:test:plugins/claude/tests/ClaudeHarness.test.ts", sources: [S9] }
  - { id: A7, statement: "with stopInCircles on, a runner without managed spawn is refused at mount, naming the setting", proof: "deferred:test:plugins/claude/tests/ClaudeHarness.test.ts", sources: [S6, S9] }
  - { id: A8, statement: "a rejected rate_limit_event still reads as rate-limited when the run is watched live", proof: "deferred:test:plugins/claude/tests/ClaudeHarness.test.ts", sources: [S5] }
  - { id: A10, statement: "a step completes when every tool_use of an assistant message has its tool_result by tool_use_id; a subagent's lines never join the main run's steps", proof: "deferred:test:plugins/claude/tests/ClaudeHarness.test.ts", sources: [S5, S11] }
  - { id: A11, statement: "a run ended before its result is charged once with the usage of every assistant message so far, one per message id, and no cost", proof: "deferred:test:plugins/claude/tests/ClaudeHarness.test.ts", sources: [S12, S13] }
  - { id: A9, statement: "the built plugin, in another process, ends a stand-in claude replaying the recording at the sign's step, and kills nothing for a clean recording", proof: "assertion:claude.a_run_in_circles_is_ended", sources: [S1, S8] }
crosses:
  - { mechanism: agent-replies, answer: works, proof: "deferred:A5, A6, A8" }
  - { mechanism: attempts-and-waits, answer: works, proof: "deferred:A5; an ended run charges its attempt like any failed one" }
  - { mechanism: budget-and-evidence, answer: works, proof: "deferred:A11; the tokens of every message before the end are charged once, and A5's output is the evidence" }
guarantee:
  - { holds: "a Claude run repeating calls whose results do not move is ended at the step the repetition shows", not_against: "a poll whose answer is identical each time, ended though it was waiting: set stopInCircles false" }
  - { holds: "a run that gives no sign is unchanged", not_against: "the cost of reading the stream live" }
  - { holds: "a run ended in circles is charged the tokens it spent", not_against: "a message Claude had not yet reported usage for when the run was ended" }
failures:
  - { step: watch, when: "a stream line is not JSON, or carries neither a tool_use nor a tool_result", goes_to: "skipped by the detector only; the run parser still reads it, result and rate_limit_event included" }
  - { step: end, when: "the child does not exit after the kill", goes_to: "the run's timeout ends it, as today" }
cut:
  - "telling the agent it is stuck and letting it go on: amy cannot speak to a print-mode run"
  - "a judge between poll and loop: once a decision model is mounted"
  - "Codex and Hermes: each can use the detector in its own plan"
exit: "a Claude run that makes the same failing call with the same answer three times is ended at the third, and its record says failed, naming the call"
---
# A run that goes in circles stops

A Claude run can repeat the same failing call until its turn or timeout runs
out, and amy only notices between runs. Once stream-json is in, the harness
can watch each step. It ends a run at the step where the repetition shows,
using thresholds agentes.chat already tuned.
