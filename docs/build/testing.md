---
title: Testing
description: The three levels, what each one can and cannot prove, and the one every workflow owes.
group: Build your own
order: 3
---

# Testing

Three levels, and the reason there are three is that each one is blind to what
the next catches.

| Level | Proves | Blind to |
| :-- | :-- | :-- |
| **Unit** | A class behaves | That the package you publish works |
| **Walkthrough** | A lifecycle is what you meant | That anything talks to the world |
| **Artifact** | The built package works from another process | Almost nothing — it is slow |

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

**A test name is a sentence about behaviour**, not about a method. `refuses a
second claim`, not `test claim()`. The names are read far more often than the
bodies, and a suite whose names describe methods tells you nothing about what
the thing promises.

**Nothing reaches the real world.** Every adapter goes through `CommandRunner`
or `GraphQLClient`, so every one is tested against a scripted answer instead of
the real `gh`, `claude`, `git` or API.

**Drive time.** Adapters take `now: () => Date`. A test that has to sleep is a
test that will be flaky on somebody else's machine.

## The walkthrough test

**Every workflow owes one.** It drives the whole lifecycle against a fake world
and asserts three things:

```ts
it("walks a ticket from discovered to done", () => {
  let record = newRecord("NW-412", at(0));
  const seen = [record.state];

  for (let look = 0; look < 40; look += 1) {
    const decision = plan(record, world(record), DEFAULT_POLICY);
    if (decision.kind === "settled") break;

    const before = record.state;
    record = fold(applyPlan(record, decision, at(look)), decision);

    // One look, at most one move.
    expect(distance(before, record.state)).toBeLessThanOrEqual(1);
    if (record.state !== seen.at(-1)) seen.push(record.state);
  }

  expect(seen).toEqual([...]);          // the states, in order
  expect(record.state).toBe("DONE");    // it settled, rather than running out
});
```

1. **The states, in order.** The lifecycle is the one you meant.
2. **One look makes at most one move.** A look that advances twice hides every
   intermediate state from the log, and from anybody debugging it at 3am.
3. **It settles rather than spinning.** Bound the loop and fail if it runs out.

This test only exists because `plan()` is pure. A sixteen-state lifecycle
including the paths where a review requests changes and where the agent
disagrees with a reviewer runs end to end in milliseconds with no I/O — which is
why it is the test that finds the bugs.

Then one test per branch that is not the happy path: every ceiling, every retry
exhaustion, every path to a terminal refusal.

## Artifact tests, and why unit tests are not enough

> The tests exercise classes. The gates exercise the artifact.

Every unit test imports a source file from inside the workspace. **A barrel that
forgets an export, or a `dist` nobody built, passes the entire suite and is
broken on the machine that installs it.** So does a package whose `exports` map
is wrong, and so does an install missing half of what it needs.

So each shipped plugin gets a scenario that imports `dist/index.js` **from
another process**, asserts what the plugin promises, and writes a report sealed
with a digest:

```sh
npm run e2e                                            # every scenario
./.software-factory/evidence/ticket-to-qa-scenario.sh  # just the whole machine
```

### The shelf life is the point

A gate declares the plugin's source as its activation paths, so **changing the
plugin expires the proof**:

```
$ printf '\n// one line\n' >> plugins/file-queue/src/FileQueue.ts
$ sf check --allow-commands
✗ critical L3.GATE_HAS_FRESH_EVIDENCE
    the implementation changed since gate `plugin-file-queue` was proven
```

That is not a bug. The last run proved a queue that no longer exists.

See [The gate](../development/the-gate.md) for the full list and how to re-seal.

## The test environment

The two biggest scenarios drive the whole machine. What they are driven against
is a world:

| Real | A stand-in |
| :-- | :-- |
| the installed command, and every adapter in it | the tracker, as GraphQL on a loopback socket |
| two git repositories, the clones, the commits, the push | `gh`, as an executable on the `PATH` |
| the gate, as two shell commands against a real file | `claude`, as an executable that edits real files |

The stand-ins are processes on the other side of a boundary amy already had, so
what runs is the real argv, the real HTTP client, the real envelope parsing and
the real ordering. What is faked is the part that would otherwise need
somebody's credentials, somebody's quota and somebody's afternoon.

The world is built from scratch on every run, and the whole lifecycle runs
**twice, in two separate worlds, and the two trails are compared** — because "it
worked once" and "it works" are different claims. It takes about ten seconds,
needs no credential, and reaches nothing outside the machine.

```sh
./.software-factory/evidence/ticket-to-qa-scenario.sh --keep
```

`--keep` prints the directory it left behind, so you can walk around inside one
afterwards.

### The one thing it cannot make deterministic

The day of the week. The machine refuses to assign a reviewer against a roster
nobody confirmed today, and it does not ask at the weekend. So that rule is
asserted against the day the run happens on, and it is **reported rather than
required**. Everything the gate requires holds on a Tuesday and on a Sunday.

## Testing your own plugin or workflow

You do not need `sf` for any of this. The shape worth stealing is:

1. Unit tests against a scripted runner, with `now` injected.
2. A walkthrough test, if you wrote a workflow.
3. One script that installs the built package somewhere clean and drives it:

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

Ten lines, and it catches the whole class of failure that unit tests structurally
cannot.
