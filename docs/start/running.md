---
title: Running it
description: One move at a time, the loop, and the difference between pause and stop.
group: Start here
order: 5
---

# Running it

## The one command that matters

```sh
amy tick
```

One claim from the queue, one decision, at most one move, then exit. Everything
else on this page is that command with something around it.

Run it by hand until you trust it. It is the honest way to watch a workflow: the
record before, the record after, and the log line that says why.

## The four ways to drive

| Command | What it does | When |
| :-- | :-- | :-- |
| `amy tick` | Exactly one move, then exit. | Learning it, debugging it, or driving it from a script. |
| `amy run --max N` | Keeps advancing until nothing is due. | Catching up after being away. |
| `amy start --every N` | The loop, in the background. | Normal operation. |
| `amy daemon --every N` | The same loop, in the foreground. | Under a supervisor, or when you want to watch it. |

```sh
amy discover          # put every piece of work the workflow can find on the queue
amy run --max 20      # advance until nothing is due, or twenty moves have happened
```

`discover` is separate from `tick` because finding work and doing work fail
differently: a tracker that is down should not look like a queue that is empty.

## The queue is the schedule

**There is no interval anywhere in amy.** `--every` is how long the loop sleeps
after finding *nothing to do*; it is not how often work happens.

A piece of work's next look is enqueued by the look that precedes it. A step that
takes a minute and a step that takes an hour both chain the instant they finish,
rather than waiting for a tick that might be twenty minutes away. Waiting states
enqueue themselves with a delay, which is the only place a duration appears at
all.

See [The queue](../concepts/the-queue.md) for what that costs and what it buys.

## Pause and stop are different things

```sh
amy pause "deploying"     # the handbrake
amy resume
amy stop                  # ends the loop
```

**`pause` is the handbrake.** It ends work in flight, starts nothing new, and
leaves the loop running until `amy resume`. It survives a reboot, because it is
a file.

**`stop` ends the loop itself.** It does not survive a reboot, because it is a
process.

The handbrake is deliberately not a plugin. A switch that depends on plugins
loading cannot stop a run whose plugins are what went wrong. It is also watched
rather than polled at boundaries: an agent call can run for half an hour, and a
handbrake nobody honours until the next boundary is not a handbrake.

## Putting work on the queue by hand

```sh
amy note "the relay retries a harness that already said it was out of quota"
amy btw  "bump the deps in the api"
```

`note` writes down **friction** — something that got in the way — and the
`note-to-plan` workflow turns it into a pull request adding a plan to the
repository the friction is about.

`btw` writes down **an errand** — something to do, said in passing — and the
`errand` workflow does it and opens a draft pull request. It never becomes a
ticket, deliberately: `amy btw` is meant to cost nothing, and the failure that
follows from that is a pile of open pull requests nobody asked to review, which
is what the errand ceiling is for.

Which profile each one lands on is a config setting (`notes: true`, `tasks:
true`), not a hard-coded name. See
[Workflows and profiles](workflows-and-profiles.md).

## When something goes down

The GitHub API will go down and Claude will go away, and there is no graceful
shutdown here. When a dependency goes down you get **one** warning on the way
down, silence while it is down, and **one** warning when it comes back — and the
work resumes the move it was going to make, from the state it was in.

Which means the number that used to mean "how many failures before you are told"
now means "how many before the machine gives up", and being told happens on the
first one.

A notification channel you misconfigured never costs a piece of work a move, and
neither does a log directory you cannot write to. The line is one question: **a
port call may only be swallowed when its failure does not make the saved record
a lie.** The notifier and the event log are the only two that qualify; the
tracker, the code host, the agent and the gate all still fail the tick.

## Tidying up

```sh
amy queue prune              # delete finished items past their retention
amy queue recover            # return items a dead worker abandoned
```

Finished items are pruned on the way past, so the directory does not grow
forever, and `recover` exists because a worker that dies mid-claim leaves an
item marked as running that nothing will ever finish.
