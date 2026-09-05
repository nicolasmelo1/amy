# @amy/workflow-errand

Something said in passing becomes work: capture it, do it, say what happened.

```sh
amy btw "bump the stale deps in the api package"
```

```text
QUEUED ──► WORKING ──► PR_OPEN ──► DONE
   │           │
   │           └──► DONE          it was a question, and it has an answer
   └──────────────► DECLINED      not my repository, or it did not get done
```

## Why this is a workflow and not a script

Because of the two ends, not the middle. The middle — an agent in a checkout —
is one call. What needs a machine is that an errand **waits when there are
already too many in flight**, and that **an errand which changed nothing is
finished rather than failed**.

That second one is half of what people say in passing. *"Check whether that
monitor is still firing"* ends in a sentence, not a diff. A workflow that
treated a clean tree as a failed attempt would retry it, spend an agent again,
and eventually hand it back as broken.

## The ceiling

`amy btw` is meant to cost one sentence, and the failure that follows from
cheap capture is thirty open pull requests nobody asked to review. Past
`maxInFlight`, it holds and says so **once** — not on every look, because a
machine that repeats itself is the reason somebody turns notifications off.

The answer to a held errand is to land one, not to raise the number.

## It is not a ticket, and it must not become one

Nothing here resolves anything against a tracker. An errand has no owner, no
date and no conversation attached; if it needs any of those, it was a ticket
and somebody should open one. `/amy-btw` says the same thing to whoever is
about to capture one.

## What it added to amy: nothing

Five states, three actions, and all three actions already existed —
`run-errand` is the core's generic "ask the agent", `open-pull-request` and
`announce` are shared with both other workflows. The engine did not change.
That is the whole claim of the plugin model, stated by a third workflow that
cost a package.
