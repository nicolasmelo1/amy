# A question is not an answer

When `ticket-to-qa` escalates, it waits for the owner, and the owner's first
message ends the wait. `escalationAnswered` is true the moment the work thread
holds any reply at all
(`packages/workflow-ticket-to-qa/src/runtime.ts:253`), and `planEscalated`
sends the work back to where it stopped on that alone
(`packages/workflow-ticket-to-qa/src/machine.ts:568`). `CLARIFYING` reads the
same way: whatever was said goes back into `triage` as the answer.

So a person who replies "why do you think that comment is wrong?" has not
asked anything. They have answered, and the work starts again on a question.
There is no way to go down the hole of the machine's doubt with it before it
acts — no discussion exists, only a reply. One operator put it plainly: it is
irritating to be asked something in Slack, answer, and watch that answer turn
into work without being asked anything else.

The conversation a person has with an agent while deciding something is not
execution. Each message goes and comes back. The work starts after the
discussion is over, and only when somebody says it is.

## What changes

**A reply is a turn in a discussion, or a decision — or unmarked.** `Reply`
gains an optional `kind?: "discussion" | "decision"`, and the adapter sets it
only when its medium marked one: a button or a reaction in a Slack thread, a
command in a Telegram topic, a "decide and continue" in the window. Text alone
carries no kind. The adapter never guesses one for it, because what unmarked
text means is the workflow's policy, below, and not the adapter's call.

**A discussion is answered in the thread, and moves nothing.** A new catalogue
action, `discuss`, on the `agent` port, dispatching to `ask` like the others.
It runs in the work's checkout, read-only, with the escalation, the record and
the whole thread as context, and posts its answer back through the
conversation. It changes no state, commits nothing and counts no attempt; it is
charged to the budget like any agent run, and a discussion that hits the budget
parks like anything else.

**A decision resumes the work, carrying the discussion.** `escalationAnswered`
becomes "a decision arrived". The prompt the next step gets carries the whole
thread, attributed, with the decision last and marked as the one that settled
it — so the agent acts on what was concluded, not on the first thing said.

**Opt-in, for what nobody marked.** `policy.conversation: answer | discuss`,
`answer` by default, so nothing changes for anybody who does not ask. The
policy decides one thing: how a reply that arrives **unmarked** reads — plain
text in a Slack thread is a decision under `answer`, which is today, and a
discussion under `discuss`. A reply whose adapter marked its kind is read as
marked under either policy: a turn the window posts as a discussion is a
discussion even under `answer`, and gets its answer in the thread. That is
what lets a person discuss from the window without changing how everybody
else's Slack replies are read.

## What does not change

The tracker road. Without a conversation port mounted, a comment on the
ticket is still the answer, because a tracker comment has no way to be marked
a decision and inventing a syntax for one is worse than the current default.

## Acceptance criteria

- [ ] Under `discuss`, a reply in the work thread of an escalated record is
      answered in that thread and the record stays `ESCALATED`
      (proof: deferred:assertion:escalated.a_question_does_not_resume)
- [ ] Under `discuss`, a decision resumes the record where the escalation
      stopped it (proof: deferred:assertion:escalated.a_decision_resumes)
- [ ] The step after a decision is prompted with the whole discussion and the
      decision marked last (proof: deferred:assertion:conversation.decision_carries_the_discussion)
- [ ] A `discuss` run commits nothing and counts no attempt, and is charged to
      the budget (proof: deferred:test:packages/workflow-ticket-to-qa/tests/machine.test.ts)
- [ ] Under `answer`, a reply marked as a discussion is answered in the
      thread and does not resume the work
      (proof: deferred:assertion:escalated.a_marked_discussion_never_resumes)
- [ ] Under `answer`, the first unmarked reply resumes the work, as today
      (proof: deferred:test:packages/workflow-ticket-to-qa/tests/machine.test.ts)
- [ ] The Slack adapter leaves `kind` unset on plain text, and sets it only
      on a reply the person marked (proof: deferred:test:plugins/slack/tests/SlackConversation.test.ts)
- [ ] An unknown `policy.conversation` value is refused at boot by name
      (proof: deferred:test:packages/workflow-ticket-to-qa/tests/plugin.test.ts)

**Exit condition:** under `policy.conversation: discuss`, an escalated record
whose owner asks three questions in the thread gets three answers there and
does not move, and moves on the owner's decision with all six messages in the
prompt of the step it resumes.
