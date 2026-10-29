# A workflow is a Mermaid diagram

A workflow somebody designs should be theirs: a file they can read without amy,
put in a note, paste into a pull request and take to another tool. There is no
standard for workflows at the level Markdown is for text. There is one for
their *shape*: a Mermaid `stateDiagram-v2` block renders on GitHub in any
Markdown file, issue or comment, and in Obsidian, with nothing installed.

amy already draws its workflows that way, by hand. `/amy-show-me` writes a
`stateDiagram-v2` block from what it reads each time it is asked, and nothing
checks it against the code. The shape itself is written in four other places
that agree only by care:

- the states, as a `const` array in each workflow's `state.ts`;
- `waitingStates`, `initialState` and `terminalStates` on the `Workflow`;
- the `StateMachine` primitive's `states` and `transitions`, built per view;
- the transitions themselves, which are declared nowhere: they exist only as
  the `advance` calls inside `plan()`. The text renderer draws an edge only
  when the tree declares one — "the order of `states` is not a path" — so
  every strip drawn today is a line of names.

amy is a framework for workflows the way Rails is one for web applications:
a few pieces, always in the same place, and everything else derived from them
by convention. The diagram is the first of the three pieces, the one that says
where work can go. Deciding where it goes next, and doing it, are the other two
and stay in code, in the same `defineWorkflow` that
[a workflow is one declaration](a-workflow-is-one-declaration.md) gives every
workflow.

## What changes

**The shape of a workflow is a file beside it, and nothing else.** A workflow
is a directory. One under `~/.amy/workflows`, or a package root, holds
`workflow.mmd` beside its entry, and the host finds it there the way it already
finds `index.ts`. Nothing names the file and nothing is generated from it. The
host reads it when the workflow mounts and derives the states, the initial
state, the terminal states and the waiting states. The workflow declares none
of them. Declaring them as well as drawing them is refused at boot, because it
is the same fact said twice. A workflow written by hand without a diagram keeps
declaring its fields as it does today.

```mermaid
stateDiagram-v2
    classDef waiting stroke-dasharray: 4 4

    [*] --> NOTED
    NOTED --> DECLINED: not a repository I write into
    NOTED --> DRAFTED
    DRAFTED --> CHECKED
    CHECKED --> DRAFTED: check is red
    CHECKED --> PR_OPEN
    PR_OPEN --> DONE
    DONE --> [*]
    DECLINED --> [*]

    class PR_OPEN waiting
```

amy reads a subset of `stateDiagram-v2`, and every line of it is ordinary
Mermaid:

- `[*] --> S`, exactly once, names the initial state; `S --> [*]` names a
  terminal one.
- `A --> B` and `A --> B: label` are the transitions. A label is prose for a
  reader. amy does not interpret it.
- Classes say what an edge cannot say, and amy reads four of them:
  - `waiting`: nothing moves until the world does;
  - `attention`: it waits on the person whose work it is (*amy lives in the
    menu bar*);
  - `anywhere`: any state that is not terminal may move to it;
  - `returns`: it leaves to the state the record came from.

  The last two exist because real workflows have them. The private workflow
  amy runs at work escalates from every state its ceilings guard and resumes
  where it stopped. It hands a pull request merged by hand to QA from whichever state it was in.
  Drawing those as edges would be some twenty arrows each, and the diagram
  would stop being readable. Mermaid has no wildcard and no history state, so
  amy uses a class. A `note` beside the state says it in words for whoever
  reads the file elsewhere.
- Any other class, every `classDef` style, `%%` comments, `note` blocks and
  `direction` are left for whoever renders the file.
- Composite states, `<<choice>>`, `<<fork>>`, `<<join>>` and concurrent
  regions are refused by name, with the line. A record is in one flat state,
  and a construct amy cannot map to that would be drawn as something the
  machine does not do.

Mermaid has no grammar published as a specification; its parser is the
reference. So the subset amy accepts is also checked against Mermaid's own
parser, as a development dependency only, and a construct both accept but amy
refuses says why.

**The diagram is the shape. The decisions are still code.** What decides a
transition is still pure TypeScript: reading the observation, the policy's
numbers, the first-look announcement, the text of a message. Putting it in
labels would make the file Mermaid in syntax only: a language no other tool
reads, which is the problem this row exists to avoid. Asking an agent to
interpret a label at each look would give up the purity that lets the
walkthrough run with no network.

**A transition is a contract, checked where it is cheap.** The host already
holds the diagram, so it checks a workflow's code against it on two
occasions:

- **At boot.** A state the diagram draws with no decision, or a decision for a
  state it does not draw, is refused by name. This applies once
  *a workflow is one declaration* gives decisions a key per state.
- **On every walk.** The testkit and `amy workflow check` record every
  transition. An `advance` to a state the diagram does not connect fails,
  naming both ends. Leaving to an `anywhere` state, or out of a `returns`
  state to where the record came from, is connected. An edge no walk took is
  listed as *drawn, not walked*. For the three shipped workflows that is a
  failure, because their walkthroughs walk every edge. For a workflow that is
  still being written, it is the to-do list.

At runtime, an undrawn transition is applied and written to the event log as
`workflow.undrawn_transition`. Refusing it would leave somebody's work stuck
because of a drawing mistake.

**Export and import are the file.**

- `amy workflow export <name>` prints it.
- With `--work <id>`, it adds a `class` line marking the record's current
  state. The result is still valid Mermaid, so pasting it into a GitHub
  comment shows where the work is.
- `amy workflow new <name> --from <file.mmd>` copies somebody's diagram in
  beside a scaffold that decides nothing yet. The first `amy workflow check`
  names every state without a decision and every edge as drawn, not walked.

Each of these commands is a shortcut. Writing the two files by hand gives the
same workflow.

**Every view of a workflow is drawn from its diagram.** The `StateMachine`
primitive gains a required `diagram` prop, the Mermaid text, beside the
`states` and `transitions` the server reads out of it. A renderer with a
Mermaid engine draws the diagram itself, and the text renderer draws the
states and edges as it does today. Either way, both drawings come from one
file. This changes the closed vocabulary, so the conformance world takes a
diagram, and the golden is regenerated and locked in this row.

**The skills and the docs read the file.** `/amy-show-me` reads
`workflow.mmd` instead of drawing from what it inferred. `/amy-workflow` ends
each round of its interrogation by editing the diagram, then writes the
decisions the diagram asks for. *Workflows* and *Write a workflow* describe the
file when *the docs describe the contract that exists* rewrites them.

The three shipped workflows and the errand get their diagram, and lose their
state lists. Each gate that drives one of them adds its `workflow.mmd` to its
activation, so a changed diagram makes its proof stale the way changed code
does. The installed `workflow-oncall` fixture keeps its hand-written
fields, so the gate that drives it keeps proving that a workflow without a
diagram still mounts.

## What this is not

- Not a layout. Mermaid lays the graph out, and no position is stored.
- Not generated code. Nothing is written from the diagram into the workflow.
  The diagram is read where it lies, every time the workflow mounts.
- Not the window's editor. *amy has a window* gives the Workflows canvas the
  diagram, drawn and editable as text. This row gives that editor the file to
  edit and the check to run on save.

## Acceptance criteria

- [ ] The subset reads the initial, terminal, waiting, attention, `anywhere`
      and `returns` states and every transition of a diagram, and refuses each
      unsupported construct by name and line
      (proof: deferred:test:packages/core/tests/diagram.test.ts)
- [ ] Every diagram the subset accepts is accepted by Mermaid's own parser
      (proof: deferred:test:packages/core/tests/diagram-mermaid.test.ts)
- [ ] A workflow with a `workflow.mmd` beside it mounts with the states the
      file draws and declares none, and one that declares them as well is
      refused by name
      (proof: deferred:test:packages/core/tests/mount.test.ts)
- [ ] An `advance` to a state the diagram does not connect fails the walk,
      naming both ends; a move to an `anywhere` state or back out of a
      `returns` state does not; and an edge no walk took is listed
      (proof: deferred:test:packages/workflow-testkit/tests/transitions.test.ts)
- [ ] Changing a shipped workflow's diagram makes the gate that drives it
      stale (proof: deferred:test:mutation fixture for L3.GATE_HAS_FRESH_EVIDENCE)
- [ ] Each shipped workflow's walkthrough takes every edge its diagram draws
      (proof: deferred:assertion:plan.every_drawn_edge_is_walked)
- [ ] `amy workflow new --from` turns a diagram into a workflow that mounts and
      whose check names what is left to decide
      (proof: deferred:assertion:mine.a_diagram_becomes_a_workflow)
- [ ] `amy workflow export --work` prints a diagram Mermaid's parser accepts,
      with the record's state marked
      (proof: deferred:test:packages/cli/tests/workflow-export.test.ts)
- [ ] Every `StateMachine` in the conformance world carries a diagram, and the
      golden is relocked
      (proof: deferred:assertion:frame.nothing_moved_since_it_was_approved)
- [ ] A workflow with no diagram, written by hand, still mounts and is driven
      (proof: assertion:plugins.a_workflow_from_outside_this_repository_mounts)

**Exit condition:** each of the three shipped workflows is a `workflow.mmd`
that GitHub renders. Its states, waits and ends are read from that file, with
no list of them anywhere in its code, and its walkthrough takes every edge the
file draws. A diagram written in another tool becomes a workflow that mounts,
either by hand or through `amy workflow new --from`. `amy workflow export
--work` pastes into a pull request comment and shows where that work is.
