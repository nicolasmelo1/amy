---
sources:
  - { id: S1, kind: code, ref: "packages/core/src/ports/CodeHost.ts", said: "no CodeHost method writes a reply inside a review thread; the machine can judge and fix an objection but not answer it where it was raised" }
  - { id: S2, kind: code, ref: "packages/workflow-ticket-to-qa/src/machine.ts", said: "every answer owed a reviewer is fix-and-push or escalate to the owner; a misunderstanding costs an executor run, a deferred objection cannot be recorded as answered" }
  - { id: S3, kind: reference, ref: "plans/a-strong-model-reads-the-review-first.md", said: "that plan's answer verdict has nowhere to put its reply without this write" }
  - { id: S4, kind: friction, ref: "issue #49", said: "found on a private workflow; every workflow that runs address-threads needs the same write and today escalates where a reply would do" }
  - { id: S5, kind: decision, said: "CodeHost gains replyToReviewThread(threadId: string, body: string): Promise<void>, replying inside a review thread once per call" }
  - { id: S6, kind: code, ref: "plugins/github/src/GitHubCodeHost.ts", said: "ReviewThread.id is already the GraphQL node id (id: thread.id), so the reply is one gh api graphql addPullRequestReviewThreadReply(input: {threadID, body}) mutation" }
  - { id: S7, kind: decision, ref: "packages/core/src/actions.ts", said: "CORE_ACTIONS grows reply-review-thread: { port: \"code-host\", method: \"replyToReviewThread\" }, emitted like resolve-review-thread; a mount that cannot run it is refused at boot by name" }
  - { id: S8, kind: reference, ref: "docs/design/the-threads-close-when-they-are-answered.md", said: "who may reply and what the reply says is workflow policy; the port makes the write possible and the catalogue names it" }
  - { id: S9, kind: decision, said: "gate: ticket-to-qa, extended; assertions thread.a_reply_lands_inside_the_thread_it_answers, thread.a_reply_reaches_the_thread_conversation_on_the_next_look, thread.a_thread_with_no_open_objection_is_not_replied_to" }
touches:
  - packages/core/src/ports/CodeHost.ts
  - packages/core/src/actions.ts
  - packages/core/tests/mount.test.ts
  - plugins/github/src/GitHubCodeHost.ts
  - plugins/github/tests/GitHubCodeHost.test.ts
  - packages/test-fixtures/src/fakes.ts
  - packages/workflow-ticket-to-qa/tests/plugin.test.ts
  - .software-factory/policy.yaml
criteria:
  - { id: A1, statement: "replyToReviewThread writes a reply inside a thread by its id in one call", proof: "test:plugins/github/tests/GitHubCodeHost.test.ts", sources: [S1, S5, S6] }
  - { id: A2, statement: "the core dispatches reply-review-thread to the code-host port", proof: "test:packages/workflow-ticket-to-qa/tests/plugin.test.ts", sources: [S2, S4, S7, S8] }
  - { id: A3, statement: "a reply appears in the thread's conversation on the next observation", proof: "assertion:thread.a_reply_reaches_the_thread_conversation_on_the_next_look", sources: [S3, S9] }
  - { id: A4, statement: "a mount without the code-host port refuses a workflow using the action, by name, at boot", proof: "test:packages/core/tests/mount.test.ts", sources: [S7] }
crosses:
  - { mechanism: tracker-and-host-writes, answer: works, proof: "test:packages/core/tests/mount.test.ts" }
  - { mechanism: mount-and-capabilities, answer: works, proof: "test:packages/core/tests/mount.test.ts" }
failures:
  - { step: replyToReviewThread, when: "the implementor cannot reply (a forge with no thread concept)", goes_to: "it throws; the action fails named, at boot, by the workflow that used it" }
cut:
  - "reply policy (who may reply, what it says) in the port or catalogue: out of scope, workflow policy (S8)"
exit: "a workflow that owes a reviewer an answer can write it where the reviewer asked it, and the next look reads it back as part of the conversation"
---
# A review thread can be replied to

The machine can judge and fix a reviewer's objection but cannot say one sentence back inside the thread it came in, so every answer is an action at a distance: a push, or an escalation.
