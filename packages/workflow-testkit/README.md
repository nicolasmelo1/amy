# @amykit/workflow-testkit

The tests every workflow needs and nobody writes.

Not a plugin. A library a workflow's own test suite imports, so the half of a
workflow that is the same in every workflow — the machine-shaped half — is
proven by the same suite everywhere, from the first commit.

## What it checks

A workflow is two halves. The domain — which states exist, what each one
means, when work moves — is the author's, and no harness can check it. The
other half is identical in every workflow anybody will write:

| Property | What goes red |
| :-- | :-- |
| every state is reachable, and every state has a way out | a declared state no world reaches, one every world leaves the work in, a lifecycle that never comes to rest |
| every action it plans has a handler that survives being called | an action declared with nothing behind it, planned without being declared, or throwing on the observation the runtime really built |
| a wait does not spend the ceiling that decides when to give up | a waiting state that gives up after enough looks at an unchanged world, or a hold counted against the attempts of the work after it |
| an empty collection concludes nothing | a decision that rests on `[].every(...)` being true |
| giving up has a way out, and only one | a giving-up state that is terminal, or one left before the world moved |

Each finding names the state, the action or the world to go and look at.

## Use it

```ts
import { describe, it } from "node:test";
import { conforms } from "@amykit/workflow-testkit";
import { workflow, runtime } from "./index.js";

conforms(workflow, {
  runner: { describe, it },
  runtime: (world, now) => runtime(world.ports(now)),
  worlds: [aFreshTicket(), aTicketInReview(), aTicketNobodyTriaged()],
});
```

That registers one ordinary test per property in whichever runner you hand it
— `node:test`, vitest, jest. `conformance(workflow, options)` is the same walk
returning the findings instead, for asserting on one.

`amy workflow new` writes this call into the scaffold, so a workflow has it
before it has anything else.

## A world is yours

The kit never invents one. A world is one situation the workflow can be in,
carrying the fake ports your runtime is built from:

```ts
interface World {
  name: string;                 // named in every finding
  workId?: string;              // what newRecord is given; the name otherwise
  start?: (now: Date) => Record; // a record to start from; newRecord otherwise
  meanwhile?: (() => void)[];   // what the world does, one step per wait
}
```

The kit drives your runtime against it the way the engine does: observe, plan,
call every action the plan carries, fold. The world moves only while the
machine waits, one `meanwhile` step each time, so a state that moves on
without one having run moved on something that was already there.

A harness that stubs the domain proves the stub. A fake that ignored the
argument the real port maps over once let a handler hand it `undefined` and
still go green — which is why the kit calls handlers with the observation your
runtime built, against ports you wrote.

## Licence

MIT
