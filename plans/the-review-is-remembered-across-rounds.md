# The review is remembered across rounds

The record's verdict on a thread is binary: `fixed` or `disagreed`
(`packages/workflow-ticket-to-qa/src/record.ts:27`), judged once and kept
in `record.judged` so the same comment is never worked twice
(`packages/workflow-ticket-to-qa/src/record.ts:56`). That memory answers
"was this thread ever looked at" — and nothing else.

What it cannot say is what a review actually leaves behind on a real
board:

- *deferred* — the objection is right, the fix is agreed to come later;
  the thread is answered on the pull request and stays open;
- *answered* — replied to in the thread, no code change, and the human
  reviewer's next look sees the reply;
- *won't-fix* — judged, argued once, position stated, not settled;
- *already-settled* — this objection was answered two rounds ago; the
  record has no way to say so, so the executor reads it as new and
  re-litigates it.

The last one is the expensive one. `outstanding` filters threads the
record has judged (`packages/workflow-ticket-to-qa/src/machine.ts:224`),
but a thread *reopened* by a reply — the conversation the sibling plan
carries into the view
([a-reply-inside-a-thread-reaches-the-agent.md](a-reply-inside-a-thread-reaches-the-agent.md))
— is a thread whose opening comment the record already judged, and the
record's memory is keyed by `threadId` alone, so it cannot tell "judged
the opening comment" from "judged everything that was said in it".

This was found on the Revv workflow (issue #50): what was deferred or
answered must be remembered, with the bot reviewer's ticket and all its
answered questions in the Linear thread as context. Revv needs the
memory; the seam — a verdict vocabulary that can say more than
fixed/disagreed, and a memory keyed by more than the thread id — is
amy's, because the record and the `judged` list are amy's.

## What changes

**The verdict vocabulary grows.** `ThreadVerdict.verdict` widens:

```ts
verdict: "fixed" | "disagreed" | "deferred" | "answered" | "wont-fix";
```

with `note` unchanged. `disagreed` keeps its meaning — it goes to the
owner — and the new values are what a review actually leaves behind:
`deferred` (answered now, fix later), `answered` (replied, no code
change), `wont-fix` (position stated, not settled). Every existing
consumer keeps working: `disagreements()` reads `disagreed` only
(`packages/workflow-ticket-to-qa/src/record.ts:80`), and the machine
counts attempts, not verdicts.

**A thread's memory is its last word, not its first.** The `judged`
entry gains the shape of a conversation that has moved on:

```ts
interface JudgedThread {
  threadId: string;
  verdict: ThreadVerdict["verdict"];
  note: string;
  /** The comment the verdict was made against, so a reply is new. */
  judgedUpTo: string;
}
```

`judgedUpTo` is the id of the comment the verdict covered — the opening
comment's id, or the id of the latest reply inside the thread. A thread
whose latest comment is beyond `judgedUpTo` is outstanding again, and
one whose latest comment is at or before it is settled. The reply
carries the conversation the sibling plan already puts in the view;
`judgedUpTo` is the record's half of the same honesty: a memory that
cannot tell a new reply from an old objection is a memory that re-argues
the dead.

**The triage reads the memory.** The strong model that reads a review
first ([a-strong-model-reads-the-review-first.md](a-strong-model-reads-the-review-first.md))
gets the record's memory in its prompt: for each thread, what was
last said and why, so `already-settled` is a verdict it can reach with
the evidence in hand rather than a guess.

**Deferred has a follow-up question.** A `deferred` thread is a promise
with no date on it. The workflow folds it into the record and the
record's escalation surface names it: `deferred` threads are listed
alongside disagreements in whatever the workflow hands the owner, so a
promise the machine made is visible to the person who has to collect
it. The follow-up itself stays workflow policy — whether `deferred`
means "next sprint" or "never" is not amy's question.

## The gate

`ticket-to-qa`, extended — the lifecycle is where a review comes back
round:

- `review.a_deferred_thread_is_listed_for_the_owner`
- `review.an_answered_thread_is_never_worked_twice`
- `review.a_reply_reopens_a_thread_the_record_had_settled`
- `review.a_wontfix_position_is_stated_once_not_re_argued`

## Acceptance criteria

- [ ] The record stores deferred/answered/wont-fix verdicts with their
      note, and `disagreements()` still returns only `disagreed`
      (proof: test:packages/workflow-ticket-to-qa/tests/record.test.ts)
- [ ] A thread whose latest comment is new relative to `judgedUpTo` is
      outstanding again; one at or before it is settled
      (proof: test:packages/workflow-ticket-to-qa/tests/machine.test.ts)
- [ ] A `deferred` thread is listed for the owner with its note
      (proof: assertion:review.a_deferred_thread_is_listed_for_the_owner)
- [ ] A thread replied to after an `answered` verdict is judged again,
      not skipped
      (proof: assertion:review.a_reply_reopens_a_thread_the_record_had_settled)
- [ ] The triage prompt carries the record's memory of each thread
      (proof: test:packages/agent-kit/tests/HarnessAgent.test.ts)
- [ ] No existing state changes behaviour with the widened vocabulary
      (proof: test:packages/workflow-ticket-to-qa/tests/walkthrough.test.ts)

**Exit condition:** what a review settled, deferred or answered is
remembered across rounds with the evidence it was settled on, and a
thread only becomes work again when somebody says something new in it.