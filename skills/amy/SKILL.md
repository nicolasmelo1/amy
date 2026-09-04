---
name: amy
description: >-
  Drive amy, the machine that walks a work ticket from the tracker's working
  status to a QA handoff. Use when asked to pick up a ticket, move work
  forward, check what amy is waiting on, confirm the reviewer roster, or when
  amy reports it is stuck. Covers the commands, how to read the status, the
  one-move-at-a-time rule, and what needs a human.
version: 1.0.0
platforms: [macos, linux]
metadata:
  hermes:
    tags: [amy, linear, github, tickets, pull-requests, review, automation, queue]
    related_skills: [amy-develop]
---

# Driving amy

amy takes a ticket that is in the tracker's working status and drives it to a
QA handoff: read it, ask if it is ambiguous, implement, gate, open a pull
request, clear the bot reviewer, pick the lightest-loaded human reviewer,
clear them, and hand over to QA.

**It advances at most one ticket by one move per `tick`.** There is no timer
anywhere in it. Each move enqueues the next, so a step that takes a minute and
a step that takes an hour both chain the moment they finish.

## Before anything

amy must be run from a directory that has a `.amy/` and a `.env`:

```sh
amy doctor
```

Fix everything it lists before running. It checks the config, whether the
roster was confirmed today, `LINEAR_API_KEY`, `gh`, `claude`, `git`, the
notification target, and that every configured repository is checked out. It
exits non-zero when something is wrong, so it is safe to gate on.

## The commands

| Command | What it does |
| :-- | :-- |
| `amy discover` | Puts every ticket in the working status onto the queue. Reads the tracker, writes nothing to it. |
| `amy tick` | Advances one ticket by one move, then exits. |
| `amy run` | Keeps ticking until nothing is due. Takes `--max N`. |
| `amy status` | Where every ticket stands, what the queue holds, and what is waiting on the operator. |
| `amy roster confirm` | Stamps the roster with today's date. |
| `amy roster show` | The roster, and whether it is current. |
| `amy queue prune` | Drops finished queue items past their retention. |
| `amy queue recover` | Returns items a dead worker left claimed. |

## Every workday, first

```sh
amy roster confirm
```

amy **refuses to assign a reviewer or hand over to QA** while the roster was
not confirmed today. That is deliberate: people go on leave without editing a
config file, and a review assigned to somebody who is away stalls for days
with nothing looking broken. If somebody is out, set `available: false` for
them in `.amy/roster.yaml` before confirming.

## Reading a tick

```
PROJ-1239  IMPLEMENTING -> CHECKED  the agent finished, the gate decides if it holds
PROJ-1201  COPILOT_WAIT  waiting for the automated reviewer to look at a6d7c08 (looking again in 300s)
```

The reason after the states is the predicate that fired. When it says
`looking again in Ns`, amy is in a waiting state and there is nothing to do
but let the queue come back to it.

`amy status` marks each ticket `active` or `waiting`. A ticket that is
`waiting` is not stuck, it is holding for the outside world.

## When amy needs a human

Three things it cannot decide, and it will not guess:

1. **A blocking question on the ticket.** It posts the question on the ticket
   and holds in `CLARIFYING`. Answer on the ticket; a reply from anybody other
   than the ticket owner's own account releases it.
2. **A disagreement with a reviewer.** It opens a follow-up ticket, holds in
   `ESCALATED`, and will not argue on the pull request. Settle it on the
   follow-up.
3. **A stale roster, or nobody available.** Confirm the roster.

It announces all three on every configured channel, and writes a file into
`.amy/needs-input/`. That file is the durable half: a missed notification is
gone, the file stays until it is dealt with. `amy status` counts them.

## Rules for driving it

- **Watch it before trusting it.** On a ticket amy has not handled before,
  use `amy tick` and read each move. Only reach for `amy run` once a whole
  ticket has been through end to end.
- **Never hand-edit `.amy/tickets/*.json` while a tick could be running.**
  That file is amy's memory of the ticket. Stop the worker first.
- **A failed tick is not a lost ticket.** amy re-queues it behind a backoff
  and gives up only after several attempts, at which point it announces.
- **`amy discover` is safe to run any time.** It only reads the tracker and
  writes to the local queue, and it will not queue a ticket twice or queue one
  that is already done.
- **Do not work around a refusal.** When amy refuses to assign a reviewer, the
  roster is stale. Confirm it, do not edit the state file.
