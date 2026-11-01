---
sources:
  - { id: S1, kind: code, ref: "packages/workflow-ticket-to-qa/src/record.ts", said: "a thread verdict is fixed or disagreed, judged once and kept in record.judged so a comment is never worked twice; it answers only 'was this thread ever looked at'" }
  - { id: S2, kind: friction, said: "a real review leaves deferred (right, fix later, answered and open), answered (replied, no code change), won't-fix (argued once, not settled) and already-settled — answered rounds ago, re-litigated as new" }
  - { id: S3, kind: code, ref: "packages/workflow-ticket-to-qa/src/machine.ts", said: "outstanding filters judged threads; memory keyed by threadId alone cannot tell a thread reopened by a reply from one whose every comment was judged" }
  - { id: S4, kind: reference, ref: "docs/design/a-reply-inside-a-thread-reaches-the-agent.md", said: "the delivered sibling carries a reply inside a thread into the view; judgedUpTo is the record's half of that" }
  - { id: S5, kind: ticket, ref: "issue #50", said: "found on a private workflow: what was deferred or answered must be remembered, with the bot reviewer's ticket and its answered Linear-thread questions as context; the seam is amy's, since the record and judged are" }
  - { id: S6, kind: decision, said: "ThreadVerdict.verdict widens to \"fixed\" | \"disagreed\" | \"deferred\" | \"answered\" | \"wont-fix\", note unchanged; disagreed still goes to the owner" }
  - { id: S7, kind: code, ref: "packages/workflow-ticket-to-qa/src/record.ts", said: "every consumer keeps working: disagreements() reads disagreed only, and the machine counts attempts, not verdicts" }
  - { id: S8, kind: decision, said: "the judged entry becomes JudgedThread { threadId; verdict: ThreadVerdict[\"verdict\"]; note; judgedUpTo: string } — judgedUpTo the id of the comment the verdict covered, opening or latest reply" }
  - { id: S9, kind: decision, said: "a thread whose latest comment is beyond judgedUpTo is outstanding again; at or before it, settled" }
  - { id: S10, kind: reference, ref: "plans/a-strong-model-reads-the-review-first.md", said: "its triage gets the record's memory in its prompt — per thread, what was last said and why — so already-settled is reached with evidence, not guessed" }
  - { id: S11, kind: decision, said: "deferred threads are listed alongside disagreements in whatever the workflow hands the owner, so a promise the machine made is visible to who collects it" }
  - { id: S12, kind: decision, said: "gate ticket-to-qa extended; it also asserts review.an_answered_thread_is_never_worked_twice and review.a_wontfix_position_is_stated_once_not_re_argued" }
touches:
  - packages/workflow-ticket-to-qa/src/record.ts
  - packages/workflow-ticket-to-qa/src/machine.ts
  - packages/workflow-ticket-to-qa/src/review.ts
  - packages/workflow-ticket-to-qa/src/agent-steps.ts
  - packages/workflow-ticket-to-qa/tests/record.test.ts
  - packages/workflow-ticket-to-qa/tests/machine.test.ts
  - packages/workflow-ticket-to-qa/tests/walkthrough.test.ts
  - packages/workflow-ticket-to-qa/tests/agent-steps.test.ts
  - .software-factory/evidence/ticket-to-qa-scenario.sh
  - .software-factory/policy.yaml
criteria:
  - { id: A1, statement: "the record stores deferred/answered/wont-fix verdicts with their note, and disagreements() still returns only disagreed", proof: "test:packages/workflow-ticket-to-qa/tests/record.test.ts", sources: [S1, S2, S5, S6, S7] }
  - { id: A2, statement: "a thread whose latest comment is new relative to judgedUpTo is outstanding again; one at or before it is settled", proof: "test:packages/workflow-ticket-to-qa/tests/machine.test.ts", sources: [S3, S8, S9] }
  - { id: A3, statement: "a deferred thread is listed for the owner with its note", proof: "assertion:review.a_deferred_thread_is_listed_for_the_owner", sources: [S11, S12] }
  - { id: A4, statement: "a thread replied to after an answered verdict is judged again, not skipped", proof: "assertion:review.a_reply_reopens_a_thread_the_record_had_settled", sources: [S4, S9, S12] }
  - { id: A5, statement: "the triage prompt carries the record's memory of each thread", proof: "test:packages/workflow-ticket-to-qa/tests/agent-steps.test.ts", sources: [S10] }
  - { id: A6, statement: "no existing state changes behaviour with the widened vocabulary", proof: "test:packages/workflow-ticket-to-qa/tests/walkthrough.test.ts", sources: [S7, S12] }
crosses:
  - { mechanism: record-migration, answer: works, proof: "deferred:A6" }
  - { mechanism: agent-replies, answer: works, proof: "deferred:test:packages/workflow-ticket-to-qa/tests/agent-steps.test.ts; readVerdicts reads the five verdicts of S6, and disagreed still reaches the owner" }
cut:
  - "the follow-up on a deferred thread: workflow policy; whether deferred means next sprint or never is not amy's question"
exit: "what a review settled, deferred or answered is remembered across rounds with the evidence it was settled on, and a thread only becomes work again when somebody says something new in it"
---
# The review is remembered across rounds

The record remembers only that a thread was looked at, keyed by thread id, so an
objection answered rounds ago reads as new and is re-argued.
