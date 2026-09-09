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

### Stop commenting machine notices on the tracker, and stop counting cache reads against the token ceiling.

`patch` · `@amykit/cli`, `@amykit/core`, `@amykit/plugin-linear`

Two defects that both made the machine lie to its operator, found on the same
day on the same install.

**`notify.tracker: false` was dead configuration.** `plugin-linear` contributed
its notification channel unconditionally and never read the setting, so every
engine notice was commented on the Linear ticket — under the operator's own
name, because amy authenticates with a key issued to a person, and with no
prefix or marker because the channel posted the raw announcement text. `REVV-7716
is moving again in DONE after 2 failed attempt(s)` reached a real ticket and a
colleague replied to it asking what it meant. The channel is now contributed
only when asked for, the default is off, and what it writes says a machine
wrote it on the first line.

**One agent run could park the machine for five hours.** The token ceiling
summed `input + output + cacheRead + cacheWrite`. A single implement run
reported `input: 44, output: 17394, cacheRead: 1839757, cacheWrite: 92769` —
1,949,964 against a 2,000,000 per-five-hours ceiling, from a run that cost
$0.91 against a $20 ceiling in the same window. A cache read is the saving,
not the spend, so the better prompt caching worked the sooner the machine
locked itself out. The ceiling now counts billable tokens; `costUsd` remains
the ceiling that knows what cache is worth.

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
