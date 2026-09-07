# A workflow is yours, not a package

`/amy-workflow` interrogates somebody into a design and then tells them to
publish it: *"A workflow is a package"*, and the last step is
`npm install -g @acme/workflow-oncall`. For the workflow that skill exists to
produce — an on-call week, a private review rotation, a process that names
your employer's tooling — that is exactly backwards. Publishing it is a thing
you might do. Owning it is the whole point.

The mechanism is already there and is only reachable the long way round: a
profile names an import specifier, and a path is an import specifier. Nobody
does it because there is nowhere obvious to put the directory, and because
writing the seven things a workflow declares from an empty file is an hour
that ends in a boot refusal about a runtime you forgot to contribute.

## What changes

`~/.amy/workflows` is where a workflow lives. A directory in it is a workflow,
named by its directory: `workflow: oncall` in the config means
`~/.amy/workflows/oncall`, resolved before anything is looked for in a
registry. A scoped name still resolves as a package, so an install can have
both and nothing has to move to be shared later.

```sh
amy workflow new oncall      # a directory that runs, unedited
amy workflow check oncall    # drive the lifecycle against a stub world
```

`new` writes a workflow that already works: the states, a pure `plan()`, a
runtime, and the `registry.contribute("workflow-runtime", ...)` line whose
absence produces the one refusal everybody meets first. It is also a valid
npm package from the moment it is written, so publishing it later is
`npm publish` in that directory and no restructuring.

`check` is the walkthrough test as a command. The skill has always said that
test is the only real proof, and then left the person to set up a test runner
to get it. Instead amy drives the workflow's own lifecycle against a stub
world and asserts the four things that are true of every workflow: it walks in
the order it claims, one look makes at most one move, a waiting state moves
nothing until the world does, and it settles rather than spinning.

`/amy-workflow` is rewritten around this. The default answer becomes a
directory under `~/.amy/workflows`; the package is what you do if the process
belongs to more than you.

## The gate

New: `a-workflow-of-your-own`, scenario in
`.software-factory/evidence/workflow-new-scenario.sh`, joined to
`npm run e2e`. Activation on `packages/cli/src/scaffold.ts`,
`packages/cli/src/loader.ts`, `packages/cli/skills/amy-workflow/SKILL.md`.

The scenario is the claim: a scratch machine with only the command installed
runs `amy workflow new`, edits nothing, and gets a green `check` and a moved
piece of work. A scaffold that does not run unedited is a scaffold that
teaches the boot refusal instead of the shape.

## Acceptance criteria

- [ ] `amy workflow new` produces a workflow that drives work unedited
      (proof: assertion:mine.the_scaffold_runs_before_it_is_edited)
- [ ] It is resolved from `~/.amy/workflows` by its directory name
      (proof: assertion:mine.a_directory_name_is_a_workflow)
- [ ] `amy workflow check` fails a lifecycle that does not settle
      (proof: assertion:mine.a_workflow_that_spins_is_refused)
- [ ] It fails one that claims a state it never reaches
      (proof: assertion:mine.a_state_nothing_reaches_is_refused)
- [ ] It fails one whose plan emits an action no port answers
      (proof: assertion:mine.an_action_with_no_port_is_refused)
- [ ] The scaffold is a package `npm publish` accepts, with nothing moved
      (proof: test:packages/cli/tests/scaffold.test.ts)
- [ ] A scoped package and a local directory can both be configured, and the
      directory wins on a name collision
      (proof: test:packages/cli/tests/loader.test.ts)
- [ ] `/amy-workflow` writes a directory by default and names publishing as a
      later choice (proof: unspecified:the skill is prose, and only a reader checks it)

**Exit condition:** somebody who has never published anything describes their
process to `/amy-workflow`, and ends with a workflow in `~/.amy/workflows`
that amy is driving — with no registry involved at any point.
