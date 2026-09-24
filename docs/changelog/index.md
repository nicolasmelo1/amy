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

### `findPrivateReferences` reads a tree against a policy of hashed terms, so the repository gate can refuse a private name — standing alone or glued into a longer identifier — without the list of forbidden names being published alongside the check that hides them.

`patch` · `@amykit/cli`



### `classify` turns a plugin spec into what npm installs and what the config names — a name, a range, a git URL, a tarball or a path — in one place, before `amy add`, `amy remove` and `amy update` arrive.

`minor` · `@amykit/cli`



### `amy workflow new` writes an editable workflow under the machine state home, and `amy workflow check` drives its lifecycle before it reaches real work.

`minor` · `@amykit/cli`



### `amy doctor` and `amy plugin list` resolve a workflow of your own the same way mounting does, so `amy plugin list` no longer reports a directory written by `amy workflow new` as `FAIL`, and doctor validates its settings against the schema it declares.

`patch` · `@amykit/cli`



### New `amy add` and `amy remove` commands: one argument — a package name, a URL, a git URL or a path — installs the package into `~/.amy/plugins`, mounts it alone to decide whether it is a workflow or a plugin, writes the config entry (a profile for a workflow, the machine-wide `extraPlugins:` list for a plugin), and refuses what the machine would not survive instead of leaving a half-added entry behind. Plugins added this way join a profile without freezing its recommended set into the config.

`minor` · `@amykit/cli`



### New `amy update` command: moves a machine forward without leaving it half-updated — reads both roots (the plugins root and the one that resolved the CLI), re-resolves every registry range through npm, installs the exact version each range now points at, and keeps the manifest's ranges the way the operator wrote them. Refuses while the loop is running; a version that will not import or mount is rolled back to the one that did; a config that will not boot fails the update and rolls back every move; and when the CLI itself moves, its skills are rewritten into the harnesses they were written into before — through the new CLI, never the old process. `amy skills` now records where it wrote, and `--recorded` rewrites into exactly those places.

`minor` · `@amykit/cli`



### Plugins configured for an amy install now live in `~/.amy/plugins`: `amy init --install` installs them through that root rather than npm's global prefix, and mounting plus `amy plugin list` resolve from the same root.

`minor` · `@amykit/cli`



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
