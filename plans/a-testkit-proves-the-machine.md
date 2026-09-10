# A testkit proves the machine

[A workflow is yours, not a package](a-workflow-is-yours-not-a-package.md)
gives somebody a workflow that runs. This is what keeps it running.

A workflow package is two halves. One is the domain — which states exist, what
each one means, when work moves. That half is the author's and no harness can
check it. The other half is machine-shaped and identical in every workflow
anybody will ever write:

- every state is reachable, and every state has a way out
- every action a plan emits has an implementation that survives being called
- a waiting state does not spend the ceiling that decides when to give up
- a fold across a collection does not conclude anything from an empty one
- a state that gives up can be got out of again

Nobody writes those tests. They are dull, they are about the engine rather than
the work, and their absence is invisible until production. Every one of them
was learned the same way — by a real ticket doing the wrong thing on a real
board.

## What it would have caught

One custom workflow, one day, with its author holding the whole codebase in
their head:

| what happened | which property |
|---|---|
| `hand-off-to-qa` planned with no handler; would have thrown at the last step of the happy path | every action has an implementation |
| `address-threads` read observation fields that had moved; `undefined.map` on a real ticket | every handler survives being called |
| a hold on a shared checkout counted against `implementAttempts`; the state escalated saying it had tried three times, having tried none | a wait does not spend the work's ceiling |
| `[].every(...)` is `true`, so a ticket with no repositories read as approved and merged in all of them | an empty fold concludes nothing |
| an escalation resumed instantly on an answer from the day before, escalating and announcing on a thirty-second cycle | giving up has exactly one way out |

None of the five is domain knowledge. All five are the same five properties.

## What changes

`@amykit/workflow-testkit`, given a workflow and a world:

```ts
import { conforms } from "@amykit/workflow-testkit";

conforms(workflow, {
  runtime: () => myRuntime(fakePorts()),
  worlds: [aFreshTicket, aTicketInReview, aTicketNobodyTriaged],
});
```

and the suite above runs as ordinary tests in the author's own runner. It is
additive, it needs no change to the core, and `amy workflow new` writes the
call into the scaffold so a workflow has it from its first commit.

What it deliberately does not do is invent a world. The author supplies the
ports; the kit drives them. A harness that stubs the domain proves the stub —
which is its own failure mode: a stub that ignored the argument the real one
maps over let a handler pass `undefined` and still go green.

## Acceptance criteria

- [ ] A workflow with a state nothing reaches fails the suite, naming the state
      (proof: test:packages/workflow-testkit/tests/reachability.test.ts)
- [ ] A workflow with a state nothing leaves fails the suite
      (proof: test:packages/workflow-testkit/tests/reachability.test.ts)
- [ ] A workflow declaring an action with no working handler fails, naming it
      (proof: test:packages/workflow-testkit/tests/handlers.test.ts)
- [ ] A workflow whose waiting state spends an attempt ceiling fails
      (proof: test:packages/workflow-testkit/tests/ceilings.test.ts)
- [ ] A workflow that concludes from an empty collection fails
      (proof: test:packages/workflow-testkit/tests/folds.test.ts)
- [ ] A workflow whose terminal-by-giving-up state has no exit fails
      (proof: test:packages/workflow-testkit/tests/escalation.test.ts)
- [ ] Both shipped workflows pass it unmodified
      (proof: test:packages/workflow-ticket-to-qa/tests/conformance.test.ts)
- [ ] `amy workflow new` writes a scaffold whose suite passes on the first run
      (proof: test:packages/cli/tests/scaffold.test.ts)

**Exit condition:** somebody who has written one workflow, and knows nothing
about the engine, finds out from a failing test rather than from a ticket that
a state cannot be left, an action has nothing behind it, or a wait is being
counted as a try.
