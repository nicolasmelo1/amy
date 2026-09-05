---
title: amy
description: A state machine you leave running. Everything in it is a plugin, and the workflow is yours.
group: ""
order: 0
---

# amy

**Leave it running.** *(**A**utomate **MY** work)*

You pick up a ticket. Writing the code is not the hard part any more — an agent
is already good at that. The long part is everything *around* it: reading the
ticket, asking when something is unclear, running the checks, opening the pull
request, answering the review bot, picking a reviewer, dealing with their
comments, handing it to QA. That takes days, and most of it is waiting on other
people.

amy is a small machine that sits there and walks it one step at a time.

```sh
amy start                            # off it goes, in the background
amy status                           # where everything stands
amy btw "bump the deps in the api"   # something you thought of in passing
```

## Start here

| | |
| :-- | :-- |
| [Overview](start/overview.md) | What it is, and the one idea the rest follows from. |
| [Quickstart](start/quickstart.md) | Five minutes from nothing to one move. |
| [Installation](start/installation.md) | One install per machine, and why. |
| [Configuration](start/configuration.md) | Every key, and the ones that will bite you. |

## The two things people come here to do

**Drive it.** [Running it](start/running.md) is the loop, the handbrake and the
one-move-at-a-time rule. [Status and doctor](start/status-and-doctor.md) is how
you read it, and how you find out what is wrong before it touches a ticket.

**Change it.** The process amy walks is not baked in — it is a
[workflow](concepts/workflows.md), which is a small package you can read in one
sitting. So is the thing that talks to your tracker, the thing that opens pull
requests, the agent it asks, and where it writes things down. Every one of
those is a [plugin](concepts/plugins.md), and changing one is a line of config.

- [Write a plugin](build/write-a-plugin.md) — an adapter for something amy has never heard of.
- [Write a workflow](build/write-a-workflow.md) — your process, not somebody else's.

## Why the process is not baked in

Your team does not work like mine. A tool that ships somebody else's process is
a tool that is *nearly* right for you, and nearly-right is where automation goes
to be abandoned. So amy ships the machine, and you assemble the process before
you use it.

Three come in the box, and a fourth is an afternoon:

| | |
| :-- | :-- |
| **ticket-to-qa** | a tracker ticket, all the way to a QA handoff |
| **note-to-plan** | friction amy hit becomes a written plan in the right repo |
| **errand** | something you said in passing becomes a pull request |

## It lives *under* your tools, not inside one

amy is installed once on your machine and keeps running on its own. Claude Code,
Codex, Hermes, a terminal, your phone at 2am — those are all doors into the same
machine.

```text
   Claude Code      Codex       Hermes       your terminal
        └──────────────┴───────────┴──────────────┘
                            amy
              one install, one memory, always up
```

Close the laptop lid and it keeps its place. Ask from a different app tomorrow
and you get the same answer, because the state belongs to amy and not to the
conversation you happened to be having.

## About this documentation

Half of what follows is generated from the code on every build, and the gate
goes red when the two disagree. Anything in a table of commands, settings,
ports, actions, events or states was read out of the thing it describes — see
[how the documentation is generated](development/documentation.md).
