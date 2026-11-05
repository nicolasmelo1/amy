---
title: MAD and BEP
description: The two opinions amy does not negotiate — how one workflow is built, and how a piece of work is carried from a brief to its proof.
group: How it works
order: 1.5
---

# MAD and BEP

amy is a framework for workflows the way Rails is one for web applications. A
framework is a set of opinions, and amy has two that are not configurable:

- **MAD** is how **one workflow is built**: Mermaid, Act, Decide.
- **BEP** is how **one piece of work is carried**: Brief, Execute, Prove.

They are orthogonal. MAD is anatomy and BEP is lifecycle. Every phase of a BEP
walk is a workflow built the MAD way, and the walk itself is a workflow too,
with a diagram amy derives.

## MAD: Mermaid, Act, Decide

A workflow is three pieces, always in the same place:

| Piece | Where | What it says |
| --- | --- | --- |
| **Mermaid** | `workflow.mmd` | where work *can* go: the states, where it starts, waits and ends, and every arrow between them |
| **Decide** | `decide` in `defineWorkflow` | where *this* piece of work goes next, given what the world says. Pure: no I/O, no clock |
| **Act** | `actions` in `defineWorkflow` | what happens in the world: an agent run, a branch, a message. Reached only through the ports the workflow `needs` |

The name is in that order, and the work runs in another one. A look reads the
diagram, decides and then acts.

What amy holds you to:

- **No diagram, no workflow.** A workflow mounts only with a `workflow.mmd`
  beside it. Its states are read from the file and declared nowhere else
  ([a workflow is a Mermaid diagram](../design/a-workflow-is-a-mermaid-diagram.md),
  [a workflow is drawn, or it does not mount](../design/a-workflow-is-drawn-or-it-does-not-mount.md)).
- **One decision per drawn state.** A state the diagram draws without a key in
  `decide`, or a key for a state it does not draw, is refused at boot by name
  ([a workflow is three pieces](../design/a-workflow-is-three-pieces.md)). A
  decision may start as the core's `notWritten()` stub, which settles the
  record saying so instead of guessing a move.
- **A move is one the diagram draws.** The walkthrough fails an `advance` to a
  state the diagram does not connect, naming both ends. At runtime the move is
  still made and written to the event log as `workflow.undrawn_transition`,
  because refusing it would leave somebody's work stuck over a drawing mistake.
- **An action uses the scope it is handed.** Each piece receives the ports,
  config, policy and checkouts as its `scope`. No workflow builds a runtime of
  its own around them.
- **Only declarations mount.** A plugin that registers a workflow by hand
  with `registry.workflow` is refused, naming it.

MAD is not MVC. The view is not part of a workflow: the window draws the same
diagram, and [a view is data](../design/a-view-is-data.md). Nor is it a file
layout. `amy workflow new` writes `workflow.mmd`, `decide.ts`, `actions.ts`
and an `index.ts` that puts them into one `defineWorkflow` call. A large
workflow can split further, and the loader looks for no file by name except
the diagram. A file the loader discovered on its own would be a second way of
declaring what the call already says
([nothing is declared twice](../design/nothing-is-declared-twice.md)).

## BEP: Brief, Execute, Prove

A piece of work is briefed before it starts and proven before it ends. The
walk every project gets is `BRIEF → WORK → PROVE → DONE`, each phase a call to
the workflow its folder exports
([a project is brief, work and proof](../design/a-project-is-brief-work-and-proof.md)):

| Phase | Folder | State | What it settles |
| --- | --- | --- | --- |
| **Brief** | `brief/` | `BRIEF` | the criteria: what *done* means for this work |
| **Execute** | `workflow/` | `WORK` | the change itself |
| **Prove** | `prove/` | `PROVE` | that each criterion the brief settled holds |

What amy holds you to:

- **What the brief settled is what the proof is asked to show.** What BRIEF
  returns is passed to WORK and PROVE as it is, with nothing translated in
  between. A criterion the brief settled and the proof never answers keeps
  the work from DONE.
- **A refused proof goes back to the work**, carrying what did not hold.
- **The default is all three.** A phase can be left out only by saying why,
  in the declaration's `phases:` member. The errand has no brief and no prove,
  and its declaration says why for each. A phase that is neither present nor
  explained is refused at mount, naming its folder.

So BEP is not "every workflow has three phases". A workflow may leave a phase
out, but it has to write down the reason, and `amy status` shows that reason.

The phases keep the names they have in code (`brief/`, `workflow/`,
`prove/`, and `BRIEF`, `WORK`, `PROVE`). *Execute* is the E in the acronym and
the `WORK` phase in the walk. *Plan* would have read better, but amy already
uses that word for three other things: the files under `plans/`, the pure
`plan()` that `decide` composes into, and the plans `sf` holds a change to.
