# A strong model reads the review first

The machine answers every automated review with the same hand: the
executor that wrote the code is handed the review
(`address-threads` dispatches to the same `agent` port `implement` uses,
`packages/workflow-ticket-to-qa/src/ports/Agent.ts:40`), reads the
threads through the same `threadPrompt`
(`packages/agent-kit/src/HarnessAgent.ts:211`), and answers or
disagrees — one verdict vocabulary: `fixed` or `disagreed`
(`packages/workflow-ticket-to-qa/src/record.ts:27`).

A review is not always the executor's question to answer. A strong model
that reads the review against the ticket — the body, every question the
machine asked and the answers that came back, the whole conversation,
what has already been done — can decide, per thread, cheaper and better
than the executor can:

- this objection is a misunderstanding, and the answer is a reply on the
  pull request, not a code change;
- this one is real, and the executor should be handed it with the triage
  attached;
- this one was already answered, deferred or settled in an earlier
  round, and re-litigating it is a retry the record cannot account for.

This was found on the Revv workflow (issue #50), which needs a
`review_triage` state: a strong model receiving the bot reviewer's
threads, answering them on GitHub directly or handing off to the
executor. The state itself is Revv's — the seam it needs is amy's, and
the seam is what a second workflow would have to rebuild on its own:
the agent port has no step that reads a review and answers it, and no
way to hand half of a review back while working the other half.

The nearest existing thing is `triage`
(`packages/agent-kit/src/HarnessAgent.ts:51`): reads the ticket and
says whether it can be implemented. The new step is its mirror — reads
the *review* and says what each thread needs. Two shapes that close over
each other are two steps, not one.

## What changes

**The agent port grows `reviewTriage`.** Beside `triage` and
`addressThreads` on `Agent`
(`packages/workflow-ticket-to-qa/src/ports/Agent.ts:13`):

```ts
/**
 * Reads the review and says what each thread needs, without changing
 * any code.
 */
reviewTriage(
  ticket: Ticket,
  threads: readonly ReviewThread[],
  from: "automated" | "human",
  conversation?: readonly string[],
): Promise<AgentResult<ReviewTriageOutcome[]>>;
```

The full context arrives with the call: the ticket body, the tracker
conversation (the questions asked and answered), and the threads with
their replies. `conversation` is optional for the same reason it is on
`triage` and `implement` — an install that never asked anything has
nothing to pass, and the step still works. The outcome is per thread:

```ts
type ReviewTriageOutcome =
  | { threadId: string; verdict: "answer"; reply: string }
  | { threadId: string; verdict: "hand-off"; note: string }
  | { threadId: string; verdict: "already-settled"; note: string };
```

`answer` means the reply is written on the pull request and no code
changes; `hand-off` means the executor gets the thread, with the triage
note attached so the executor's prompt explains *why* it was handed
over; `already-settled` means the record already accounts for this
objection and the thread is closed by the plan's sibling memory, not
re-argued.

**`CORE_ACTIONS` grows `triage-review`.** One entry,
`{ port: "agent", method: "reviewTriage" }`, so a workflow emits it the
way it emits `triage` and the mount refuses a workflow using it without
an agent, by name, at boot (`packages/core/src/actions.ts:21`).

**The relay threads it.** `reviewTriage` is a new step name through the
same ladders: a workflow that wants a strong model reading reviews keys
`ladderByStep: triage-review: [strong-model]` and
`skills: triage-review: [...]`, both legal the moment the action lands
because the step is a core action dispatching to the agent — the check
`parseSkills` already makes (`plugins/agent-relay/src/skills.ts:30`).
The relay's step name for the action is the action's own name, so
nothing in the relay changes.

**The executor hands off with the triage attached.** When the
workflow's state machine splits the threads — some answered by the
triage model, some handed to the executor — the executor's
`addressThreads` receives only the handed-off threads, and its prompt
carries the triage note for each: the objection, and why the strong
model did not answer it itself. The note travels as an optional
companion argument on `Agent.addressThreads`, threaded through the
relay's facade the way `conversation` already is
(`plugins/agent-relay/src/plugin.ts:80`) — an optional argument the
relay does not pass on is a note the executor never sees, which is the
failure the relay e2e scenario exists to catch.

**Replying on the pull request.** An `answer` verdict is a reply inside
the thread, which needs a write the `CodeHost` port does not have. The
sibling plan
([a-review-thread-can-be-replied-to.md](a-review-thread-can-be-replied-to.md))
grows that method; this plan depends on it and orders after it.

**`run-errand`'s generic `ask` does not change.** A workflow that
triages reviews through a plain `ask` prompt keeps working — the new
step is a first-class seam, not a replacement. Revv's `review_triage`
state emits `triage-review` actions; its state machine, its
`hand-off-to-executor` transition and its states stay Revv's own.

## The gate

`ticket-to-qa`, extended — it owns the lifecycle where a review is
answered:

- `review.a_review_is_read_before_the_executor_is_spent`
- `review.an_answerable_objection_is_answered_without_a_code_change`
- `review.a_handoff_carries_the_triage_note_to_the_executor`
- `review.an_already_settled_thread_is_not_re_argued`
- `review.a_thread_without_a_verdict_is_never_dropped`

## Acceptance criteria

- [ ] `reviewTriage` reads ticket, conversation and threads and returns
      a per-thread verdict with the context named in the prompt
      (proof: test:packages/agent-kit/tests/HarnessAgent.test.ts)
- [ ] An `answer` verdict is replied on the pull request and no code
      changes
      (proof: assertion:review.an_answerable_objection_is_answered_without_a_code_change)
- [ ] A `hand-off` verdict reaches the executor with the triage note in
      its prompt
      (proof: assertion:review.a_handoff_carries_the_triage_note_to_the_executor)
- [ ] An `already-settled` verdict is not re-argued by the executor
      (proof: assertion:review.an_already_settled_thread_is_not_re_argued)
- [ ] A thread the triage model returned no verdict for is handed to
      the owner, never dropped
      (proof: assertion:review.a_thread_without_a_verdict_is_never_dropped)
- [ ] A workflow emitting `triage-review` without an agent mounted is
      refused at boot by name
      (proof: test:packages/core/tests/mount.test.ts)

**Exit condition:** a workflow that wants a strong model reading its
reviews before the executor is spent can say so with one action, one
ladder key and one state — and the review it reads arrives with the
whole ticket behind it, every question and answer included.