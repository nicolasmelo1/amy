---
title: News
description: What shipped, and what is about to.
group: News
order: 1
---

# News

Every release, and everything written down and not released yet.

The released half comes from the releases on GitHub, cached into this repository
so that building the documentation never needs a network. The unreleased half
comes from the changesets in the working tree, which is the only one of the two
that exists before a release does.

```sh
npm run docs:changelog     # refresh the cache from GitHub
```

## Coming next

<!-- amy:generated changelog-unreleased -->

### `classify` turns a plugin spec into what npm installs and what the config names — a name, a range, a git URL, a tarball or a path — in one place, before `amy add`, `amy remove` and `amy update` arrive.

`minor` · `@amykit/cli`



### `amy workflow new` writes an editable workflow under the machine state home, and `amy workflow check` drives its lifecycle before it reaches real work.

`minor` · `@amykit/cli`



### `amy doctor` and `amy plugin list` resolve a workflow of your own the same way mounting does, so `amy plugin list` no longer reports a directory written by `amy workflow new` as `FAIL`, and doctor validates its settings against the schema it declares.

`patch` · `@amykit/cli`



### The config template and the `/amy-workflow` skill say that a workflow of your own lives in `~/.amy/workflows`, instead of naming `amy add`, a command nothing ships, and telling a harness to install a package it does not need.

`patch` · `@amykit/cli`

<!-- amy:end changelog-unreleased -->

## Released

<!-- amy:generated changelog-releases -->

No release has been cut yet. The release workflow is deliberately dormant until
somebody arms it, so this is the truth rather than a fetch that failed —
see [the release path](../development/releasing.md).

<!-- amy:end changelog-releases -->

## Per-package changelogs

Each package carries its own `CHANGELOG.md`, written by `changeset version`. The
news above is the whole workspace; a package's own file is the one to read when
you depend on exactly that package.

## How a change gets here

Every change a user would notice needs a changeset:

```sh
npm run changeset
```

Written for somebody reading it six months from now: **what changed, and why it
was wrong before.** A changelog entry that says what the diff says is one nobody
gains anything from reading.

See [Releasing](../development/releasing.md).
