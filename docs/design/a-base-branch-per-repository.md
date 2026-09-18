# A base branch per repository

`defaultBranch` was one string for the whole install, and it reached every
reader of the layout: the harnesses cut from it, the gate ran beside it, the
worktree manager detached every tree at it, and the workflows opened every
pull request against it. A machine whose repositories do not all agree on the
name had one global answer, and the workaround — a `baseByRepo` mapping
inside a private workflow package — was a workflow reimplementing a piece of
host configuration because the host would not carry it. That is the shape of
the problem rather than the size of it: the next workflow does it again,
differently, and two workflows on one machine disagree about what `main`
means for the same repository.

## What shipped

`baseBranch:` maps a repository to its branch; `defaultBranch` keeps its name
and stays the fallback, because most installs will never write the mapping.

```yaml
defaultBranch: main
baseBranch:
  Northwind/northwind-infra: master
```

The rule is one function in the core, beside `checkoutFor`, so no caller
re-derives it and a second reader cannot drift from the first:

- `RepoLayout` gained the optional `baseBranch` map and `baseBranchFor`
  answers the lookup; `Git.prepareBranch` cuts a new branch from the
  repository's own base, in both the worktree mode and the shared mode.
- `OpenPullRequestRequest` gained an optional `base`. An absent one keeps the
  forge's own default, which is the answer an install without a mapping has
  always meant; the `plugin-github` adapter resolves the request's own base,
  then its slice's map, then asks the forge.
- `pluginSlices` hands the map to every reader beside the fallback: the three
  harness plugins, the command gate, the worktree manager — whose trees are
  cut from the mapped branch through the same `baseBranchFor` — and the three
  shipped workflows, each of which resolves the base where the piece of work
  names its repository. The map is passed whole rather than resolved at the
  edge, because the slice is built once and the repository is known per piece
  of work.
- Every receiving plugin's `configSchema` grew the field, so a typo is
  refused at boot by name. `plugin-github` had no schema of its own before
  this; it does now, which is what made its slice's first setting possible.

## The gate

`plugin-serial-engine`, extended — it is the gate that proves a piece of work
moves through actions, and a base branch is what two of those actions are
about. Its scenario gained a stage over two real bare repositories, one on
the fallback and one whose base is its own, driving the real workflow runtime
and the real `plugin-github` adapter against a stand-in `gh` whose argv log
is what the assertions read:

- `base.a_repository_can_name_its_own_branch`
- `base.the_fallback_still_answers_for_the_rest`

The stage sits in the engine's gate because the claim is about a mount, not
about a class: the mapping rides the slices, resolves at the caller, and
reaches the forge intact — for the mapped repository and for the one that
kept the fallback, in the same install.

## Acceptance criteria

- [x] A repository with its own base branch is compared against that one
      (proof: assertion:base.a_repository_can_name_its_own_branch)
- [x] A repository without one still gets `defaultBranch`
      (proof: assertion:base.the_fallback_still_answers_for_the_rest)
- [x] A pull request opens against the repository's own base
      (proof: test:plugins/github/tests/plugin.test.ts)
- [x] A config with no `baseBranch:` block behaves exactly as before
      (proof: test:packages/cli/tests/slices.test.ts)
- [x] The mapping reaches a workflow that never heard of it
      (proof: test:packages/cli/tests/slices.test.ts)

**Exit condition:** an install works in two repositories with two base branch
names, and no workflow package on it carries a branch mapping of its own.