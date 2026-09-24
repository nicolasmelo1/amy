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

None of the five is domain knowledge. All five are the same five properties,
and each of them is now a test in `packages/workflow-testkit/tests` written as
the workflow that did it.

## What shipped

`@amykit/workflow-testkit`, given a workflow and the worlds its author wrote:

```ts
import { describe, it } from "node:test";
import { conforms } from "@amykit/workflow-testkit";

conforms(workflow, {
  runner: { describe, it },
  runtime: (world, now) => myRuntime(world.ports(now)),
  worlds: [aFreshTicket(), aTicketInReview(), aTicketNobodyTriaged()],
});
```

registers one ordinary test per property, red with every finding under it and
each finding naming the state, the action or the world. `conformance()` is the
same walk returning the findings, for asserting on one. It is additive: the
core did not change.

**The runner is handed in.** The kit imports no test framework, so the suite
runs in `node:test`, vitest or jest alike — which is what let the scaffold's
suite need nothing but node and the kit.

**The world is the author's.** A world names itself, optionally the work id
`newRecord` is given and a record to start from, and carries a `meanwhile`:
what the people in it do while the machine waits, one step per wait and never
otherwise. The kit drives the author's own runtime the way the engine does —
observe, plan, call every action, fold — with a clock the ports read too. It
never invents a port: a harness that stubs the domain proves the stub, and a
stub that ignored the argument the real one maps over once let a handler pass
`undefined` and still go green.

**Each property is a probe over what the walk saw**, rather than a second walk:

- *Reachability* counts a state reached only when the machine got there —
  from `newRecord`, or by moving. A world that starts a record in a state
  proves nothing about arriving in it.
- *Handlers* are called for real, with the observation the runtime built; a
  declared action no world reached still has to have a handler.
- *Ceilings* replays two ways a wait is spent as a try: a declared waiting
  state held for ten more looks at an unchanged world must still be waiting,
  and a state that held and then moved on must make the same move had the
  hold lasted ten looks longer. The second is the checkout that escalated.
- *Folds* replays every look with each collection in the record and the
  observation emptied, deciding each twice — once with an empty `every`
  answering `true` as the language does, once answering `false`. A decision
  that differs was made by the vacuous truth. `!list.some(...)` is left alone:
  "none is open" means something of none, and "all are approved" does not.
- *Escalation* treats a state entered by the core's `escalate` action, or one
  named in `givesUp`, as giving up. It must not be terminal, and it must not
  be left on a look before the world moved — that is resuming on something
  that was already there.

`amy workflow new` writes `index.test.js` calling `conforms` over the scaffold's
own world, and a `package.json` with `npm test` and the kit as a dev dependency
at this command's version. Its `index.js` exports the workflow and a `runtime()`
factory beside the plugin, so the suite and the plugin build the same thing.

## Acceptance criteria

- [x] A workflow with a state nothing reaches fails the suite, naming the state
      (proof: test:packages/workflow-testkit/tests/reachability.test.ts)
- [x] A workflow with a state nothing leaves fails the suite
      (proof: test:packages/workflow-testkit/tests/reachability.test.ts)
- [x] A workflow declaring an action with no working handler fails, naming it
      (proof: test:packages/workflow-testkit/tests/handlers.test.ts)
- [x] A workflow whose waiting state spends an attempt ceiling fails
      (proof: test:packages/workflow-testkit/tests/ceilings.test.ts)
- [x] A workflow that concludes from an empty collection fails
      (proof: test:packages/workflow-testkit/tests/folds.test.ts)
- [x] A workflow whose terminal-by-giving-up state has no exit fails
      (proof: test:packages/workflow-testkit/tests/escalation.test.ts)
- [x] Both shipped workflows pass it unmodified
      (proof: test:packages/workflow-ticket-to-qa/tests/conformance.test.ts)
- [x] `amy workflow new` writes a scaffold whose suite passes on the first run
      (proof: test:packages/cli/tests/scaffold.test.ts)

The second shipped workflow's run is
`packages/workflow-note-to-plan/tests/conformance.test.ts`: three worlds, one of
which arrives while two of its plans are still unread.

**Exit condition:** somebody who has written one workflow, and knows nothing
about the engine, finds out from a failing test rather than from a ticket that
a state cannot be left, an action has nothing behind it, or a wait is being
counted as a try.
