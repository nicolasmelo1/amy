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

### Refuse a dollar ceiling the price table cannot price, and price the Claude 5 family.

`minor` · `@amykit/cli`, `@amykit/core`, `@amykit/model-specs`, `@amykit/plugin-agent-relay`

`specs.json` had no row for the Claude 5 family, so `specFor` returned nothing,
every run was recorded with no `costUsd`, and an install with
`budget.perWeek.costUsd: 150` set had no dollar ceiling at all — not loose,
inert. The token ceiling beside it still fired, which is what made it quiet.

The table now prices `claude-opus-5`, `claude-sonnet-5`, `claude-opus-4-8`,
`claude-sonnet-4-6` and `claude-fable-5-1` at rates taken from models.dev, and
declares the short names a harness CLI accepts (`opus`, `sonnet`, `haiku`,
`fable`) so a ladder written in them can be recognised. A refresh keeps both,
because models.dev carries neither long-context tiering nor aliases.

A price table always lags, so the lasting half is that the ceiling knows: the
relay refuses at boot when a rung in any ladder — including a step's own —
names a model the table cannot price, naming the model and the rung, so the
answer is `amy models refresh` or a ceiling in tokens. A ceiling in tokens over
the same ladder boots untouched.

`amy budget` now reports how many runs in a window carry no price, rather than
a dollar figure that is arithmetically true and practically a lie.

**Breaking for one config shape:** `ladder: [claude]` — a single-model install
naming no model — is now refused under a `costUsd` ceiling, because there is no
id to price it by. Name the model (`claude:sonnet`) or set the ceiling in
tokens.

### Add the plan-board consistency check to the gate so delivered plans can move into durable design notes without losing their required assertions.

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
