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

### What a private workflow had to write for itself, the shipped one now does.

`minor` · `@amykit/cli`, `@amykit/core`, `@amykit/plugin-file-queue`, `@amykit/plugin-github`, `@amykit/plugin-linear`, `@amykit/plugin-serial-engine`, `@amykit/workflow-errand`, `@amykit/workflow-note-to-plan`, `@amykit/workflow-ticket-to-qa`

- A commit status GitHub returns in lower case reads as passing or failing; every one used to read as running.
- `Git` commits without pushing, and `push` refuses anything that is not a fast-forward, naming the branch. `commitAndPush` is built on the two.
- A review thread carries the file it is on.
- The code host finds a pull request by the id in its title, open or merged, and the author's pull requests somebody asked to change. A workflow that claims no writes is handed `pullRequestAncestry` and both of these.
- `ticket-to-qa` takes `policy.writes: operator`: every tracker and code-host write is said once, in the work's thread or through the notifier, and the machine waits until it sees it made. The workflow then claims no writes at all.
- A ticket Linear labels into several repositories (`repoByLabel`) is one work item per repository, `TICKET@owner%2Fname`, and QA receives it once, when every one has merged.
- `file-queue` takes `order: priority`: the most urgent due item first, first in first out within one priority, refreshed on every discovery from the tracker's own urgency.

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
