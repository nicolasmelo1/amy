---
title: Testing
description: Unit, walkthrough, conformance and artifact tests, what each one can and cannot prove, and the ones every workflow owes.
group: Build your own
order: 1
---

# Testing

Each level of test is blind to something the next one catches.

| Level | Proves | Blind to |
| :-- | :-- | :-- |
| **Unit** | A class behaves | That the package you publish works |
| **Walkthrough** | A lifecycle is the one you meant | That anything talks to the world |
| **Conformance** | The machine has no dead end, no spin, no stray move | What your states mean |
| **Artifact** | The built package works from another process | Little, at the cost of being slow |

## Unit tests

Import the class, call the method, assert against a scripted double.

```ts
it("refuses a second claim", () => {
  const queue = new FileQueue(directory);
  queue.enqueue({ workId: "NW-1", reason: "found" }, at(0));

  expect(queue.claim(at(1))?.workId).toBe("NW-1");
  expect(queue.claim(at(2))).toBeNull();
});
```

**A test name is a sentence about behaviour.** `refuses a second claim`, where
`test claim()` would say nothing. The names are read far more often than the
bodies, and a suite whose names describe methods says nothing about what the
thing promises.

**Nothing reaches the real world.** Every adapter goes through `CommandRunner`
or `GraphQLClient`, so every one is tested against a scripted answer instead of
the real `gh`, `claude`, `git` or API. `@amykit/test-fixtures` has the
`ScriptedRunner` and the fake ports the shipped tests use.

**Drive time.** Adapters take `now: () => Date`. A test that has to sleep is a
test that will be flaky on somebody else's machine.

## The walkthrough test

**Every workflow owes one.** It mounts the workflow the way amy does, over fake
ports, and looks at one piece of work until it settles. The shipped workflows
keep the loop in `tests/mounted.ts` as `walk()`: observe, decide, run the
actions, fold the outcome into the record, and throw if it never settles.
The tests then read the trail it returns:

```ts
it("walks the lifecycle in order", async () => {
  const { looks } = await walk(await world.mounted(), "task-1");
  expect(["QUEUED", ...looks.map((look) => look.to)]).toEqual([
    "QUEUED", "WORKING", "WORKING", "PR_OPEN", "PR_OPEN", "PR_OPEN", "DONE",
  ]);
});

it("makes at most one move per look", async () => {
  for (const look of (await walk(await world.mounted(), "task-1")).looks) {
    expect(look.actions.length).toBeLessThanOrEqual(1);
  }
});
```

It holds the lifecycle to what you meant:

1. **The states, in order.**
2. **One look makes at most one move.** A look that advances twice hides every
   intermediate state from the log, and from anybody debugging it at 3am.
3. **It settles rather than spinning.** Bound the loop and fail if it runs out.

Decisions are pure, so the whole of `ticket-to-qa`, including the paths where a
review requests changes and where the agent disagrees with a reviewer, runs end
to end in milliseconds with no I/O. That is why it is the test that finds the
bugs.

Then one test per branch that is not the happy path: every ceiling, every retry
exhaustion, every path to a terminal refusal. `examples/workflow-errand/tests/`
is the smallest complete set to copy.

## The conformance suite

The walkthrough proves the lifecycle is the one you meant. Some things are true
of every lifecycle anybody will write, have nothing to do with what yours means,
and are the ones nobody writes a test for. `@amykit/workflow-testkit` checks
them, one test each:

- every world can be walked
- every state is reachable, and every state has a way out
- every action it plans has a handler that survives being called
- a wait does not spend the ceiling that decides when to give up
- an empty collection concludes nothing
- giving up has a way out, and only one
- every move is one the diagram draws

Each was learned from a real ticket doing the wrong thing on a real board. Why
a kit owns them: [a testkit proves the machine](../design/a-testkit-proves-the-machine.md);
why a wait is not an attempt: [waiting is not trying](../design/waiting-is-not-trying.md).

```ts
import { describe, it } from "vitest";
import { conforms } from "@amykit/workflow-testkit";

conforms(workflow, {
  runner: { describe, it },
  runtime: (world) => world.runtime,
  worlds: [await world("an errand that changes something")],
  everyEdge: true,
});
```

A world is one situation, such as a fresh ticket or one nobody triaged. It
carries the runtime built over its fake ports, and a `meanwhile` list of what
the people in it do while the machine waits. The kit calls every handler for
real against the observation the runtime built, so a fake has to take the
arguments the real port takes; one that ignores them proves itself.
`everyEdge` turns an arrow the diagram draws and no world walks into a failure,
for a workflow that is finished.

The shipped workflows run it in `examples/workflow-*/tests/conformance.test.ts`.
A workflow from `amy workflow new` has it from its first commit, in
`index.test.ts`, run by `npm test` with `node:test`.

## Artifact tests, and why unit tests are not enough

> The tests exercise classes. The gates exercise the artifact.

Every unit test imports a source file from inside the workspace. **A barrel that
forgets an export, or a `dist` nobody built, passes the entire suite and is
broken on the machine that installs it.** So does a package whose `exports` map
is wrong, and so does an install missing part of what it needs. The decision:
[every plugin is proven end to end](../design/every-plugin-is-proven-end-to-end.md).

So each shipped plugin gets a scenario that imports `dist/index.js` **from
another process**, asserts what the plugin promises, and writes a report sealed
with a digest:

```sh
npm run e2e                                            # every scenario
./.software-factory/evidence/ticket-to-qa-scenario.sh  # one of them: the whole machine
```

### A proof expires

A gate declares the plugin's source as its activation paths, so **changing the
plugin expires the proof**:

```
$ printf '\n// one line\n' >> plugins/file-queue/src/FileQueue.ts
$ sf check --allow-commands
✗ critical L3.GATE_HAS_FRESH_EVIDENCE
    the implementation changed since gate `plugin-file-queue` was proven
```

That is not a bug. The last run proved a queue that no longer exists.

See [The gate](../development/the-gate.md) for every gate and how to re-seal.

## The test environment

The `ticket-to-qa` scenario drives the installed command through one ticket,
from the working status to a QA handoff, with `amy discover` and `amy tick`.
What it is driven against is a world:

| Real | A stand-in |
| :-- | :-- |
| the installed command, and every adapter in it | the tracker, as GraphQL on a loopback socket |
| git repositories, the clones, the commits, the push | `gh`, as an executable on the `PATH` |
| the gate, as shell commands against a real file | `claude`, as an executable that edits real files |

The stand-ins are processes on the other side of a boundary amy already had, so
what runs is the real argv, the real HTTP client, the real envelope parsing and
the real ordering. What is faked is the part that would otherwise need
somebody's credentials, somebody's quota and somebody's afternoon. Why:
[the lifecycle is proven end to end](../design/the-lifecycle-is-proven-end-to-end.md).

The world is built from scratch on every run, and the lifecycle runs **a second
time, in a second world, and the trails are compared**, because "it worked
once" and "it works" are different claims. It needs no credential and reaches
nothing outside the machine.

```sh
./.software-factory/evidence/ticket-to-qa-scenario.sh --keep
```

`--keep` leaves the world on disk and prints where, so you can walk around
inside it afterwards.

### What it cannot make deterministic

The day of the week. The machine refuses to assign a reviewer against a roster
nobody confirmed today, and it does not ask at the weekend. So that check reads
the day the run happens on, and it is **reported rather than required**.
Everything the gate requires holds on a Tuesday and on a Sunday.

## Testing your own plugin or workflow

You do not need `sf` for any of this. The shape to copy:

1. Unit tests against a scripted runner, with `now` injected.
2. A walkthrough test and `conforms`, if you wrote a workflow.
3. A script that installs the built package somewhere clean and drives it:

```sh
#!/bin/sh
set -eu
work=$(mktemp -d); trap 'rm -rf "$work"' EXIT

npm pack --pack-destination "$work" >/dev/null
(cd "$work" && npm install ./*.tgz >/dev/null)

node --input-type=module -e '
  const m = await import("@acme/plugin-jira");
  if (!m.plugin) throw new Error("no plugin export");
  if (!m.plugin.configSchema.site) throw new Error("lost the site setting");
  console.log("ok:", m.plugin.name);
'
```

It is short, and it catches the whole class of failure that unit tests cannot
reach: amy's loader imports `plugin` from the package, the way this script does.
