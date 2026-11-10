---
title: Running it
description: One move at a time, the loop, and the handbrake.
group: Start here
order: 5
---

# Running it

## One move

```sh
amy tick
```

Discover new work, claim one item from the queue, make one decision, at most one
move, then exit. Everything else on this page is that command with something
around it.

Run it by hand until you trust the workflow: the record before, the record
after, and the log line that says why.

## The ways to drive

| Command | What it does | When |
| :-- | :-- | :-- |
| `amy tick` | Discovers, then makes one move and exits. | Learning it, debugging it, or driving it from a script. |
| `amy run --max N` | Keeps advancing what is queued until nothing is due. | Catching up after being away. |
| `amy look <workId>` | Looks at one piece of work now, rather than when it was next due. | You know something changed. |
| `amy start` | The loop, discovering on every pass, under the machine's supervisor. | Normal operation. |

Every option is in the [CLI reference](../reference/cli.md).

`amy start --every 60` sets how long the loop sleeps after finding nothing to
do. It is not how often work happens: a piece of work's next look is queued by
the look before it, so a step that takes a minute and a step that takes an hour
both chain the moment they finish. Waiting states queue themselves with a delay,
which is the only place a duration appears. See [The queue](../concepts/the-queue.md).

A look that waits does not spend an attempt; only a real try does
([waiting is not trying](../design/waiting-is-not-trying.md)). A harness that
hit its usage limit is not a failed attempt either
([a usage limit is not an attempt](../design/a-usage-limit-is-not-an-attempt.md)),
and a retry that would add no new evidence is parked rather than run
([no retry is free](../design/no-retry-is-free.md)).

## Stop and the handbrake

```sh
amy stop                  # ends this profile's loop
amy stop --all            # the handbrake: every loop and run in flight
amy start                 # releases the handbrake, and starts the loop
```

**`amy stop`** ends the selected profile's loop and takes it off the
supervisor, so nothing starts it at the next boot.

**`amy stop --all`** is the handbrake. It writes `~/.amy/PAUSED`, ends every
loop and every agent call in flight, and `amy run` refuses while it is there.
It survives a reboot, because it is a file. The next `amy start` releases it.

The handbrake is not a plugin: a switch that depends on plugins loading cannot
stop a run whose plugins are what went wrong. It is watched rather than checked
between moves, because an agent call can run for half an hour.

## Putting work on the queue by hand

A workflow can bring its own commands. Two shipped ones do:

```sh
amy note "the relay retries a harness that already said it was out of quota"
amy btw  "bump the deps in the api"
```

`note` comes with `@amykit/workflow-note-to-plan`. It writes down **friction**,
something that got in the way, and the workflow turns it into a pull request
adding a plan to the repository the friction is about.

`btw` comes with `@amykit/workflow-errand`. It writes down **an errand**,
something to do said in passing, and the workflow does it and opens a draft
pull request. It never becomes a ticket: `amy btw` is meant to cost nothing,
and the errand ceiling keeps that from becoming a pile of pull requests nobody
asked to review.

Which profile each lands on is the profile's `notes: true` or `tasks: true`.
The commands are there only when a profile mounts the workflow that brings
them: [a plugin brings its own commands](../design/a-plugin-brings-its-own-commands.md).

## When something goes down

When a dependency goes down you get **one** warning on the way down, silence
while it is down, and **one** warning when it comes back. The work then makes
the move it was going to make, from the state it was in.

A notification channel you misconfigured never costs a piece of work a move,
and neither does a log directory you cannot write to. The rule: **a port call
may be swallowed only when its failure does not make the saved record a lie.**
The notifier and the event log qualify; the tracker, the code host, the agent
and the gate still fail the tick. Why: [the engine fails out loud](../design/the-engine-fails-out-loud.md).

## Tidying up

```sh
amy queue prune              # delete finished items past their retention
amy queue recover            # return items a dead worker abandoned
```

Finished items are pruned on the way past as well. `recover` exists because a
worker that dies mid-claim leaves an item marked running that nothing will
finish.
