# Examples

amy itself lives in [`packages/`](../packages): the engine, the command line,
and what they need to run. The engine knows nothing about tickets, pull
requests or notes. Everything that says "first do this, then that" is a **workflow**, and
the workflows here are examples of what you can build on top of it.

They are real, published packages, so you can install any of them as they are:

```sh
amy add @amykit/workflow-errand
```

Or read one, copy it and change it until it does your process. That is what
they are here for.

## Which one to read first

| Example | What it does | Read it if |
| :-- | :-- | :-- |
| [workflow-pull-request](workflow-pull-request) | Opens a pull request for a branch. Other workflows call it. | you want the smallest workflow there is, and to see one workflow call another |
| [workflow-errand](workflow-errand) | `amy btw "..."` becomes a draft pull request or an answer. | you want a short workflow that does real work with an agent |
| [workflow-note-to-plan](workflow-note-to-plan) | `amy note "..."` becomes a plan, checked and opened as a pull request. | you want to see a step that loops until a check is green |
| [workflow-feature-grooming](workflow-feature-grooming) | Waits until a feature's brief is complete, then hands on its criteria. | you want to see a workflow that waits on a person |
| [workflow-ticket-to-qa](workflow-ticket-to-qa) | Walks a ticket from "in progress" to "ready for QA". | you want the whole thing: tracker, agent, checks, review, escalation |
| [a-whole-project](a-whole-project) | Brief, work and proof, each phase one of the workflows above. | you want to see workflows composed into a project |

## What a workflow is made of

Every example has the same shape:

```text
workflow-errand/
├── workflow.mmd     the states and the arrows between them, as a diagram
├── src/
│   ├── decide.ts    given where the work is, what happens next
│   └── plugin.ts    how each step is done, and what it needs mounted
└── tests/           the workflow walked from start to end, with nothing real touched
```

The diagram is the source of truth: amy takes the states from `workflow.mmd`
when it mounts the workflow, and refuses one it cannot read. `amy workflow new
<name>` writes a workflow that already runs, so you start by changing something
that works instead of filling an empty file.

→ [Write a workflow](../docs/build/write-a-workflow.md) · [Workflows and profiles](../docs/start/workflows-and-profiles.md)
