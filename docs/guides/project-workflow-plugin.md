---
title: Project, workflow or plugin
description: How to tell a project, a workflow and a plugin apart, and which one your job needs.
group: Guides
order: 1
---

# Project, workflow or plugin

Everything amy runs is a [plugin](../concepts/glossary.md#plugin). A
[workflow](../concepts/glossary.md#workflow) is a plugin that says the order
work moves in. A [project](../concepts/glossary.md#project) is a folder whose
phases are workflows. Each one is a different answer to a different need, and
this page tells them apart.

## Plugin: amy can reach something new

A plugin is a package that amy mounts at boot. Its `register` fills a
[port](../concepts/glossary.md#port), adds an
[action](../concepts/glossary.md#action), mounts an
[engine](../concepts/glossary.md#engine), or contributes to something another
plugin reads. It says what it does, and it moves no work by itself.

You need one when amy has to talk to something it cannot reach yet: Linear or
a `next-steps.md` table as the tracker, Slack or Telegram as the chat, Claude
Code, Codex or Hermes as the [harness](../concepts/glossary.md#harness) that
does the agent's steps, GitHub as the code host.

```sh
amy add @amykit/plugin-telegram
```

Its settings are its own slice under `plugins:` in `config.yaml`, checked at boot
against the schema the plugin declares:

```yaml
plugins:
  "@amykit/plugin-telegram":
    operator: "123456789"
```

Next: [Install a plugin](install-a-plugin.md), or
[Write a plugin](write-a-plugin.md) when none does what you need.

## Workflow: amy should drive a routine

A workflow is what amy does with a piece of work, step by step. It has a
[diagram](../concepts/glossary.md#diagram) in `workflow.mmd` that draws every
[state](../concepts/glossary.md#state) the work can be in, a decision per state
that says where it goes next, and the actions that run on the way.
`defineWorkflow` joins them, and what it returns is a plugin, so a workflow is
installed and configured the way any plugin is.

You need one when there is a routine you want amy to keep moving: a ticket
walked to a QA handoff, a note turned into a plan, an errand done and reported.
Each piece of work is one [record](../concepts/glossary.md#record), and the
workflow decides its next move every time amy looks at it.

A [profile](../concepts/glossary.md#profile) under `workflows:` names the
workflow amy drives:

```yaml
workflows:
  oncall:
    workflow: oncall                         # ~/.amy/workflows/oncall
  qa:
    workflow: "@amykit/workflow-ticket-to-qa" # a package
```

`amy workflow new oncall` writes that directory and that profile, and what it
writes runs before you edit it.

Next: [Compose workflows](compose-workflows.md) to build from the shipped ones,
or [Write a workflow](write-a-workflow.md) to draw your own.

## Project: the work must be briefed and proven

A project is a directory with a `brief/`, a `workflow/` and a `prove/` folder,
each exporting a workflow. You write no diagram for it: amy reads the folders
and derives one workflow that walks BRIEF, WORK, PROVE and DONE. The brief
settles what the work is and the criteria it must meet, the work phase does
it, and the proof is asked to show exactly those criteria. A proof that fails
sends the work back.

You need one when doing the work is not enough: when a feature should be
groomed before anybody starts and shown to hold in the running system before
anybody calls it done.

```yaml
workflows:
  shop:
    workflow: "~/work/shop/brief"   # any phase folder names the whole project
```

Next: [What a project is](what-a-project-is.md), and
[`examples/a-whole-project`](../../examples/a-whole-project) for one built only
from shipped workflows.

## Choosing

| You want amy to | You need | You start with |
| :-- | :-- | :-- |
| read a tracker, post in a chat, run an agent it does not know | a plugin | `amy add <package>` |
| keep a routine moving, one step at a time | a workflow | `amy workflow new <name>` |
| take a feature from its brief to the proof that it holds | a project | `brief/`, `workflow/` and `prove/` folders |

They nest. A project's phases are workflows, a workflow is a plugin, and both
lean on the plugins that fill the ports they need. When a workflow asks for a
port no mounted plugin fills, amy refuses to boot and names the port, so the
mount tells you which plugin is missing.
