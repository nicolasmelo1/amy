# The guardrails ship with the workflow

`software-factory` is already in this repository and in every workflow written
against it. What is not shipped is *which rules* — and that is the part that
takes a day of production to learn.

Three rules were written for a private workflow after three defects
reached a real board. None of them is about that project:

| what it refuses | why any workflow needs it |
|---|---|
| `git checkout -B` | `-B` moves a branch that exists, so a commit the machine made and could not push is gone with nothing to say it existed |
| reading `.state` in a fold | the engine hands `apply` a record it has already advanced, so the comparison silently never matches |
| a bare `.every(` | `[].every(...)` is `true`, so a fold over nothing agrees with everything |

Every workflow drives git. Every workflow has the same `apply` with the same
record. Every workflow folds a collection somewhere. These are properties of
*writing an amy workflow*, and the second one is a property of the engine's own
calling convention — a rule about `amy`, discovered by somebody who was not
working on `amy`.

Making each author rediscover them is the same failure as making each author
write the conformance suite. It is worse, because the discovery route is a
ticket on a board somebody's team reads.

## What changed

`amy workflow new` writes a `.software-factory/` beside the workflow it
scaffolds: a policy enabling the three rules, the rules themselves as
repo-local rules, and one mutation fixture per rule. The sources are
`packages/cli/guardrails/`, shipped in the `@amykit/cli` package, and a
scaffolded workflow's own `sf check` refuses the three defects before it has a
single state of its own. `sf verify` in that directory proves each rule still
fires.

This is deliberately not "sf is configured". Running `sf init` was never the
hard part. Knowing that `-B` loses commits, that the fold is handed a moved
record, and that an empty list agrees with everything is the hard part, and it
is knowledge this project has and its users do not.

## Why the rules live here and not in the catalog

The first draft of this plan put the rules in `software-factory`'s catalog
behind a preset, `extends: amy/workflow`. That would have been the first line
of code in `sf` that knows `amy` exists: a preset named after it compiled into
the binary, fixtures shaped like its packages, a rule exempting one of its
functions by name. `sf` is for any repository, and the three rules are about
amy's workflows, so they are amy's to ship. `sf` already loads repo-local rules
from `.software-factory/rules/`, so it needed nothing new.

amy does not install `sf` either. A workflow runs without it; the guardrails
are what its `sf check` enforces once its author runs one, the same way the
note-to-plan workflow's check is a command in the config and not a dependency.

## What the rules cannot see

`sf` parses TypeScript and not JavaScript, so the fold rule, which reads the
shape of the code rather than a line of it, only sees a workflow once it is
`.ts`. The scaffold is `index.js`, and its `apply` says in a comment to read
`moved.from`, which [the workflow contract changes once](the-workflow-contract-changes-once.md)
now hands it. That removed the reason anybody had to read `record.state` in a
fold; it did not make reading it right, so the rule stays. The other two are
line patterns and see both.

amy's own `packages/core/src/git.ts` prepares a branch with `checkout -B`. The
rules are not enabled on this repository, because they are written for a
workflow, and turning the branch-reset rule on here is a change to how the core
prepares a branch. That is its own piece of work.

## Acceptance criteria

- [x] Each of the three rules fires on a repository built to trip it
      (proof: assertion:guardrails.every_guardrail_fires_on_its_fixture)
- [x] The scaffold enables all three and nothing else
      (proof: test:packages/cli/tests/guardrails.test.ts)
- [x] A workflow that runs `checkout -B` is refused by `sf check`
      (proof: assertion:guardrails.a_branch_reset_is_refused)
- [x] A workflow whose fold reads `record.state` is refused, once it is
      TypeScript; see above
      (proof: assertion:guardrails.a_fold_reading_the_moved_state_is_refused)
- [x] A workflow that calls `.every(` without saying what empty means is refused
      (proof: assertion:guardrails.an_every_over_nothing_is_refused)
- [x] `amy workflow new` produces a directory whose `sf check` is green
      (proof: assertion:guardrails.the_scaffold_passes_its_own_check)

**Exit condition:** a workflow scaffolded by `amy workflow new` refuses the
three defects that reached a real board, on its first commit, without its
author having heard of any of them.
