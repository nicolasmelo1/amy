# A base branch per repository

`defaultBranch` is one string for the whole install (`config.ts:155`), and it
reaches five places from `pluginSlices`: the gate that decides what to compare
against, all three harness plugins, and both shipped workflows. A machine
whose repositories do not all agree on the name has one global answer and no
way to say otherwise.

The workaround, on the install where this was found, was a `baseByRepo`
mapping inside a private workflow package — a workflow reimplementing a piece
of host configuration because the host would not carry it. That is the shape
of the problem rather than the size of it: the next workflow does it again,
differently, and two workflows on one machine disagree about what `main` means
for the same repository.

## What changes

`baseBranch:` maps a repository to its branch; `defaultBranch` is the fallback
and keeps its name, because most installs will never write the mapping.

```yaml
defaultBranch: main
baseBranch:
  Northwind/northwind-infra: master
```

Every consumer already knows which repository it is working in — the gate has
a checkout, the harness has a `cwd`, the workflows have a record naming a
repo — so this is a lookup replacing a constant at five call sites, not a new
concept. `pluginSlices` hands down the mapping alongside the fallback rather
than resolving it, because the slice is built once and the repository is known
per piece of work.

## The gate

`plugin-serial-engine`, extended: it is the gate that proves a piece of work
moves through actions, and a base branch is what two of those actions are
about. Add:

- `base.a_repository_can_name_its_own_branch`
- `base.the_fallback_still_answers_for_the_rest`

## Acceptance criteria

- [ ] A repository with its own base branch is compared against that one
      (proof: assertion:base.a_repository_can_name_its_own_branch)
- [ ] A repository without one still gets `defaultBranch`
      (proof: assertion:base.the_fallback_still_answers_for_the_rest)
- [ ] A pull request opens against the repository's own base
      (proof: test:plugins/github/tests/plugin.test.ts)
- [ ] A config with no `baseBranch:` block behaves exactly as before
      (proof: test:packages/cli/tests/slices.test.ts)
- [ ] The mapping reaches a workflow that never heard of it
      (proof: test:packages/cli/tests/slices.test.ts)

**Exit condition:** an install works in two repositories with two base branch
names, and no workflow package on it carries a branch mapping of its own.
