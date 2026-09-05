---
name: amy-status
description: >-
  Answer "where is my work" from the project's side rather than the machine's
  — what is open, what amy is working on right now, what is waiting on you,
  what is stuck — across every workflow at once, as a page you can keep open.
  Use at the start of a day, when somebody asks what amy has been doing, when
  deciding what to pick up next, or when a ticket seems to have gone quiet.
version: 1.0.0
platforms: [macos, linux]
metadata:
  hermes:
    tags: [amy, status, dashboard, tickets, project]
    related_skills: [amy, amy-show-me]
---

# Where the work is

`/amy-show-me` answers *how does this workflow work*. This one answers *what
should I do today*, and the difference is the axis: organise by the project
and the piece of work, never by the machine's states.

## Get both halves

**What amy knows**, per workflow — this always works, needs no credential:

```sh
amy workflow list
amy --workflow <each> status --json
```

**What the project knows.** amy only has records for work it has *touched*. A
ticket assigned to you this morning that amy has not picked up yet does not
exist in that JSON, and a status page that quietly omitted it would be worse
than no page. So read the tracker too, through whatever is at hand — the
Linear MCP tools, `gh` for pull requests, or the tracker's own CLI.

**When the tracker cannot be reached** — no credential, no plugin mounted, no
network — fall back to the records alone and **say so on the page, at the
top**: *"tracker unreachable; showing the 12 pieces of work amy has touched.
Anything it has not picked up is missing."* A partial view that admits it is
useful. A partial view that does not is a lie.

## How to organise it

By what the person can do about it, in this order:

1. **Waiting on you.** Questions in `needsInput`, work in a waiting state
   whose world has not moved, a review nobody has done. This is the only
   section that is *about* the reader, so it goes first even when it is empty.
2. **In flight.** What amy is moving right now — state, how long it has been
   there, which pull request. From `queue.running` and `loop`.
3. **Open, not started.** Tickets the tracker has and amy has not picked up.
   This is the section the tracker is needed for.
4. **Stuck.** Anything whose `updatedAt` is old for its state, or whose
   `attempts` is climbing. Say the number of tries and the last thing it said.
5. **Done recently.** Short, and last. It is reassurance, not a decision.

Group by repository or by project when there is more than one; the reader
thinks in projects, not in workflow names. Say which workflow something came
from as a small label, not as the heading.

## The page

Write **one standalone HTML file** — no build step, no CDN, no framework —
and overwrite it each time:

```
~/.amy/reports/status.html
```

Then `open` it. It is meant to be kept open in a tab and regenerated, which is
why the name is stable.

- **Stamp it with the `at` timestamp and the command that regenerates it.**
  It is a snapshot. A page that looks live and is three hours old will get
  somebody to say "amy is stuck" about work that finished.
- **Lead with the counts** — waiting on you, in flight, stuck — so the answer
  is legible from the tab.
- **Link out.** Ticket ids to the tracker, pull request numbers to the code
  host. The point of the page is to be a place you leave from.
- **Light and dark, and it has to work on a phone.** This is the thing you
  look at after a notification.

Then say the one sentence that matters out loud, in chat, as well as on the
page — *"three things are waiting on you, and PROJ-1239 has been in review for
four days"* — because the person may not open it.

## Do not

- **Do not invent a status.** If the tracker was not reached, the ticket's
  state is unknown, not "open".
- **Do not report the queue as work.** Four items in the queue is not four
  tickets; it is however many times something has been scheduled. Count
  records.
- **Do not bury a stuck item.** A record with `attempts` at the ceiling has
  given up and nobody has been told twice. That is the most important line on
  the page.
