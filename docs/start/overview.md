---
title: Overview
description: What amy is, the idea the rest follows from, and what it is not.
group: Start here
order: 1
---

# Overview

amy is an opinionated state machine framework where everything is a plugin,
configured your way and left to run on Claude Code, Codex and Hermes
subscriptions. It picks a piece of work up, makes **one move**, writes down what
happened, and puts the next look on a queue. Then it does it again.

The rest of this documentation answers what counts as a move, and who makes it.

## The idea the rest follows from

**The decision is pure, and it is the only thing that decides.**

Each state a workflow draws has a decision. It reads the persisted record, a
snapshot of the outside world and the workflow's policy, and returns one of:
`act` (do work, stay, look again straight away), `advance` (move to another
state, with its actions), `wait` (look again later) or `settled` (done).

```ts
decide[record.state](record, observation, policy) // → act | advance | wait | settled
```

It touches no tracker, no code host, no repository and no agent. The machine
describes what should happen and something else does it, so what it decided and
what the world did stay apart. That is why the whole ticket-to-qa lifecycle,
including a review that requests changes, can be walked in a test with no I/O.

## The pieces

```text
   your config
        │
        ▼
   ┌─────────────────────────────────────────────────────────┐
   │  mount()   assembles plugins, refuses at boot by name    │
   └─────────────────────────────────────────────────────────┘
        │                    │                     │
        ▼                    ▼                     ▼
   a workflow            an engine             the adapters
   what happens next     drives it,            tracker, code host,
   and how each          holds the queue,      agent, notifier,
   step is done          the budget, the       store, queue, gate
                         handbrake
```

| Piece | What it owns | Documented in |
| :-- | :-- | :-- |
| **The core** | The port contracts, the generic work record, the plan, and the registry that mounts everything. It owns no domain. | [Architecture](../concepts/architecture.md) |
| **A workflow** | A `workflow.mmd` diagram of where work can go, a decision per state, and the actions, joined by one `defineWorkflow` call. | [Workflows](../concepts/workflows.md) |
| **An engine** | Claiming from the queue, counting attempts, asking the budget, obeying the handbrake. It knows nothing about tickets. | [The engine](../concepts/the-engine.md) |
| **A plugin** | Everything else: the tracker, the forge, the agents, the queue on disk, the chat, the notification channels. | [Plugins](../concepts/plugins.md) |

Why a workflow has that shape: [a workflow is one declaration](../design/a-workflow-is-one-declaration.md)
and [the workflow contract changes once](../design/the-workflow-contract-changes-once.md).
[Project, workflow, plugin](../guides/project-workflow-plugin.md) tells the words apart.

## What "everything is a plugin" buys

**A process that is yours.** The lifecycle amy walks is a directory of yours or
a package somebody published, and naming a different one in the config is the
change. `amy workflow new` writes the first one. See
[Workflows and profiles](workflows-and-profiles.md) and
[Write a workflow](../guides/write-a-workflow.md).

**An adapter for a tool nobody here has heard of.** Your tracker is not Linear,
your forge is not GitHub, your agent is something internal. Each of those is a
port with a handful of methods. See [Write a plugin](../guides/write-a-plugin.md).

**A machine that refuses early.** `mount()` checks the whole shape before a
ticket is touched: a plugin that will not import, a setting it did not declare,
a port claimed by more than one plugin, an action the workflow emits that nothing
can run. Removing the agent plugin does not crash a tick later; the boot names
each action that would have failed. Why it builds in one pass:
[a mount builds once](../design/a-mount-builds-once.md).

## What it is not

**It is not a coding agent.** It calls one. Claude Code, Codex and Hermes are
plugins here, and amy adds what surrounds the call: what to do next, what it
costs, what happens when it fails, and who to tell.

**It is not a CI system.** It runs your gate and reads the result.

**It is not a chat bot.** It answers in Slack or Telegram when a chat plugin is
mounted, and asks there when it needs a person (see [the chat](../guides/the-chat.md)),
but the work lives in a record per piece of work and an append-only log, and
both survive the process that wrote them.

**It is not multi-tenant.** One install, one machine, one operator, state in
`~/.amy`. It works on tickets naming real colleagues and real customers, and
that shape is deliberate. See [Security](security.md).

## Where to go next

- One move you can watch: [Quickstart](quickstart.md).
- Why each piece is shaped the way it is: [How it works](../concepts/architecture.md).
- Making it do your process: [Write a workflow](../guides/write-a-workflow.md).
