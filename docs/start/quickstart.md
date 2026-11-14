---
title: Quickstart
description: From nothing to one move you can watch, then the loop.
group: Start here
order: 2
---

# Quickstart

Install it, set it up, watch one move, then let the loop run. Nothing here
touches a real ticket until step 3, and step 3 makes one move.

## 1. Install

```sh
npm install -g @amykit/cli
amy --version             # the version, the commit it was built from, and when
```

The same command on macOS, Linux and Windows. It installs the command and
nothing else; what your workflows need comes in the next step. Everything amy
knows lives in `~/.amy`, or wherever `AMY_HOME` points. See
[Installation](installation.md).

## 2. Set it up

```sh
amy setup                 # which harness, which workflow, which channels
amy doctor                # every dependency, checked before it touches a ticket
```

`setup` asks one question at a time, offers what the machine already holds as
the default, and installs only what you chose into `~/.amy/plugins`. With no
terminal to answer, it stops on the question and prints the flag that answers it.

A fresh install drives nothing until a workflow is chosen. `setup` offers the
published ones, and `amy add <package>` adds one later: it installs the
package, writes its profile into the config, writes the files the workflow
brings (the ticket workflow's roster, for one), and checks the machine still
boots. See [Install a plugin](../guides/install-a-plugin.md).

Credentials go in `~/.amy/.env`; a key only one profile should see goes in
`~/.amy/profiles/<name>/.env`, and anything exported in the shell wins over
both. `amy doctor` exits non-zero when anything is wrong, so it is safe to gate
on. See [Status and doctor](status-and-doctor.md).

If you would rather be walked through it, the `/amy-init` skill does the same
interview from your harness.

## 3. Watch it make one move

```sh
amy tick                  # discover, then exactly one move, then exit
amy status                # where everything stands, and what waits on you
```

`tick` looks for new work first, the same way the loop does, then claims one
item, asks the workflow what to do, does that, writes the record and queues the
next look. This is how you watch a move before you trust the loop. Run it as
often as you like; the loop is the same sequence on repeat.

## 4. Start the loop

```sh
amy start                 # the loop, under the machine's supervisor
amy status                # says whether the loop is up, and since when
amy stop                  # ends it
```

`amy start` is enough on its own. Its loop discovers new work on every pass, so
there is nothing to run before it. Where the machine has a supervisor (launchd,
systemd or Task Scheduler), the loop runs under it and is started again if it
dies; `--detached` runs it without one.

`amy stop --all` is the handbrake: it ends every loop and run in flight, and
nothing starts until the next `amy start`. See [Running it](running.md).

## 5. Put the skills in your harnesses

```sh
amy skills                # finds the harnesses on this machine and asks
```

amy is driven from Claude Code, Codex, Hermes or a terminal, so its skills
install into each harness it finds. They ship inside `@amykit/cli` and move with
it. See [Harnesses and skills](../concepts/harnesses.md). To drive it from
Slack or Telegram instead, see [the chat](../guides/the-chat.md).

## What to read next

- **It should do *my* process.** → [Write a workflow](../guides/write-a-workflow.md)
- **It should talk to *my* tools.** → [Write a plugin](../guides/write-a-plugin.md)
- **It did something I did not expect.** → [Status and doctor](status-and-doctor.md), then [Events](../concepts/events.md)
- **The words are new to me.** → [Project, workflow, plugin](../guides/project-workflow-plugin.md)
