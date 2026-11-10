---
title: MAD and BEP
description: The opinions amy does not negotiate, how one workflow is built and how a piece of work is carried from a brief to its proof.
group: How it works
order: 7
---

# MAD and BEP

amy is an opinionated state machine framework. Most of it is configured your
way, and a pair of opinions is not configurable:

- **MAD** is how **one workflow is built**: Mermaid, Act, Decide.
- **BEP** is how **one piece of work is carried**: Brief, Execute, Prove.

MAD is anatomy and BEP is lifecycle. Every phase of a BEP walk is a workflow
built the MAD way, and the walk itself is a workflow too, with a diagram amy
derives.

## MAD: Mermaid, Act, Decide

A workflow is a diagram and one `defineWorkflow` call:

| Piece | Where | What it says |
| --- | --- | --- |
| **Mermaid** | `workflow.mmd` | where work *can* go: the states, where it starts, waits and ends, and every arrow between them |
| **Decide** | `decide` in `defineWorkflow` | where *this* piece of work goes next, given what the world says. Pure: no I/O, no clock |
| **Act** | `actions` in `defineWorkflow` | what happens in the world: an agent run, a branch, a message. Reached only through the ports the workflow `needs` |

The name reads in that order and a look runs in another: it reads the
diagram, decides, then acts.

What amy holds you to:

- **No diagram, no workflow.** A workflow mounts only with a `workflow.mmd`
  beside it. Its states are read from that file and declared nowhere else.
  Why: [a workflow is a Mermaid diagram](../design/a-workflow-is-a-mermaid-diagram.md),
  [a workflow is drawn, or it does not mount](../design/a-workflow-is-drawn-or-it-does-not-mount.md).
- **One decision per drawn state.** A drawn state with no key in `decide`, or
  a key for a state the diagram does not draw, is refused at boot by name. A
  decision may start as the core's `notWritten()` stub, which settles the
  record and says so instead of guessing a move. Why:
  [the pieces of a workflow](../design/a-workflow-is-three-pieces.md).
- **A move is one the diagram draws.** The walkthrough fails an `advance` the
  diagram does not connect, naming both ends. At runtime the move is still
  made and logged as `workflow.undrawn_transition`, because refusing it would
  leave somebody's work stuck over a drawing mistake.
- **An action is declared once.** The actions a decision may emit are the keys
  of `actions`, and a plan carrying anything else is refused before its first
  action runs. Why:
  [the workflow contract changes once](../design/the-workflow-contract-changes-once.md).
- **An action uses the scope it is handed.** Each piece receives the ports,
  config, policy and checkouts as its `scope`. No workflow builds a runtime of
  its own around them.
- **Only declarations mount.** A plugin that registers a workflow by hand with
  `registry.workflow` is refused, naming it. Why:
  [a workflow is one declaration](../design/a-workflow-is-one-declaration.md).

MAD is not MVC. The view is not part of a workflow: the window draws the same
diagram, and [a view is data](../design/a-view-is-data.md). Nor is it a file
layout. `amy workflow new` writes `workflow.mmd`, `decide.ts`, `actions.ts`
and an `index.ts` that joins them in one `defineWorkflow` call. A large
workflow can split further, and the loader looks for no file by name except
the diagram. A file the loader found on its own would be a second place
declaring what the call already says. Why:
[nothing is declared twice](../design/nothing-is-declared-twice.md).

## BEP: Brief, Execute, Prove

A piece of work is briefed before it starts and proven before it ends. A
project is the folder holding its phases, and the walk amy derives from it is
`BRIEF → WORK → PROVE → DONE`, each phase a call to the workflow its folder
exports. Why:
[a project is brief, work and proof](../design/a-project-is-brief-work-and-proof.md).

| Phase | Folder | State | What it settles |
| --- | --- | --- | --- |
| **Brief** | `brief/` | `BRIEF` | the criteria: what *done* means for this work |
| **Execute** | `workflow/` | `WORK` | the change itself |
| **Prove** | `prove/` | `PROVE` | that each criterion the brief settled holds |

What amy holds you to:

- **What the brief settled is what the proof is asked to show.** What BRIEF
  returns is handed to WORK and PROVE as it is, with nothing translated in
  between. After PROVE, the walk checks every criterion was answered; one left
  unanswered sends the work back to WORK.
- **A refused proof goes back to the work**, carrying what did not hold.
- **A later phase can hold the brief.** When WORK or PROVE asks the brief for
  something, such as a scenario to prove, the walk waits in `GROOMED` after
  BRIEF until every phase's brief check is green.
- **The default is every phase.** A phase can be left out only by saying why,
  in the declaration's `phases:` member. The errand has no brief and no prove,
  and its declaration says why for each. A phase that is neither present nor
  explained is refused at mount, naming its folder.

So BEP does not force every phase on every workflow. A workflow may leave a
phase out, but it has to write the reason down, and `amy status` shows it.
What a proof records, and why passing tests is not one, is in
[a phase is proven, not asserted](../design/a-phase-is-proven-not-asserted.md).

The phases keep their names in code (`brief/`, `workflow/`, `prove/`, and
`BRIEF`, `WORK`, `PROVE`). *Execute* is the E in the acronym and the `WORK`
state in the walk. *Plan* would have read better, but amy already uses that
word for the files under `plans/`, for the `Plan` a decision returns, and for
the plans `sf` holds a change to.
