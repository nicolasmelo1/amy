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

### **What the core marks a value with, every copy of the core can read.** An install always holds several copies of the core: the CLI's own, the plugins root's, and whatever a project's phase folder resolves from its own `node_modules`. 0.7.0 marked a workflow's port need and an operation's declared failure with local symbols, a different key in every copy. So no project whose phase asks for a port could mount ("Cannot destructure property 'optional' of 'need[PORT_NEED]'"), and a plugin's declared failure was answered as an internal error. Both are now registered symbols. `packages/core/tests/two-copies.test.ts` runs the core against a second copy of itself, the `project-phases` gate mounts a phase that imports its own core, and `L0.THE_CORE_MARKS_WITH_REGISTERED_SYMBOLS` refuses a local symbol in the core.

`patch` · `@amykit/core`

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
