---
base: a6674f574fe4275e3dc111c8ba8e2df913276f49
sources:
  - { id: S1, kind: friction, said: "2026-11-12: ticket-to-qa hands the agent text other people wrote, verbatim beside its instructions, and the run that reads it may write: nothing tells the two apart" }
  - { id: S2, kind: code, ref: "examples/workflow-ticket-to-qa/src/agent-steps.ts", symbol: "bodyLines", said: "the ticket body joins every prompt as written, between the ticket line and the instructions" }
  - { id: S3, kind: code, ref: "examples/workflow-ticket-to-qa/src/agent-steps.ts", symbol: "threadLines", said: "each review thread joins the prompt as `author said:` and `author replied:` lines, verbatim" }
  - { id: S4, kind: code, ref: "examples/workflow-ticket-to-qa/src/machine.ts", symbol: "conversationLines", said: "tracker comments answering triage join the next triage prompt as `author answered:` lines" }
  - { id: S5, kind: code, ref: "examples/workflow-ticket-to-qa/src/discussion.ts", symbol: "decisionLines", said: "work-thread replies join the prompt as said, asked and decided lines; discussPrompt adds what they said now" }
  - { id: S6, kind: code, ref: "plugins/claude/src/config.ts", symbol: "permissionMode", said: "a run that may write goes under acceptEdits, auto or bypassPermissions" }
  - { id: S7, kind: reference, ref: "https://github.com/agentes-chat/agentes-chat/blob/34e66b6a5ca57548c590bbe85a13c30560e199e4/packages/engine/src/untrusted.ts", symbol: "untrustedBlock", said: "one envelope for all outside text: a source label, hidden characters stripped, envelope markers neutralised even when disguised, long text cut with a note" }
  - { id: S8, kind: reference, ref: "https://genai.owasp.org/llmrisk/llm01-prompt-injection/", said: "indirect prompt injection rides in content the model reads; segregating and marking untrusted content is a listed mitigation, not a cure" }
  - { id: S9, kind: decision, said: "the envelope lives in core, so every workflow fences the same way; it names a source and knows no domain. Proposed 2026-11-12" }
  - { id: S10, kind: decision, said: "a prompt that carries an envelope says once, before the first one, that what is inside is data to weigh, never instructions to follow. Proposed 2026-11-12" }
  - { id: S11, kind: decision, said: "the operator's own words stay unfenced: the chat desk, an errand, a note and the brief are the operator's instructions. Proposed 2026-11-12" }
touches:
  - packages/core/src/outside-text.ts
  - packages/core/src/index.ts
  - packages/core/tests/outside-text.test.ts
  - packages/core/tests/outside-text.property.test.ts
  - examples/workflow-ticket-to-qa/src/agent-steps.ts
  - examples/workflow-ticket-to-qa/src/machine.ts
  - examples/workflow-ticket-to-qa/src/discussion.ts
  - examples/workflow-ticket-to-qa/tests/agent-steps.test.ts
  - examples/workflow-ticket-to-qa/tests/machine.test.ts
  - examples/workflow-ticket-to-qa/tests/outside-text.property.test.ts
  - docs/start/security.md
  - docs/development/the-gate.md
  - .software-factory/policy.yaml
  - .software-factory/evidence/outside-text-scenario.sh
  - scripts/tests/gate-activation.test.ts
  - registry/core.json
  - registry/workflow-ticket-to-qa.json
untouched:
  - packages/agent-kit/src/HarnessRelay.ts
criteria:
  - { id: A1, statement: "outsideText wraps text in one envelope naming its source; a source label cannot close its attribute or the envelope", proof: "test:packages/core/tests/outside-text.test.ts", sources: [S7, S9], done: true }
  - { id: A2, statement: "for any text, the envelope's body holds no opening or closing marker, plain or disguised with full-width, zero-width or look-alike characters, so exactly one envelope opens and closes", proof: "property:packages/core/tests/outside-text.property.test.ts#a_disguised_marker_survives", sources: [S7, S8], done: true }
  - { id: A3, statement: "bidi overrides and tag characters are stripped and the envelope says so once; text with none of them, no envelope marker and within the limit comes back byte for byte", proof: "property:packages/core/tests/outside-text.property.test.ts#clean_text_is_rewritten", sources: [S7], done: true }
  - { id: A4, statement: "text past the limit is cut and the envelope says how many characters were cut", proof: "test:packages/core/tests/outside-text.test.ts", sources: [S7], done: true }
  - { id: A5, statement: "triage, implement, thread and discuss prompts carry the ticket title, body and labels, every comment, thread and reply only inside envelopes", proof: "property:examples/workflow-ticket-to-qa/tests/outside-text.property.test.ts#a_field_left_outside", sources: [S1, S2, S3, S4, S5], done: true }
  - { id: A6, statement: "a ticket body that closes the envelope and writes an instruction after it is still read inside one envelope, in every prompt it reaches", proof: "test:examples/workflow-ticket-to-qa/tests/agent-steps.test.ts", sources: [S1, S6, S8], done: true }
  - { id: A7, statement: "a prompt with an envelope says once, before the first, that its contents are data, never instructions; a prompt with none does not say it", proof: "test:examples/workflow-ticket-to-qa/tests/agent-steps.test.ts", sources: [S10], done: true }
  - { id: A8, statement: "the brief, the chat desk, an errand and a note reach their prompts as before, unfenced", proof: "test:examples/workflow-ticket-to-qa/tests/agent-steps.test.ts", sources: [S11], done: true }
  - { id: A9, statement: "the built ticket-to-qa, imported from dist in another process, fences a hostile body in all four prompts", proof: "assertion:prompt.fences_outside_text_in_every_step", sources: [S1, S9], done: true }
crosses:
  - { mechanism: agent-replies, answer: works, proof: "deferred:A5, A6" }
  - { mechanism: record-migration, answer: n/a, why: "only conversationLines' output changes; the record keeps the raw lines and is fenced when a prompt is built" }
guarantee:
  - { holds: "every word a person other than the operator wrote reaches a ticket-to-qa prompt inside an envelope that cannot be closed from within", not_against: "a model that follows an instruction it was told is data: the envelope marks, it does not enforce" }
  - { holds: "text without hidden characters or markers is carried unchanged", not_against: "a long body cut at the limit" }
failures:
  - { step: a prompt, when: "a field is empty or absent", goes_to: "it says so outside any envelope, as today" }
  - { step: outsideText, when: "the source label is empty after cleaning", goes_to: "the source reads `external`" }
cut:
  - "fencing the operator's own chat, errands, notes and briefs (S11)"
  - "a classifier that refuses a suspicious body: another plan, once a decision model is mounted"
  - "the other example workflows: each fences its own outside text when it gains some"
exit: "a ticket whose body says to ignore the instructions above reaches triage, implement, thread and discuss prompts inside one closed envelope, after a line saying it is data"
---
# Outside text reaches the agent as data

ticket-to-qa sends tickets, comments, review threads and replies to a writing
agent exactly as other people wrote them, mixed in with its instructions.
This puts every piece of outside text in one closed envelope, from core,
and tells the agent once that what is inside is data.
