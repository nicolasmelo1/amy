---
title: Overview
description: What amy is, the one idea the rest follows from, and what it is not.
group: Start here
order: 1
---

# Overview

amy is a state machine you leave running. It picks a piece of work up, makes
**one move**, writes down what happened, and puts the next look on a queue. Then
it does it again. That is the whole product.

Everything else in this documentation is about the two questions that follow
from it: *what counts as a move*, and *who actually does it*.

## The one idea

**The decision is a pure function, and it is the only thing that decides.**

```ts
plan(record, observation, policy): Plan
```

It reads a persisted record and a snapshot of the outside world, and returns one
of four things: `act` (do work, stay put, look again straight away), `advance`
(move to another state, with one-shot effects), `wait` (back off), or `settled`
(done, stop queueing).

It touches no tracker, no code host, no repository and no agent. Effects are
only ever *described* by the machine and *executed* by something else, so what
the machine decided and what the world did stay separable — which is why a whole
sixteen-state lifecycle can be walked end to end in a test with no I/O at all,
including the paths where a review requests changes and where the agent
disagrees with a reviewer.

Everything hard in this repository is downstream of keeping that function pure.

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
| **The core** | The catalogue of actions, the port contracts, the generic work record, the plan, and the registry that mounts everything. It owns no domain. | [Architecture](../concepts/architecture.md) |
| **A workflow** | The order actions happen in, and how each one runs. Two halves: a pure `plan()` and a runtime. | [Workflows](../concepts/workflows.md) |
| **An engine** | Claiming from the queue, counting attempts, asking the budget, obeying the handbrake. Knows nothing about tickets. | [The engine](../concepts/the-engine.md) |
| **A plugin** | Everything else: the tracker, the forge, the agents, the queue on disk, the notification channels. | [Plugins](../concepts/plugins.md) |

## What "everything is a plugin" actually buys you

Three things, and it is worth being concrete about which.

**A process that is yours.** The lifecycle amy walks is a package. Naming a
different one in the config is the whole change — no fork, no flag, no case in a
switch. See [Workflows and profiles](workflows-and-profiles.md).

**An adapter for a tool nobody here has heard of.** Your tracker is not Linear,
your forge is not GitHub, your agent is something internal. Each of those is one
port with a handful of methods. See [Write a plugin](../build/write-a-plugin.md).

**A machine that refuses early.** Because plugins are assembled rather than
constructed, `mount()` can check the whole shape before a ticket is touched: a
plugin that will not import, a setting that is not one it declared, two plugins
both claiming to be the tracker, an action the workflow emits that nothing can
run. Removing the agent plugin does not produce a crash three layers deep; it
produces three lines naming the three actions that would have failed.

## What it is not

**It is not a coding agent.** It calls one. Claude Code, Codex and Hermes are
plugins here, and the thing amy adds is everything around the call: what to do
next, what it costs, what happens when it fails, and who to tell.

**It is not a CI system.** It runs your gate and reads the result; it does not
try to be the gate.

**It is not a chat interface.** It has no conversation and no memory of one. It
has a record per piece of work and an append-only log, and both survive the
process that wrote them.

**It is not multi-tenant.** One install, one machine, one operator, state in
`~/.amy`. It works on tickets naming real colleagues and real customers, and
that shape is deliberate — see [Security](security.md).

## Where to go next

- Five minutes and one move: [Quickstart](quickstart.md).
- The argument for each design decision: [How it works](../concepts/architecture.md).
- Making it do your process: [Write a workflow](../build/write-a-workflow.md).
