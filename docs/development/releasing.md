---
title: Releasing
description: Changesets, the version pull request, the switch that arms the release job, and what the version bump regenerates.
group: Development
order: 3
---

# Releasing

## Every user-visible change carries a changeset

```sh
npm run changeset
```

It asks which packages changed and how much, and writes a markdown file into
`.changeset/`. Between releases that directory is empty, and **that is not a
mistake**: it is what "nothing is pending" looks like. A change that publishes
nothing still carries an empty changeset, because CI runs `changeset status`.

Write it for somebody reading the changelog long after: **what changed, and why
it was wrong before.** A changeset that restates the diff is one nobody gains
anything from reading.

## What happens on a push to main

```text
push to main
    │
    ▼
release workflow
    │
    ├─ changesets are pending ──▶ opens or updates a version pull request
    │                              (bumps, changelogs, lockfile, docs)
    │
    └─ the version PR was merged ─▶ npm publish, with provenance
                                    and tags pushed by the same run
```

Version and publish are **one job, deliberately**. The obvious shape is a
workflow that tags and another that publishes on the tag, and it fails
silently: GitHub refuses to start a workflow from a push made with the default
token, so the publish would wait for a tag event that never arrives.

Before the changesets action runs, the job builds and runs the tests, because a
release is the one build nobody can take back.

## The switch that arms it

```yaml
if: vars.AMY_RELEASE == 'on'
```

The job runs only while the repository variable `AMY_RELEASE` is `on`, and it
is on for this repository. Off, the job is skipped and stays green: before the
npm organisation and its token existed, an armed job would have failed on every
push to main, and **a red build that means nothing trains everybody to ignore
the one that does.** A fork that has no npm token keeps it off.

```sh
gh variable set AMY_RELEASE --body on
```

A variable rather than a secret, because a job condition cannot read a secret,
and because "is the release armed" is not itself a secret.

## Checked before it can go wrong

```sh
npm run check:release
```

Part of `npm run gate`. A package is either published, and then it carries
everything a publish needs and moves with the others, or it is private and
nothing about it is published. The check fails on anything in between, which is
otherwise discovered by a publish that half-worked.

## The version bump regenerates what it moves

```json
"release:version": "changeset version && npm install --package-lock-only && npm run docs:generate && npm run registry:generate && sf lock && tsx scripts/check-lock-scope.ts"
```

A release moves what the generated files are derived from: every package's
version, which the docs manifest and the `registry/` items carry, and the
pending changesets, which `changeset version` consumes into changelogs.
Without regenerating, the version pull request is the one pull request in this
repository that **could never pass its own gate**:

```
docs: the code moved and the documentation did not. These are out of date:
  docs/changelog/index.md
  docs/manifest.json
```

The bump also changes every `package.json`, which the hash locks cover, so
`sf lock` re-locks them. `sf lock` takes no scope, so
`scripts/check-lock-scope.ts` then refuses the bump if it re-locked anything
but the dependency manifests: a release must not bless a changed
`events.json` or `policy.yaml` in silence.

It also means the news page ships *with* the release rather than after it: by
the time the version pull request is reviewed, "Coming next" is empty and the
changelogs it describes exist.

It needs `dist` to be built, because the generator asks each plugin what it
mounts by registering it. The release job builds before the changesets action
runs, and locally the generator says so rather than guessing.

## The news page

```sh
npm run docs:changelog     # fetch releases from GitHub into the cache
npm run docs:generate      # render /changelog from the cache and the changesets
```

The released half is what the release cannot write for itself: the GitHub
release does not exist until the publish has happened. So after a release
lands, run those and commit. The page tells the truth about what the cache
knows either way, which is why it says "No release has been cut yet" rather
than showing nothing.

The fetch is a separate command from generating on purpose: generating has to be
reproducible on any machine at any time, and something that reaches the network
cannot be. See [Documentation](documentation.md). How an install picks up a
release: [amy update](../design/amy-update.md).
