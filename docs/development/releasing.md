---
title: Releasing
description: Changesets, the version pull request, and why the release job is dormant.
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
mistake** — it is what "nothing is pending" looks like.

Write it for somebody reading the changelog six months from now: **what changed,
and why it was wrong before.** A changeset that restates the diff is one nobody
gains anything from reading.

## What happens on a push to main

```text
push to main
    │
    ▼
release workflow
    │
    ├─ changesets are pending ──▶ opens or updates a version pull request
    │                              (bumps, changelogs, lockfile)
    │
    └─ the version PR was merged ─▶ npm publish, with provenance
                                    and tags pushed by the same run
```

Version and publish are **one job, deliberately**. The obvious shape is two
workflows — one that tags, one that publishes on the tag — and it does not work,
and it fails silently: GitHub refuses to start a workflow from a push made with
the default token, so the publish would wait for a tag event that never arrives.

## It is dormant until somebody arms it

```yaml
if: vars.AMY_RELEASE == 'on'
```

There is no npm organisation and no token yet, and unarmed the job would fail on
every push to main — first on permissions, then on a missing credential. **A red
build that means nothing trains everybody to ignore the one that does.**

Arming it is one command, once:

```sh
gh variable set AMY_RELEASE --body on
```

A variable rather than a secret, because a job condition cannot read a secret,
and because "is the release armed" is not itself a secret.

## Checked before it can go wrong

```sh
npm run check:release
```

Part of `npm run gate`. It checks the release configuration is coherent — the
kind of thing that is otherwise discovered by a publish that half-worked.

## The news page

```sh
npm run docs:changelog     # fetch releases from GitHub into the cache
npm run docs:generate      # render /changelog from the cache and the changesets
```

The fetch is a separate command from generating on purpose: generating has to be
reproducible on any machine at any time, and something that reaches the network
cannot be. See [Documentation](documentation.md).
