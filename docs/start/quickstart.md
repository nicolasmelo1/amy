---
title: Quickstart
description: Five minutes from nothing to one move you can watch.
group: Start here
order: 2
---

# Quickstart

Five minutes, four commands, and one move you can watch. Nothing here touches a
real ticket until step 3, and step 3 is one move at a time on purpose.

## 1. Install — 1 min

```sh
npm install -g @amykit/cli
amy --version             # 0.2.0 (83ef192, built 2026-09-05T18:44:12Z)
```

Nothing to clone, no install script, and the same command on macOS, Linux and
Windows. It installs the command and nothing else — what your workflows need
comes in the next step, once there is a config saying which ones you have.

One install per machine, not one per repository: amy drives work in checkouts
all over the disk and is reached from whichever agent harness you happen to be
in, so everything it knows lives in `~/.amy`. `AMY_HOME` overrides that; nothing
else does. See [Installation](installation.md).

## 2. Set it up — 2 min

```sh
amy init                  # templates, and the packages your config needs
# edit ~/.amy/config.yaml and ~/.amy/roster.yaml
amy roster confirm        # stamp today's date
amy doctor                # every dependency, checked before it touches a ticket
```

`init` writes the two templates, then works out which packages the workflows in
your config need and offers to install the ones this machine has not got:

```text
These are not installed yet:
  @amykit/plugin-linear
  @amykit/plugin-github
  @amykit/plugin-claude

Install them now? [Y/n]
```

It asks rather than assuming — installing into a global prefix is a change to
the machine, not to amy. `--install` says yes without asking, which is what a
pipeline uses; with nothing to ask on it prints the command instead of running
it.

The Linear personal API key comes from Settings → Security and access, and goes
in `~/.amy/.env`. Anything already exported in the shell wins over the file.

`amy doctor` checks the config, each plugin's settings against the schema that
plugin declared, the roster's freshness, the API key, `gh`, `claude` and `git`,
the notification target, and that every configured repository is actually
checked out. It exits non-zero, so it is safe to gate on.

If you would rather be walked through it, `/amy-init` does the same interview
and reads the result back in numbers.

## 3. Watch it make one move — 1 min

```sh
amy discover              # put in-progress tickets on the queue
amy tick                  # exactly one move, then exit
amy status                # where everything stands, and what waits on you
```

`tick` is the whole product in one command. It claims one item, asks the
workflow what to do, does exactly that, writes the record and queues the next
look. Run it until you trust it.

This is the step to spend time on. Everything after it is the same thing on a
timer.

## 4. Leave it running — 1 min

```sh
amy start --every 60      # the loop, in the background, looking every minute
amy status                # says whether the loop is up, and since when
amy stop                  # ends it
```

`pause` and `stop` are different things. `amy pause "deploying"` is the
handbrake: it ends work in flight, starts nothing new, and the loop stays up
until `amy resume`. `amy stop` ends the loop itself. Pausing survives a reboot,
because it is a file; the loop does not, because it is a process.

## 5. Put the skills in your harnesses — 30 sec

```sh
amy skills                # finds the harnesses on this machine and asks
```

amy is driven from Claude Code, from Hermes, from a terminal — so its skills
install into each harness it finds rather than into one project. They ship
inside `@amykit/cli`, so they cannot drift out of step with the amy that ships
them. See [Harnesses and skills](../concepts/harnesses.md).

## What to read next

You have a working install. The three things people want next:

- **It should do *my* process, not this one.** → [Write a workflow](../build/write-a-workflow.md)
- **It should talk to *my* tools.** → [Write a plugin](../build/write-a-plugin.md)
- **It did something I did not expect.** → [Status and doctor](status-and-doctor.md), then [Events](../concepts/events.md)
