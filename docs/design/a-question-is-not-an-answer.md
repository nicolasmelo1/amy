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

## What was built

- **The reply.** `Reply` in `packages/core/src/ports/Conversation.ts` gained
  `kind?: ReplyKind`. The core's catalogue gained `discuss`, on the `agent`
  port and dispatched to `ask`, which is what puts it behind the same budget
  as every other run: the engine parks it at the ceiling without knowing what
  it is.
- **The Slack adapter.** A reply is marked by the operator's own reaction on
  it — `white_check_mark` for the decision, `speech_balloon` for a turn in a
  discussion — and by nobody else's; a reply with both is the decision. The
  two names are settings (`decisionReaction`, `discussionReaction`). The
  reactions arrive on the messages `conversations.replies` already returns,
  and every look re-reads them, so a reply marked after it was answered still
  counts. Plain text carries no kind. There are no buttons: a button needs an
  interactivity endpoint or Socket Mode, and this plugin keeps neither.
- **The workflow.** `packages/workflow-ticket-to-qa/src/discussion.ts` is the
  one place a reply is read: as marked, or by `policy.conversation` when
  nobody marked it. `ESCALATED` and `CLARIFYING` both read it the same way: a
  turn nobody answered yet is one `discuss` act; a decision resumes the work.
  What was discussed lives on the record as `discussion`, keyed by the instant
  the wait began, so a later wait starts its own. On the decision the
  escalation keeps the whole discussion, attributed, with the decision last
  and marked as the one that settled it, and the `implement` or
  `address-threads` step it resumes is prompted with it.
- **Read-only, enforced.** The `discuss` step asks with `readOnly` on its
  `AskContext`, and the harness enforces it rather than the prompt: Claude
  runs with `--permission-mode plan`, Codex with `--sandbox read-only`, and
  Hermes, whose one-shot `-z` has no mode that keeps its tools off the
  checkout, refuses the run so a relay hands it to a harness that can.
- **The attempt.** A look that only discussed takes back the attempt the
  engine counted for it, in the workflow's fold. Every other look in a waiting
  state still counts, as it always did.
- **Without a thread.** The runtime reads every reply as the decision when no
  conversation port is mounted, whatever the policy says: a comment on the
  ticket cannot be marked, and only a thread can hold a discussion.

## The gate

`a-question-is-not-an-answer` drives the built engine, workflow and Slack
adapter against an in-process Slack Web API: three questions in the thread
answered there with no move and no attempt counted, then a reaction that
decides, and the resumed step's prompt holding all six messages with the
decision last; then the same under `answer`, where only a reply marked as a
discussion is held back. Beyond the criteria below it holds four more
observations: the look that only discussed counted no attempt
(`escalated.a_discussion_counts_no_attempt`), every discussion ran on the
agent port (`escalated.a_discussion_is_charged_to_the_agent`) and asked it
for a read-only run (`escalated.a_discussion_runs_read_only`), and under
`answer` the first unmarked reply still resumes the work
(`escalated.an_unmarked_reply_under_answer_is_the_decision`).

## Acceptance criteria

- [x] Under `discuss`, a reply in the work thread of an escalated record is
      answered in that thread and the record stays `ESCALATED`
      (proof: assertion:escalated.a_question_does_not_resume)
- [x] Under `discuss`, a decision resumes the record where the escalation
      stopped it (proof: assertion:escalated.a_decision_resumes)
- [x] The step after a decision is prompted with the whole discussion and the
      decision marked last (proof: assertion:conversation.decision_carries_the_discussion)
- [x] A `discuss` run commits nothing and counts no attempt, and is charged to
      the budget (proof: test:packages/workflow-ticket-to-qa/tests/machine.test.ts)
- [x] Under `answer`, a reply marked as a discussion is answered in the
      thread and does not resume the work
      (proof: assertion:escalated.a_marked_discussion_never_resumes)
- [x] Under `answer`, the first unmarked reply resumes the work, as today
      (proof: test:packages/workflow-ticket-to-qa/tests/machine.test.ts)
- [x] The Slack adapter leaves `kind` unset on plain text, and sets it only
      on a reply the person marked (proof: test:plugins/slack/tests/SlackConversation.test.ts)
- [x] An unknown `policy.conversation` value is refused at boot by name
      (proof: test:packages/workflow-ticket-to-qa/tests/plugin.test.ts)

**Exit condition:** under `policy.conversation: discuss`, an escalated record
whose owner asks three questions in the thread gets three answers there and
does not move, and moves on the owner's decision with all six messages in the
prompt of the step it resumes.
