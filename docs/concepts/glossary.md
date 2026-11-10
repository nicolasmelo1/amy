---
title: Glossary
description: The words amy uses, each in a few sentences, with the page that says more.
group: How it works
order: 1
---

# Glossary

Each term below is what the word means in amy's code, in `packages/core/src` and
`packages/cli/src`. The guides link here the first time they use one.

## Action

Something a workflow asks to happen, written as a name and a payload, such as
`implement` or `open-pull-request`. The core ships a catalogue of actions, each
tied to the port and method that runs it; a workflow orders them, and a plugin
that adds a new one brings the port that runs it in the same package.
More: [Actions](actions.md).

## Diagram

A workflow's shape, drawn as a Mermaid `stateDiagram-v2` in a `workflow.mmd`
file beside its code. amy reads the states, the start, the ends and the arrows
from it, and classes such as `waiting` or `attention` mark how a state behaves.
The file renders on GitHub with nothing installed.
More: [Workflows](workflows.md).

## Engine

What moves work. `discover` finds work that is not on the queue yet, and
`tick` advances one item by one move. A plugin mounts it like
anything else: `@amykit/plugin-serial-engine` moves one item per tick, and
`@amykit/plugin-concurrent-engine` also moves every lane of a fork at once.
More: [The engine](the-engine.md).

## Harness

One coding agent CLI reduced to a single method, `ask(prompt, cwd)`, which
answers with text and an account of what the run cost. Claude Code, Codex and
Hermes are each a harness plugin. They contribute themselves, and the agent
relay mounts the `agent` port, trying them in the order your ladder names.
More: [Harnesses, the ladder and skills](harnesses.md).

## Plugin

A package that amy mounts at boot, whose `register` adds things to a registry:
ports, actions, an engine, a workflow, or contributions another plugin reads.
It is written with `definePlugin`, and its settings are its own slice under
`plugins:` in `config.yaml`, checked against the schema it declares. The queue,
the store, the harnesses and the workflow itself all arrive this way.
More: [Plugins and the registry](plugins.md).

## Port

A named slot in the core, such as `tracker`, `agent`, `conversation` or
`code-host`, that one mounted plugin fills with an implementation of the
contract the core defines. Mounting the same kind twice fails at boot. A
workflow declares the ports it needs, and a mount missing one is refused.
More: [Ports](ports.md).

## Profile

A name under `workflows:` in `config.yaml` that points at one workflow and says
what mounts under it. It is what you type after `--workflow`, and it owns the
directory where that workflow's records, queue and log live. One invocation of
amy drives one profile.
More: [Workflows and profiles](../start/workflows-and-profiles.md).

## Project

A directory that holds a `brief/`, a `workflow/` or a `prove/` folder, each
exporting a workflow. amy derives one workflow from the folders that walks
BRIEF, WORK, PROVE and DONE, each phase a call to the workflow in its folder,
all under one profile. What the brief settled is what the proof is asked to show.
More: [What a project is](../guides/what-a-project-is.md).

## Record

What amy keeps about one piece of work (`WorkRecord`): its id, the state it is
in, the history of its moves, and per state the attempts that tried something
and the looks that only checked. A workflow adds its own fields, and the
`store` port saves it.
More: [The engine](the-engine.md).

## State

A place in a workflow's diagram where a record can be. The workflow's decision
for that state reads the record and what was observed, and returns where the
work goes next and which actions run on the way. A waiting state spends no
attempt while it waits, and a terminal state ends the work.
More: [Workflows](workflows.md).

## Workflow

The order work moves in: a diagram, a decision per state, and the actions,
joined by one `defineWorkflow` call. What `defineWorkflow` returns is a plugin
that registers the workflow when amy mounts it, so a workflow is installed and
configured like any other plugin.
More: [Workflows](workflows.md).
