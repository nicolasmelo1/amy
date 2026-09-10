# The guardrails ship with the workflow

`software-factory` is already in this repository and in every workflow written
against it. What is not shipped is *which rules* — and that is the part that
takes a day of production to learn.

Three rules were written for `@nicolasmelo1/workflow-revv` after three defects
reached a real board. None of them is about that project:

| what it refuses | why any workflow needs it |
|---|---|
| `git checkout -B` | `-B` moves a branch that exists, so a commit the machine made and could not push is gone with nothing to say it existed |
| comparing `record.state` in a fold | the engine hands `apply` a record it has already advanced, so the comparison silently never matches |
| a bare `.every(` in the decision function | `[].every(...)` is `true`, so a fold over nothing agrees with everything |

Every workflow drives git. Every workflow has the same `apply` with the same
record. Every workflow folds a collection somewhere. These are properties of
*writing an amy workflow*, and the second one is a property of the engine's own
calling convention — a rule about `amy`, discovered by somebody who was not
working on `amy`.

Making each author rediscover them is the same failure as making each author
write the conformance suite. It is worse, because the discovery route is a
ticket on a board somebody's team reads.

## What changes

The rules move into the catalog under a workflow prefix, with mutation
fixtures, and a preset turns them on:

```yaml
# .software-factory/policy.yaml
extends: amy/workflow
```

`amy workflow new` writes that line. A workflow scaffolded today gets the three
rules, the fixtures that prove they fire, and the prose that says why — before
it has a single state in it.

This is deliberately not "sf is configured". Running `sf init` was never the
hard part. Knowing that `-B` loses commits, that the fold is handed a moved
record, and that an empty list agrees with everything is the hard part, and it
is knowledge this project has and its users do not.

## The rule this one is missing

The second of the three is a workaround for an API that hands over the wrong
thing. [The fold is told what moved](the-fold-is-told-what-moved.md)
removes the reason it exists. Ship it anyway and retire it there: a rule that
outlives its defect is cheap, and a defect that outlives its rule is not.

## Acceptance criteria

- [ ] Each of the three rules fires on a repository built to trip it
      (proof: unspecified:the rules and their mutation fixtures are what this plan delivers; `sf verify` is the proof once they exist)
- [ ] The preset enables all three and nothing else
      (proof: test:packages/cli/tests/policy-preset.test.ts)
- [ ] A workflow that runs `checkout -B` is refused by `sf check`
      (proof: unspecified:the mutation fixture for the branch-reset rule)
- [ ] A workflow whose fold compares `record.state` is refused
      (proof: unspecified:the mutation fixture for the fold rule)
- [ ] A workflow whose decision function calls `.every(` is refused
      (proof: unspecified:the mutation fixture for the empty-fold rule)
- [ ] `amy workflow new` produces a directory whose `sf check` is green
      (proof: test:packages/cli/tests/scaffold.test.ts)

**Exit condition:** a workflow scaffolded by `amy workflow new` refuses the
three defects that reached a real board, on its first commit, without its
author having heard of any of them.
