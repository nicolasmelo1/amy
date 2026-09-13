# The threads close when they are answered

Delivered. The record of this decision is this document; what proves it is
the `ticket-to-qa` gate for the lifecycle, and the unit suite for the port,
the adapter and the machine. The plan that came before kept the argument;
what it promised is the acceptance criteria at the end.

## What was wrong

`CodeHost` mounted five methods and none of them closed a thread
(`packages/core/src/ports/CodeHost.ts`). So a workflow state whose exit is
"no thread is unresolved" had an exit no effect it could emit would ever
bring about. What such a state did instead, on a real board, was send an
agent to fix the code, look again, see the same open thread, count an
attempt, and repeat until the ceiling — then write an escalation that read
as the agent failing at the work rather than as a missing button. Three
tickets on one install did exactly that, having had their code fixed each
round.

The same shape was one state away here: `COPILOT_FIX` exited when every
automated thread had been *judged* — and a judged thread is one the record
has an opinion about, not one the forge agrees is settled.

## What changed

The port grows two methods, one id and one call each:

```ts
resolveReviewThread(threadId: string): Promise<void>
unresolveReviewThread(threadId: string): Promise<void>
```

`ReviewThread.id` was already the GraphQL node id, so the caller had
everything it needed. `unresolveReviewThread` mounts beside its twin
because a machine that closed a thread on a fix that later got reverted
should be able to put it back. The action catalogue grows one entry,
`"resolve-review-thread": { port: "code-host", method: "resolveReviewThread" }`,
so a workflow emits it the way it emits `open-pull-request`, and a mount
that cannot run it is refused at boot by name.

**Who may close what is the workflow's policy, not the port's.** This
machine closes the automated reviewer's threads once it has answered them,
and never a colleague's — only the author of an objection decides it is
settled, so a human thread stays open for the human to close, and
`HUMAN_FIX` does not emit the effect at all. The port only had to make it
possible.

The move, inside `COPILOT_FIX`: threads the record already judged `fixed`
and the forge still holds open get one act of `resolve-review-thread` each;
the next look sees them resolved and the state leaves the way its exit
condition says it does. The pool the move draws from is
`unresolvedThreads(pr, "automated")` — the forge's own threads — not the
judged remainder of `outstanding()`, because a thread the record judged
leaves `outstanding()` and reading only there was the very gap this work
closed.

The stand-in `gh` learned the mutations the way it learned every other
call: it answers them against the world's own state, flipping `isResolved`
on the thread the id names and logging the call. Its first draft answered
with JSON inside JSON — pre-stringified where the query branch returned an
object — which the adapter rightly refused as "no data"; the stand-in now
returns what every other branch returns, and the scenario proves the
mutation reached the forge and the thread closed.

## The gate

`ticket-to-qa`, extended. The world's forge does not settle a conversation
because the code changed, which is what makes the assertion mean what it
says:

- `lifecycle.the_thread_the_machine_answered_is_closed` — the thread the
  machine answered (`BOT-1`) reads resolved afterwards, by exactly one
  `resolveReviewThread` mutation, and no human thread (`HUM-1`) was ever
  sent one.

The walkthrough test proves the same shape at the unit level: a ticket that
would have escalated at the ceiling now leaves `COPILOT_FIX` because
nothing is unresolved, and the two-look dance (close, then see it closed)
is driven purely.

## Acceptance criteria

- [x] `resolveReviewThread` closes a thread by its id in one call
      (proof: test:plugins/github/tests/GitHubCodeHost.test.ts)
- [x] `unresolveReviewThread` puts back what a reverted fix had closed
      (proof: test:plugins/github/tests/GitHubCodeHost.test.ts)
- [x] The core dispatches `resolve-review-thread` to the code-host port
      (proof: test:packages/workflow-ticket-to-qa/tests/plugin.test.ts)
- [x] A thread the agent answered is closed by the machine, and the next
      look sees it closed
      (proof: test:packages/workflow-ticket-to-qa/tests/machine.test.ts)
- [x] A colleague's thread is never closed by the machine, however it was
      judged (proof: test:packages/workflow-ticket-to-qa/tests/machine.test.ts)
- [x] `COPILOT_FIX` leaves because no automated thread is unresolved, not
      because the attempts ran out
      (proof: test:packages/workflow-ticket-to-qa/tests/walkthrough.test.ts)

**Exit condition:** a state whose exit is "no automated thread unresolved"
reaches that exit — the threads it answered are closed, and the ceiling is
for work that is genuinely stuck. Sealed in the `ticket-to-qa` gate, where
the forge keeps the thread open after the fix, the machine closes it by id
in one mutation, the next look reads it resolved, and the state leaves
through its exit condition with the attempts unspent.