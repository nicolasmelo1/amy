---
sources:
  - { id: S1, kind: code, ref: "packages/workflow-ticket-to-qa/src/agent-steps.ts", said: "address-threads goes to the same agent implement uses, reads threads through the same threadPrompt, and has one verdict vocabulary: fixed or disagreed (record.ts)" }
  - { id: S2, kind: decision, said: "a strong model reading the review against the ticket (body, every question and answer, the whole conversation, what was done) decides per thread cheaper and better than the executor" }
  - { id: S3, kind: decision, said: "per thread: a misunderstanding is answered by a PR reply, not code; a real one goes to the executor with the triage; one already answered, deferred or settled is not re-litigated" }
  - { id: S4, kind: friction, ref: "issue #50", said: "a private workflow needs a review_triage state; the state is that workflow's, the seam is amy's: no agent step reads a review and answers it, or hands half back while working the other half" }
  - { id: S5, kind: code, ref: "packages/workflow-ticket-to-qa/src/agent-steps.ts", said: "the nearest thing is triage: reads the ticket, says whether it can be implemented. The new step is its mirror, reading the review; two shapes that close over each other are two steps" }
  - { id: S6, kind: decision, ref: "packages/workflow-ticket-to-qa/src/agent-steps.ts", said: "the step is built on ask, beside triagePrompt and readTriage: reviewTriagePrompt(ticket, threads, from: \"automated\" | \"human\", conversation?) and readReviewTriage(answer) returning ReviewTriageOutcome[]; it reads the review and changes no code" }
  - { id: S19, kind: reference, ref: "docs/design/an-agent-only-answers.md", said: "the agent port declares ask and nothing else (L0.THE_AGENT_PORT_ONLY_ASKS); a step's prompt and parsing live in the workflow that runs it" }
  - { id: S7, kind: decision, said: "the call carries ticket body, tracker conversation and threads with replies; conversation is optional as on triage and implement, so an install that never asked still works" }
  - { id: S8, kind: decision, said: "ReviewTriageOutcome per thread: { threadId, verdict: \"answer\", reply } | { threadId, verdict: \"hand-off\", note } | { threadId, verdict: \"already-settled\", note }" }
  - { id: S9, kind: decision, said: "answer: reply written on the PR, no code changes. hand-off: executor gets the thread with the note explaining why. already-settled: the record accounts for it; the sibling memory closes the thread" }
  - { id: S10, kind: decision, ref: "packages/core/src/actions.ts", said: "CORE_ACTIONS grows triage-review: { port: \"agent\", method: \"ask\" } (L0.AGENT_ACTIONS_DISPATCH_TO_ASK), emitted like triage; a workflow using it without an agent is refused at boot by name" }
  - { id: S11, kind: code, ref: "plugins/agent-relay/src/skills.ts", said: "ladderByStep: triage-review and skills: triage-review are legal once the action lands, the check parseSkills already makes; the relay's step name is the action's name" }
  - { id: S12, kind: decision, ref: "packages/workflow-ticket-to-qa/src/agent-steps.ts", said: "address-threads' threadPrompt receives only handed-off threads, with each thread's note as an optional companion beside its text, the way conversation is carried" }
  - { id: S13, kind: decision, said: "a note left out of the prompt is a note the executor never sees: the failure the relay e2e scenario exists to catch, now on the prompt ask receives" }
  - { id: S14, kind: reference, ref: "plans/a-review-thread-can-be-replied-to.md", said: "an answer verdict needs a CodeHost reply write; this plan depends on that one and orders after it" }
  - { id: S15, kind: decision, said: "the gate is ticket-to-qa, extended. Assertions: review.a_review_is_read_before_the_executor_is_spent, an_answerable_objection_is_answered_without_a_code_change, a_handoff_carries_the_triage_note_to_the_executor" }
  - { id: S16, kind: decision, said: "the ticket-to-qa gate also asserts review.an_already_settled_thread_is_not_re_argued and review.a_thread_without_a_verdict_is_never_dropped" }
  - { id: S17, kind: reference, ref: "docs/design/a-workflow-is-a-mermaid-diagram.md", said: "the private workflow's review_triage state and hand-off-to-executor edge are a line and an edge in its own workflow.mmd" }
  - { id: S18, kind: reference, ref: "docs/design/a-workflow-is-three-pieces.md", said: "the private workflow's review_triage state emits triage-review actions and is a key in its own decide" }
touches:
  - packages/core/src/actions.ts
  - packages/core/tests/mount.test.ts
  - packages/workflow-ticket-to-qa/src/agent-steps.ts
  - packages/workflow-ticket-to-qa/tests/agent-steps.test.ts
  - .software-factory/policy.yaml
untouched:
  - packages/core/src/ports/Agent.ts   # the port only asks (S19)
criteria:
  - { id: A1, statement: "the triage-review prompt carries ticket, conversation and threads, and its answer is read into a per-thread verdict with the context named in the prompt", proof: "test:packages/workflow-ticket-to-qa/tests/agent-steps.test.ts", sources: [S1, S2, S5, S6, S7, S8, S19] }
  - { id: A2, statement: "an answer verdict is replied on the pull request and no code changes", proof: "assertion:review.an_answerable_objection_is_answered_without_a_code_change", sources: [S3, S9, S14, S15] }
  - { id: A3, statement: "a hand-off verdict reaches the executor with the triage note in its prompt", proof: "assertion:review.a_handoff_carries_the_triage_note_to_the_executor", sources: [S9, S12, S13, S15] }
  - { id: A4, statement: "an already-settled verdict is not re-argued by the executor", proof: "assertion:review.an_already_settled_thread_is_not_re_argued", sources: [S9, S16] }
  - { id: A5, statement: "a thread the triage model returned no verdict for is handed to the owner, never dropped", proof: "assertion:review.a_thread_without_a_verdict_is_never_dropped", sources: [S16] }
  - { id: A6, statement: "a workflow emitting triage-review without an agent mounted is refused at boot by name", proof: "test:packages/core/tests/mount.test.ts", sources: [S4, S10, S11, S17, S18] }
crosses:
  - { mechanism: tracker-and-host-writes, answer: works, proof: "assertion:review.an_answerable_objection_is_answered_without_a_code_change" }
  - { mechanism: mount-and-capabilities, answer: works, proof: "test:packages/core/tests/mount.test.ts" }
  - { mechanism: agent-replies, answer: works, proof: "assertion:review.a_thread_without_a_verdict_is_never_dropped" }
failures:
  - { step: triage-review, when: "the model returns no verdict for a thread", goes_to: "the thread is handed to the owner, never dropped" }
cut:
  - "changing run-errand's generic ask: refused; a workflow triaging reviews through a plain ask keeps working, the new step is a seam, not a replacement"
  - "the private workflow's review_triage state, hand-off-to-executor transition and states: stay its own (a line and edge in its workflow.mmd, a key in its decide)"
  - "any change in the relay's step naming: none; the step name is the action's own name (S11)"
exit: "a workflow wanting a strong model reading its reviews before the executor is spent can say so with one action, one ladder key and one state; the review arrives with the whole ticket behind it, every question and answer included"
---
# A strong model reads the review first

Every automated review is answered by the executor that wrote the code. Many threads are not the executor's question: a misunderstanding wants a reply, a settled objection wants nothing, and spending the executor on them is a retry the record cannot account for.
