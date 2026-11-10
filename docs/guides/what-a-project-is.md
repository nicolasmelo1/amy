---
title: What a project is
description: A project is brief, work and proof, read from the folders you give it.
group: Guides
order: 6
---

# What a project is

A [project](../concepts/glossary.md#project) is a directory with a `brief/`, a
`workflow/` or a `prove/` folder in it. Each folder exports a
[workflow](../concepts/glossary.md#workflow), and the directory around them is
the project. amy reads the folders and builds the walk itself: you write no
[diagram](../concepts/glossary.md#diagram) and bind nothing by hand.

```
shop/
  brief/       what the work is, and the criteria it must meet
  workflow/    doing it
  prove/       showing, in the running system, that the criteria hold
```

Most work goes wrong in the phase nobody thought about. A project makes the
missing one visible: amy will not start work that was never briefed, and will
not call work done that was never proven.

## The walk

The project is one workflow, derived in `packages/cli/src/project.ts`. Its
[record](../concepts/glossary.md#record) walks BRIEF, WORK, PROVE and DONE.
Each phase is a call to the workflow in its folder, so each phase keeps a child
record of its own, the way any call does. The whole project is one
[profile](../concepts/glossary.md#profile) and one loop.

The arrows follow from the phases' own ends:

- every end of BRIEF and of WORK goes on to the next phase;
- PROVE ending in `refused` goes back to the phase before it, carrying what
  did not hold;
- any other end of PROVE goes to a check that every criterion the brief
  settled was answered. One left unanswered sends the work back to WORK.

When a later phase declares a brief of its own, the walk also waits after
BRIEF, in a waiting [state](../concepts/glossary.md#state) named `GROOMED`, until every phase's brief check is green.

## What the brief settles is what the proof shows

What BRIEF returns is kept on the project's record under the phase's name, and
handed to WORK and PROVE wherever they declare an input. A prove phase that
takes `criteria` is asked to show exactly the criteria the brief settled, with
nothing translated on the way. Why it works this way:
[a project is brief, work and proof](../design/a-project-is-brief-work-and-proof.md),
which replaced the earlier
[one profile per phase](../design/a-project-is-three-phases.md).

`@amykit/plugin-prove` is the shipped proving phase. It reads the `Scenario`
the brief names, leases the resources it needs, prepares its fixtures, runs
its steps through the operations other mounted [plugins](../concepts/glossary.md#plugin) offer (a browser, a
command), and ends `PROVEN` or `refused`. A step only a person can do waits for
their answer. Why the proof is a plugin:
[a phase is proven, not asserted](../design/a-phase-is-proven-not-asserted.md).
[Prove a phase](../build/prove-a-phase.md) shows a scenario in full.

## A phase that is not there

A missing folder has to be explained. The workflow your config names declares
the reason under `phases:`, and `amy status` and `amy doctor` show it:

```yaml
# what ticket-to-qa declares, in TypeScript, as its phases
brief: the ticket itself says what the work is
prove: the command gate's scenario run after every implementation is what proves the work
```

A phase neither present nor explained is refused when amy mounts the project,
naming the folder. A `test/` folder is refused too, naming `prove/`. A phase
folder whose module does not export a `defineWorkflow` declaration is refused
by its directory.

The shipped `errand`, `note-to-plan` and `ticket-to-qa` are walks of their own
and declare the phases they do not have this way. Each also mounts on its own,
outside any project.

## Configuring one

Name any of the phase folders as a profile's workflow; amy finds the others
beside it:

```yaml
workflows:
  shop:
    workflow: "~/work/shop/brief"
```

One project is one profile, so a config naming the same project twice is
refused. Its records, queue and log live under the project's own directory in amy's home, and the
briefs live where every phase can read them without the config naming a shared
path. `amy brief show <id>` and `amy brief check <id>` read a brief as the
workflow keeps it.

[`examples/a-whole-project`](../../examples/a-whole-project) builds a project
only from shipped workflows: `feature-grooming` as BRIEF, `ticket-to-qa` as
WORK and `plugin-prove` as PROVE. For WORK, the tracker can be Linear or a
table: `@amykit/plugin-next-steps` reads each row of a `next-steps.md` table on
the base branch as a work item, its plan the body
([a row of next steps is a ticket](../design/a-row-of-next-steps-is-a-ticket.md)).

Next: [Project, workflow or plugin](project-workflow-plugin.md) if a single workflow
is enough for your job.
