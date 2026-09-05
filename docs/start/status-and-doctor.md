---
title: Status and doctor
description: Reading where things stand, and finding out what is wrong before it touches a ticket.
group: Start here
order: 7
---

# Status and doctor

Two commands answer two different questions. `amy doctor` asks *can this machine
work at all*. `amy status` asks *where has the work got to*.

## `amy doctor`

```sh
amy doctor
```

It exits non-zero, so it is safe to gate on — in a shell profile, in a cron
wrapper, in CI. What it asks, in order:

| Check | Why it is worth asking |
| :-- | :-- |
| The config file exists | The most common cause of "it does nothing" |
| Repositories are configured | Review load is counted across all of them; an empty list silently counts none |
| A gate is configured | A workflow with no gate opens pull requests nobody checked |
| At least one notification channel is on | A machine that cannot reach you is one you have to poll |
| **Each plugin's settings, against the schema that plugin declared** | See below |
| The roster, and whether it was confirmed today | A stale roster assigns reviews to people on leave |
| State left behind by an older layout | Reported, never adopted |
| The API keys the mounted plugins read | A credential missing at 3am is a tick that failed for no visible reason |
| `gh`, `claude`, `git` | Every adapter shells out through one boundary; this is that boundary |
| The notification target actually exists | A Hermes target nobody registered fails silently by design |
| Every configured repository is checked out | Work cannot happen in a directory that is not there |

The plugin-settings check is the one worth understanding. The schemas are not
compiled into `doctor` — they are asked of **the plugins this install actually
loaded**. A table baked in here would describe a machine other than the one
being diagnosed, which is exactly the failure a diagnostic must not have.

If `doctor` is red and it is not obvious why, `/amy-init` walks the same ground
and reads the result back in numbers.

## `amy status`

```sh
amy status
amy status --json     # the same thing as data, for something else to render
```

It tells you three things:

**Where every piece of work stands** — one line per record, its state, and how
long it has been there. A state in the workflow's `waitingStates` is waiting on
somebody else; anything else is waiting on amy.

**What the queue holds** — what is due now, what is held back and until when, and
what is claimed by a worker right now.

**Whether the loop is up**, and since when.

`--json` is the interface for anything that renders it — a status page, a
harness skill, a phone. `/amy-status` answers the same question from the
project's side rather than the machine's, and `/amy-show-me` draws the state
machine when the thing you need is a picture.

### Reading a stuck piece of work

A piece of work that is not moving is in one of four situations, and the status
distinguishes them:

1. **Waiting on a person.** Its state is one of the workflow's waiting states.
   Nothing is wrong. The queue holds it with a delay.
2. **Parked against a ceiling.** The budget said not yet, or the reviewer
   ceiling is reached. The record is untouched and the same move happens when
   there is room. Look at `amy budget`.
3. **Retrying.** It failed and is being tried again. The log has
   `work.degraded`, and you were told on the first failure.
4. **Given up on.** It hit `maxItemAttempts`. The log has `work.failed`, an
   announcement went out, and in a workflow that files notes the friction
   became a note.

## The log is the third answer

When neither command explains it, the log will:

```sh
tail -f ~/.amy/events.jsonl
```

Every line names the build that wrote it, and every kind is a versioned
contract — see [Events](../concepts/events.md) and
[Reference → Events](../reference/events.md).

## `amy budget`

```sh
amy budget
```

What the agents have spent, per window, against the ceiling — read from the log
rather than from a tally of its own. See [Budgets](../concepts/budgets.md).
