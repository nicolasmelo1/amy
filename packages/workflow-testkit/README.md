# @amykit/workflow-testkit

The tests every workflow needs and nobody writes.

Not a plugin. A library a workflow's own test suite imports, so the part of a
workflow that is the same in every workflow, the machine-shaped part, is
proven by the same suite everywhere, from the first commit. It exports
`conforms`, `conformance`, `PROPERTIES` and the `World` type.

## What it checks

The domain (which states exist, what each one means, when work moves) is the
author's, and no harness can check it. The rest is identical in every workflow
anybody will write:

| Property | What goes red |
| :-- | :-- |
| every world can be walked | no world was given, or its ports, its runtime or its first record could not be built |
| every state is reachable, and every state has a way out | a declared state no world reaches, one every world leaves the work in, a lifecycle that never comes to rest |
| every action it plans has a handler that survives being called | an action with nothing behind it, a port-and-method whose port the world did not hand over, an action planned that the workflow never declared, or one throwing on the observation the runtime built |
| a wait does not spend the ceiling that decides when to give up | a waiting state that gives up after enough looks at an unchanged world, or a hold counted against the attempts of the work after it |
| an empty collection concludes nothing | a decision that rests on `[].every(...)` being true |
| giving up has a way out, and only one | a giving-up state that is terminal, or one left before the world moved |
| every move is one the diagram draws | a move between states the workflow's `workflow.mmd` connects with no arrow, naming both ends; with `everyEdge: true`, an arrow it draws that no world walks |

Each finding names the state, the action or the world to go and look at. Why
a wait is held apart from an attempt: [waiting is not
trying](../../docs/design/waiting-is-not-trying.md). Why the kit exists: [a
testkit proves the machine](../../docs/design/a-testkit-proves-the-machine.md).

## Use it

`amy workflow new` writes this suite beside the workflow, so a workflow has it
before it has anything else. It mounts the workflow the way amy does, its
states read from `workflow.mmd`, and hands the kit the runtime:

```ts
import { describe, it } from "node:test";
import os from "node:os";
import { mount, withDiagramBeside, WORKFLOW_RUNTIME, type WorkflowRuntime } from "@amykit/core";
import { conforms } from "@amykit/workflow-testkit";
import { plugin } from "./index.ts";

const drawn = withDiagramBeside(plugin, import.meta.url);
const mounted = await mount([drawn], {}, {
  runner: { run: async () => ({ ok: true, exitCode: 0, stdout: "", stderr: "" }) },
  now: () => new Date(),
  paths: { workspace: os.tmpdir(), checkouts: {}, state: os.tmpdir() },
});
if (!mounted.ok) throw new Error(mounted.problems.join("; "));
const runtime = mounted.mounted.contributions.get(WORKFLOW_RUNTIME)?.get(drawn.workflow.name) as WorkflowRuntime;

conforms(drawn.workflow, {
  runner: { describe, it },
  runtime: () => runtime,
  worlds: [{ name: "a piece of work arrives" }],
});
```

That registers one ordinary test per property in whichever runner you hand it
(`node:test`, vitest, jest); left out, the runner's globals are used.
`conformance(workflow, options)` is the same walk returning the findings
instead, for asserting on one. `ports` hands over the fakes an action declared
as `{ port, method }` is called on, by port kind.

## A world is yours

The kit never invents one. A world is one situation the workflow can be in:

```ts
interface World {
  name: string;                       // named in every finding
  workId?: string;                    // the record's id; the name otherwise
  start?: (now: Date) => WorkRecord;  // a record to start from
  meanwhile?: (() => void)[];         // what the world does, one step per wait
}
```

The kit drives your runtime against it the way the engine does: observe,
decide, call every action the plan carries (a handler directly, a
port-and-method on the port `ports` handed over) and fold, telling the fold
which move it made. The world moves only while the machine waits, one
`meanwhile` step each time, so a state that moves on without one having run
moved on something that was already there.

A harness that stubs the domain proves the stub. A fake that ignored the
argument the real port maps over once let a handler hand it `undefined` and
still go green, which is why the kit calls handlers with the observation your
runtime built, against ports you wrote.

## Licence

MIT
