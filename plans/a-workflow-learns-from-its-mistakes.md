---
base: 74afab335475eb68924358c6b440f0bf2dfa2a61
sources:
  - { id: S1, kind: friction, said: "2026-11-05: amy already keeps what went wrong, but nothing helps a workflow improve itself; a cheap model makes the same mistakes almost every run, so even a minimal self-improvement, or recommendations along the way, is wanted" }
  - { id: S2, kind: reference, ref: "https://factory.com/news/frontier-harness", said: "Factory's Agent Factory loop tests each proposed harness change as a controlled experiment before an engineer merges it" }
  - { id: S3, kind: reference, ref: "https://docs.warp.dev/factories/how-factories-work.md", said: "Warp's scorers classify finished runs, flagged failures become proposed changes a person merges, and benchmarks compare configurations on the same tasks" }
  - { id: S4, kind: reference, ref: "plans/an-escalation-brings-its-evidence.md", said: "an advance carries evidence { source, text, at } on the history entry it appends, beside the ids of the runs made in the state it leaves" }
  - { id: S5, kind: reference, ref: "plans/a-review-finding-outlives-the-review.md", said: "review and self-review findings survive finished work in one corpus, grouped by source, path and symbol; no machine surface fills a finding's human verdict or evidence" }
  - { id: S6, kind: code, ref: "packages/agent-kit/src/HarnessRelay.ts", symbol: "ask", said: "every agent step reaches the relay with its step name in the context, and the relay chooses the skill and the rung for it" }
  - { id: S7, kind: reference, said: "the plan a question carries its answers (PR 162, not yet on main): a question can carry approve or reject, and the press comes back typed as a decision" }
  - { id: S8, kind: decision, said: "a mistake is a signature counted from what amy already keeps: the step, the rung's agent name, and the evidence source with its first line normalised, or a finding's group key; nothing new is recorded to find one" }
  - { id: S9, kind: decision, said: "every N settled records, ten by default, and on amy lessons distil, signatures seen at least three times in that window are handed to a read-only agent run that writes one short lesson per signature" }
  - { id: S10, kind: decision, said: "a lesson is only proposed: it reaches the operator as an approve or reject ask, or as numbered text where the conversation cannot ask, and nothing is applied until approved" }
  - { id: S11, kind: decision, said: "an approved lesson is prepended by the relay to the prompt of its step, for its agent name only; decide() and the diagram never read a lesson" }
  - { id: S12, kind: decision, said: "lessons are one file per profile under the state directory, readable and editable by hand; the file is the truth and the relay reads it on every ask" }
  - { id: S13, kind: decision, said: "a lesson counts its signature over the next M runs of its step and agent, ten by default; if it recurred as often as before, removal is proposed the same way" }
  - { id: S14, kind: decision, said: "a signature whose fix is code, not a prompt, is proposed as an amy note instead, which becomes a plan in the repository it is about" }
  - { id: S15, kind: decision, said: "a distilling run is asked only after the budget check the worker applies passes; refused, both the automatic and the manual trigger defer and call no agent. Decided 2026-11-05" }
  - { id: S16, kind: friction, said: "one install's 715 agent.run events: SELF_REVIEW on Opus was 73% of the spend, 0.71 US$ a run against 0.21 for IMPLEMENTING on Sonnet, and 524 triage runs were abandoned in about 2 ms; nothing showed either" }
  - { id: S17, kind: decision, said: "amy records spend per step and per model and shows it: runs, cost, duration, output tokens and runs not completed, read from the agent.run events it already writes. Decided 2026-11-06" }
  - { id: S18, kind: reference, ref: "plans/an-escalation-brings-its-evidence.md", said: "each agent run keeps its trace beside the record: turns, messages, and every tool call with its arguments, result and timing" }
  - { id: S19, kind: reference, ref: "https://www.deepseek.com/en/harness/", said: "a run's trajectory shows its duration, turn and tool-call counts, its input, model and tools, each turn's messages, and each tool call's payload, result, schema and timing" }
touches:
  - packages/core/src/ports/Lessons.ts
  - packages/core/src/index.ts
  - packages/core/tests/ports.test.ts
  - plugins/file-lessons/**
  - packages/agent-kit/src/HarnessRelay.ts
  - packages/agent-kit/src/lessons.ts
  - packages/agent-kit/src/index.ts
  - packages/agent-kit/tests/lessons.test.ts
  - packages/agent-kit/tests/lessons.property.test.ts
  - plugins/agent-relay/src/plugin.ts
  - plugins/agent-relay/src/config.ts
  - packages/cli/src/index.ts
  - packages/cli/tests/lessons.test.ts
  - docs/concepts/harnesses.md
  - packages/cli/src/budget.ts
  - packages/cli/tests/budget.test.ts
criteria:
  - { id: A1, statement: "the same gate finding at implement on hermes:glm in three of ten settled records yields one signature with count three; two different steps never share one", proof: "deferred:property:packages/agent-kit/tests/lessons.property.test.ts#signatures_merge_across_steps", sources: [S4, S5, S8] }
  - { id: A2, statement: "after the tenth settled record, or on amy lessons distil, a signature seen three times gets one lesson written by a read-only run, and none below three", proof: "deferred:test:packages/agent-kit/tests/lessons.test.ts", sources: [S1, S2, S3, S9] }
  - { id: A3, statement: "a proposed lesson changes no prompt until the operator approves it, and a rejected one is never proposed again for the same signature", proof: "deferred:test:packages/cli/tests/lessons.test.ts", sources: [S7, S10] }
  - { id: A4, statement: "an approved lesson appears at the head of its step's prompt for its agent name, and in no other step or agent's prompt", proof: "deferred:property:packages/agent-kit/tests/lessons.property.test.ts#a_lesson_leaks_to_another_rung", sources: [S6, S11] }
  - { id: A5, statement: "a lesson edited or deleted in the file changes the next ask without a restart", proof: "deferred:test:packages/agent-kit/tests/lessons.test.ts", sources: [S12] }
  - { id: A6, statement: "a lesson whose signature recurred as often in the next ten runs as before it is proposed for removal; one that dropped is kept", proof: "deferred:test:packages/agent-kit/tests/lessons.test.ts", sources: [S13] }
  - { id: A7, statement: "a signature the distilling run marks as a code fix becomes a proposed amy note, never a lesson", proof: "deferred:test:packages/cli/tests/lessons.test.ts", sources: [S14] }
  - { id: A8, statement: "with the budget refusing, the tenth settled record and amy lessons distil both defer the distilling run and no agent is called", proof: "deferred:test:packages/cli/tests/lessons.test.ts", sources: [S15] }
  - { id: A9, statement: "amy budget breaks spend down by step and model, with runs, cost, duration, output tokens and runs not completed, from the agent.run events alone", proof: "deferred:test:packages/cli/tests/budget.test.ts", sources: [S16, S17] }
  - { id: A10, statement: "runs of one step and agent that end not completed are a signature, so a step abandoned in hundreds of runs is one proposal, not none", proof: "deferred:test:packages/agent-kit/tests/lessons.test.ts", sources: [S8, S16] }
  - { id: A11, statement: "the same tool call failing in the same step across the window's settled records is a signature, read from the runs' traces", proof: "deferred:property:packages/agent-kit/tests/lessons.property.test.ts#tool_failures_merge_across_steps", sources: [S18, S19] }
crosses:
  - { mechanism: agent-replies, answer: works, proof: "deferred:A2; an empty or malformed distilling reply writes no lesson" }
  - { mechanism: attempts-and-waits, answer: n/a, why: "distilling is a read-only run outside any record; it charges no attempt and gives none back" }
  - { mechanism: tracker-and-host-writes, answer: n/a, why: "Lessons.ts is a new port that writes only the profile's lessons file; no tracker or code-host write is added" }
  - { mechanism: budget-and-evidence, answer: works, proof: "deferred:A8; evidence is read, never written, and a distilling run passes the budget check before it is asked" }
guarantee:
  - { holds: "no lesson reaches a prompt without the operator's approval", not_against: "a person writing a lesson into the file by hand" }
  - { holds: "learning never changes decide(), the diagram, a ladder or a policy", not_against: "a recommendation the operator turns into code through an amy note" }
  - { holds: "no finding's human verdict or evidence is written by distilling", not_against: "the operator adjudicating a finding through its own boundary" }
failures:
  - { step: distil, when: "the distilling run fails or returns no lesson", goes_to: "nothing proposed; the window is read again at the next trigger" }
  - { step: ask, when: "the lessons file is unreadable", goes_to: "the prompt goes as it would without lessons, and amy doctor names the file" }
cut:
  - "measured A/B of prompts, models or graphs on replayed work: later, a benchmarks plan"
  - "a lesson applied without approval"
  - "lessons shared between installs"
exit: "after ten settled pieces of work where hermes:glm left the same gate finding three times, the operator approves one proposed lesson, the next implement prompt for that rung starts with it, and ten runs later amy says whether it helped"
---
# A workflow learns from its mistakes

amy keeps what went wrong (evidence on history, findings, events) and does
nothing with it. A recurring mistake becomes a proposed lesson for one step and
one model, applied only when the operator approves it and dropped when it does
not help.
