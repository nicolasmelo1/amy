---
name: amy
description: >-
  Drive amy, the machine that walks a work ticket from the tracker's working
  status to a QA handoff, and turns friction it hits into a plan in the
  repository that friction is about. Use when asked to pick up a ticket, move
  work forward, write a piece of friction down, check what amy is waiting on,
  confirm the reviewer roster, or when amy reports it is stuck. Covers the two
  workflows, the commands, how to read the status, the one-move-at-a-time
  rule, and what needs a human.
version: 1.0.0
platforms: [macos, linux]
metadata:
  hermes:
    tags: [amy, linear, github, tickets, pull-requests, review, automation, queue, plans]
    related_skills: [amy-develop, amy-workflow, amy-init, amy-show-me, amy-status]
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

amy is one install per machine. Everything it knows is in `~/.amy`, so it
answers the same from any directory and from any harness:

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
| `amy run` | Keeps ticking until nothing is due, then exits. Takes `--max N`. |
| `amy start` | Starts the loop in the background and keeps it there. Takes `--every <seconds>`. |
| `amy stop` | Stops that loop. |
| `amy pause` / `amy resume` | The handbrake. `pause` ends work in flight and starts nothing new; the loop stays up. |
| `amy status` | Where every ticket stands, the queue, and whether the loop is running. `--json` for something else to render. |
| `amy workflow list` | Every workflow this install can drive, and what each holds. |
| `amy workflow rm <name>` | Forgets a workflow: its records, its queue, its config entry. Needs `--yes`. |
| `amy skills` | Installs these skills into the harnesses on this machine. |
| `amy roster confirm` | Stamps the roster with today's date. |
| `amy roster show` | The roster, and whether it is current. |
| `amy queue prune` | Drops finished queue items past their retention. |
| `amy queue recover` | Returns items a dead worker left claimed. |
| `amy note "<text>"` | Writes a piece of friction down and puts it on the plan queue. Takes `--repo` and `--source`. |

**`stop` and `pause` are different things.** `pause` is the handbrake: it ends
what is in flight, starts nothing new, and the loop stays up waiting to be
released by `resume`. `stop` ends the loop itself. Pausing survives a restart,
because it is a file; stopping does not, because it is a process.

Every command above drives whichever workflow the config makes the default,
which out of the box is `ticket-to-qa`. `--workflow <name>` drives another —
`note-to-plan` ships beside it, over work that never was a ticket:

```sh
amy --workflow note-to-plan discover   # picks up every note written down
amy --workflow note-to-plan tick       # advances one note by one move
amy --workflow note-to-plan status     # where each note stands
```

A workflow is a name in `~/.amy/config.yaml` under `workflows:`, not something
this install was built with. An entry naming a package that is installed is
drivable, and each one keeps its own records and queue under
`~/.amy/<name>/`, so switching between them never costs the other one's state.
Writing one is `/amy-workflow`; seeing one is `/amy-show-me`.
`amy plugin list` says what is installed and what this profile mounts.

## Friction becomes a plan

When something gets in amy's way — an adapter that lied, a step that needed
three tries, a limitation somebody worked around — write it down:

```sh
amy note "the relay retries a harness that already said it was out of quota"
```

It goes on the queue with no ticket, no tracker and nothing to fill in. A
longer one can be dropped straight into `~/.amy/notes/` as a markdown file, by
an editor or by a hook; `amy --workflow note-to-plan discover` picks it up
like any other.

From there an agent writes `plans/<slug>.md` and its line in
`plans/next-steps.md` in the repository the note is about, `sf check` in that
repository decides whether it holds, and a plan it refuses goes back to the
agent with the finding. What reaches you is a **pull request**, never a
commit: whether the work is worth doing is your call.

Two things it will not do. It writes into only the repositories listed under
`plans.repos`, and a note about anything else is handed back to you. And past
`plans.policy.maxOpenPlansPerRepo` it holds rather than opening another pull
request nobody has read — merge or close one and it picks up where it left
off.

A tick amy gives up on writes its own note, so the thing that broke becomes
the thing that gets fixed. Those are the ones worth reading first.

## Every workday, first

```sh
amy roster confirm
```

amy **refuses to assign a reviewer or hand over to QA** while the roster was
not confirmed today. That is deliberate: people go on leave without editing a
config file, and a review assigned to somebody who is away stalls for days
with nothing looking broken. If somebody is out, set `available: false` for
them in `~/.amy/roster.yaml` before confirming.

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
`~/.amy/needs-input/`. That file is the durable half: a missed notification is
gone, the file stays until it is dealt with. `amy status` counts them.

## Rules for driving it

- **Watch it before trusting it.** On a ticket amy has not handled before,
  use `amy tick` and read each move. Only reach for `amy run` once a whole
  ticket has been through end to end.
- **Never hand-edit `~/.amy/<workflow>/records/*.json` while a tick could be
  running.** Those files are amy's memory of the work. Stop the
  worker first. `~/.amy/notes/*.md` is different: a note is an input, and
  writing one by hand is how the second workflow is meant to be fed.
- **A failed tick is not a lost ticket.** amy re-queues it behind a backoff
  and gives up only after several attempts, at which point it announces.
- **`amy discover` is safe to run any time.** It only reads the tracker and
  writes to the local queue, and it will not queue a ticket twice or queue one
  that is already done.
- **Do not work around a refusal.** When amy refuses to assign a reviewer, the
  roster is stale. Confirm it, do not edit the state file.
