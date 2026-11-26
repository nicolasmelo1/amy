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

### A step escalates by where its work came back from, with nothing left of the two ceilings it replaced. Rounds are counted per origin, and the round that spends a level's last allowance is the one that climbs: a gate, a review thread, the self-review, the owner and a failing run each spend their own ladder, and the work escalates only when one of them has nothing left below a person. `escalation.rungs` and every `*.findingsAt` are required with no default, the annotated config teaches the whole block, and a record saved before rounds were counted per origin reads every origin at zero rather than at an attempts ceiling that no longer exists.

`patch` · `@amykit/agent-kit`, `@amykit/cli`, `@amykit/core`, `@amykit/plugin-codex`, `@amykit/plugin-github`, `@amykit/workflow-ticket-to-qa`

Around it: a reply is said where `repliesOn` names the ports (and the code host can answer on a review thread, `replyToReviewThread`); a failed run is a round its origin sent back, and one that changed nothing gives its round back; checks failing on a head the agent answered with "nothing to change" are not new work; the owner's word is new work whether the pull request is waiting on the bot, on a reviewer or on them; the second contradicting comment is a new question even after the first was settled; a `Stack base` line wins over `stackBases` and a parent in another repository cuts from base; a review verdict counts only where the review ends; and a record escalated with no resume point comes back to `HUMAN_REVIEW`, since `HUMAN_FIX` is a state this walk no longer draws.

### Where a reply is said, and where the owner's word is read from, is one setting named by ports (`repliesOn`) instead of a guess that preferred a chat and fell back to the ticket. It is required with no default; it refuses a product name like `slack` by naming the ports that exist; and an answer is said on every port it names and on no other. The code host gained `replyToReviewThread`, so the answer can be written on the review thread it belongs to instead of repeated where the reviewer is not looking, and `amy update` writes the setting into a machine that predates it.

`patch` · `@amykit/cli`, `@amykit/core`, `@amykit/plugin-github`, `@amykit/workflow-ticket-to-qa`



### The property that keeps every code change in IMPLEMENTING now plants the defect it rejects.

`patch` · `@amykit/workflow-ticket-to-qa`

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
