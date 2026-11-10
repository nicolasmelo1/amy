---
title: amy
description: An opinionated state machine framework where everything is a plugin, configured your way and left to run.
group: ""
order: 0
---

# amy

*(**A**utomate **MY** work)*

amy is an opinionated state machine framework where everything is a plugin. You
configure it your way and it keeps running on the Claude Code, Codex and Hermes
subscriptions you already have. It picks up a piece of work, makes one move,
writes down what happened, and queues the next look.

```sh
amy start                            # the loop, under the machine's supervisor
amy status                           # where everything stands
amy btw "bump the deps in the api"   # an errand, said in passing
```

## Start here

Install it, point it at your work, and watch it make one move.

| | |
| :-- | :-- |
| [Overview](start/overview.md) | What it is, and the idea the rest follows from. |
| [Quickstart](start/quickstart.md) | From nothing to one move you can watch. |
| [Installation](start/installation.md) | One install per machine, and where its state lives. |
| [Configuration](start/configuration.md) | The host's keys, and one slice per plugin. |
| [Running it](start/running.md) | The loop, the handbrake, and one move at a time. |
| [Workflows and profiles](start/workflows-and-profiles.md) | Which process a profile drives, and what it mounts. |
| [Status and doctor](start/status-and-doctor.md) | Where the work is, and what is wrong before it touches a ticket. |
| [Security](start/security.md) | What it can reach, and what it refuses. |

## Guides

Tell a project, a workflow and a plugin apart, then install, compose and write
them. Begin with [Project, workflow, plugin](guides/project-workflow-plugin.md),
then [install a plugin](guides/install-a-plugin.md),
[compose workflows](guides/compose-workflows.md),
[write a workflow](guides/write-a-workflow.md),
[write a plugin](guides/write-a-plugin.md),
[what a project is](guides/what-a-project-is.md) and
[the chat](guides/the-chat.md).

## How it works

The pieces, and why each one is shaped the way it is:
[architecture](concepts/architecture.md), [workflows](concepts/workflows.md),
[plugins](concepts/plugins.md), [ports](concepts/ports.md),
[the engine](concepts/the-engine.md), [the queue](concepts/the-queue.md) and the
[glossary](concepts/glossary.md).

## Build your own

Test what you wrote, prove a phase, and publish it:
[testing](build/testing.md), [prove a phase](build/prove-a-phase.md) and
[publishing](build/publishing.md).

## Reference

Generated from the code on every build: the [CLI](reference/cli.md),
[configuration](reference/configuration.md), [plugins](reference/plugins.md),
[workflows](reference/workflows.md), [events](reference/events.md) and
[contracts](reference/contracts.md).

## Packages

What is published, and how to get yours listed beside it: the
[catalogue](catalog/index.md).

## News

What shipped, and what is about to: the [changelog](changelog/index.md).

## Design notes

The argument behind each decision, kept where the decision can link to it. Each
page above links the notes behind what it describes; the contract a workflow
has today starts at [a workflow is one declaration](design/a-workflow-is-one-declaration.md).

## Development

Changing amy itself: [contributing](development/contributing.md),
[the gate](development/the-gate.md) and
[how the documentation is generated](development/documentation.md). Every table
of commands, settings, ports, actions, events or states in these pages was read
out of the code it describes, and the gate goes red when the two disagree.
