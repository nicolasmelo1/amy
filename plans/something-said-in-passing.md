# Something said in passing becomes work

The cheapest thing to lose is the thing somebody said while doing something
else. *"btw the deps in the api are stale."* *"Also, check whether that
monitor is still firing."* Nobody opens a ticket for those, and the reason is
not laziness — a ticket has an owner, a date and a conversation attached, and
none of those exist for a sentence said in passing. So the sentence is lost,
and six weeks later somebody says it again.

amy had two ways in and neither of them fits. A **ticket** is work a tracker
already knows about. A **note** is friction amy itself hit, and it becomes a
plan in the repository it is about. There was nowhere for *work somebody wants
done that nobody will open a ticket for*.

## What this is

`amy btw "<text>"` writes a task and puts it on a queue. A third workflow —
`errand` — picks it up, works in a branch of the repository it names, and
either opens a pull request or comes back with an answer.

```text
QUEUED ──► WORKING ──► PR_OPEN ──► DONE
   │           │
   │           └──► DONE          it was a question, and it has an answer
   └──────────────► DECLINED      not my repository, or it did not get done
```

## The two decisions that make it a workflow rather than a script

**An errand that changed nothing is finished, not failed.** Half of what
people say in passing is *"check whether X"*, which ends in a sentence rather
than a diff. A machine that treated a clean working tree as a failed attempt
would retry it, spend an agent again, and eventually hand it back as broken —
which would make this useless for half its purpose.

**Capturing costs nothing, so something has to.** The failure that follows
from cheap capture is thirty open pull requests nobody asked to review. Past
`maxInFlight` the machine holds and says so **once**, and the answer to a held
errand is to land one rather than to raise the number.

## What it cost the rest of amy

One action name in the core catalogue, and nothing else. `run-errand` is the
generic "ask the agent", which is the second workflow to want it under a name
of its own — evidence rather than guess, which is the bar that table sets for
itself. `open-pull-request` and `announce` are shared with both other
workflows. The engine did not change. Neither did the other two.

An action on a port another plugin mounts has to live in the catalogue rather
than in the workflow, and that is worth writing down: a workflow registering
`run-errand` itself would claim the `agent` port out from under the relay, and
the mount would refuse.

## Acceptance criteria

- [x] A sentence reaches the queue without a tracker, a ticket or a form
      (proof: test:packages/cli/tests/two-workflows.test.ts)
- [x] The same engine drives it, having learnt nothing
      (proof: test:packages/cli/tests/two-workflows.test.ts)
- [x] A task that changes a file ends on a pull request
      (proof: test:packages/workflow-errand/tests/walkthrough.test.ts)
- [x] A task that answers a question ends done, with no pull request
      (proof: test:packages/workflow-errand/tests/walkthrough.test.ts)
- [x] A task no number of attempts gets done is handed back with what the
      agent last said
      (proof: test:packages/workflow-errand/tests/walkthrough.test.ts)
- [x] The ceiling holds the rest and says so once, not on every look
      (proof: test:packages/workflow-errand/tests/walkthrough.test.ts)
- [x] Its records and queue stay out of the other workflows' directories
      (proof: test:packages/cli/tests/two-workflows.test.ts)
- [x] A task can be written by hand into the watched directory, not only by
      the command (proof: test:plugins/file-tasks/tests/FileTasks.test.ts)
- [x] It names no action the core does not already ship
      (proof: test:packages/workflow-errand/tests/plugin.test.ts)
- [ ] The installed command drives one errand end to end against a world of
      stand-ins, the way the other two workflows are proven
      (proof: deferred:it has no scenario of its own yet)

**Exit condition:** `amy btw "<sentence>"` from any harness on the machine
puts work on a queue that amy drives to a pull request or to an answer, the
ceiling keeps cheap capture from becoming an expensive pile, and neither of
the other two workflows changed to allow it.

## What is not proven yet, and it matters

The other two workflows each have a gate that drives the **installed** command
through the whole lifecycle against stand-in services. This one does not. What
is proven here is a real mount — the real relay, the real forge, the real git
adapter, with only the processes they shell out to scripted — which is
stronger than a unit test and weaker than a gate.

The gap is deliberate and it is written here rather than left to be
rediscovered: nothing yet proves an errand works on a machine that installed
amy, as opposed to on a machine that has this checkout.
