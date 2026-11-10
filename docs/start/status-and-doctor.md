---
title: Status and doctor
description: Where things stand, and what is wrong before it touches a ticket.
group: Start here
order: 7
---

# Status and doctor

`amy doctor` asks *can this machine work at all*. `amy status` asks *where has
the work got to*.

## `amy doctor`

```sh
amy doctor
amy --workflow oncall doctor    # the same, for another profile
```

It prints one line per check, `ok` or `FAIL`, then whether the profile mounts.
It exits non-zero when anything failed, so it is safe to gate on in a shell
profile, a cron wrapper or CI. What it checks:

| Check | Why it is asked |
| :-- | :-- |
| The config file exists | The most common cause of "it does nothing" |
| A notification channel is on | A machine that cannot reach you is one you have to poll |
| A gate is configured when one is mounted, and repositories when a workspace is | A workflow with no gate opens pull requests nobody checked |
| **Each plugin's settings, against the schema that plugin declared** | See below |
| What the workflow may write, and its brief sections | A workflow claiming no writes cannot reach one |
| State left behind by an older layout, or in the working directory | Reported, never adopted |
| The environment variables the mounted plugins read | A credential missing at 3am is a tick that failed for no visible reason |
| `claude`, and `gh` and `git` when a workspace is mounted | The external commands the adapters shell out to |
| The notification target and the chat | A Hermes target nobody registered fails without a sound |
| Every configured repository is checked out | Work cannot happen in a directory that is not there |
| The checks each mounted package brings | ticket-to-qa's roster being confirmed today is one |
| The machine's supervisor | Whether `amy start` has something to keep the loop up |

The settings check asks **the plugins this install loaded** for their schemas
rather than carrying a table of its own, so it describes the machine being
diagnosed. Why settings are checked against a schema:
[a config is typed by its schema](../design/a-config-is-typed-by-its-schema.md).
Why a workflow's write surface is checked:
[a workflow that claims no writes cannot reach one](../design/a-workflow-that-claims-no-writes-cannot-reach-one.md).

If `doctor` is red and it is not obvious why, the `/amy-init` skill walks the
same ground and explains what it found.

## `amy status`

```sh
amy status
amy status --all      # include work that has finished
amy status --json     # the same thing as data, for something else to render
```

It shows:

**Where every piece of work stands.** One line per record, its state, and
whether that state is `waiting` (the workflow's diagram marks it as waiting on
somebody else), `active` (waiting on amy) or `finished`. Finished work is
counted and left out unless you pass `--all`.

**What the queue holds.** What is due now, what is held back and until when,
and what a worker has claimed.

**Whether the loop is up**, and since when.

`--json` is the interface for anything that renders it: a status page, a
harness skill, a phone. The `/amy-status` skill answers the same question from
the project's side, and `/amy-show-me` draws the state machine when you need a
picture. `amy workflow export <name> --work <id>` prints the diagram with that
piece of work marked.

### Reading a stuck piece of work

A piece of work that is not moving is in one of these situations, and the
status tells them apart:

- **Waiting on a person.** Its state is one the workflow marks as waiting.
  Nothing is wrong; the queue holds it with a delay.
- **Parked against a ceiling.** The budget said not yet, or the reviewer
  ceiling is reached. The record is untouched and the same move happens when
  there is room. Look at `amy budget`.
- **Retrying.** It failed and is being tried again. The log has
  `work.degraded`, and you were told on the first failure.
- **Given up on.** It hit `maxItemAttempts`. The log has `work.failed`, and an
  announcement went out.

## The log

When neither command explains it, the log does:

```sh
tail -f ~/.amy/log/$(date -u +%F).jsonl
```

One file per day. Every line names the build that wrote it, and every kind is a
versioned contract. See [Events](../concepts/events.md),
[Reference → Events](../reference/events.md), and why it can be followed live:
[the event log can be watched](../design/the-event-log-can-be-watched.md).

## `amy budget`

```sh
amy budget
```

What the agents have spent, per window, against the ceiling, read from the log
rather than from a tally of its own. See [Budgets](../concepts/budgets.md).
