# A checkout root per repository

`workspaceRoot` is one string, and a checkout is found by joining it with the
repository name after the slash (`packages/cli/src/doctor.ts:221`). That is
right for one team with one directory of clones, and it is wrong the moment
work spans two: repositories at work and repositories of your own do not live
under a common parent, and there is no reason they should.

The install this was found on answered with a directory of symlinks —
`workspaceRoot: ~/.amy/checkouts`, every entry a link to somewhere else. It
works, and it is a workaround with two costs. Adding a repository to `repos:`
now means remembering to add a link, or `amy doctor` reports a checkout that
is missing for a reason the config cannot show. And the state directory is
holding configuration, so the machine cannot be rebuilt from `config.yaml`.

## What changes

`workspaceRoot` keeps meaning what it means: where a checkout is, unless
something says otherwise. Beside it, `checkouts:` maps a repository to its
path, and a repository in it is not looked for under the root at all.

```yaml
workspaceRoot: ~/workspaces/northwind
checkouts:
  Northwind/northwind-infra: ~/work/infra
  acme/amy: ~/code/amy
```

`hostPaths` (`slices.ts:190`) returns one workspace path today, so what it
returns becomes a lookup rather than a directory, and every caller asks it for
a repository instead of joining a string. `amy doctor` reports which of the
two answered for each repository, so a wrong path is one line to find rather
than a missing directory with no explanation.

`~` expands, the way `workspaceRoot` already does (`config.ts:193`).

## The gate

`ticket-to-qa`, extended — it is the gate that drives work in a checkout, and
a second root is only real if a piece of work runs in one. Add:

- `checkout.a_repository_can_name_its_own_root`
- `checkout.the_root_still_answers_for_the_rest`
- `checkout.a_missing_checkout_names_which_root_was_asked`

Its scenario gains a second repository outside the workspace root, and drives
one piece of work in it.

## Acceptance criteria

- [ ] A repository with its own path is found there, not under the root
      (proof: assertion:checkout.a_repository_can_name_its_own_root)
- [ ] A repository without one is still found under the root
      (proof: assertion:checkout.the_root_still_answers_for_the_rest)
- [ ] `amy doctor` names which root it asked for a missing checkout
      (proof: assertion:checkout.a_missing_checkout_names_which_root_was_asked)
- [ ] `~` expands in a per-repository path
      (proof: test:packages/cli/tests/config.test.ts)
- [ ] A config with no `checkouts:` block behaves exactly as before
      (proof: test:packages/cli/tests/slices.test.ts)

**Exit condition:** an install drives work in two repositories under two
unrelated parents, with no symlink anywhere and nothing in `~/.amy` that is
not state.
