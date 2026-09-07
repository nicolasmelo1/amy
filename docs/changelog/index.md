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

### Refuse a dollar ceiling that cannot stop anything, and ask the harness rather than the price table.

`minor` · `@amykit/agent-kit`, `@amykit/cli`, `@amykit/core`, `@amykit/model-specs`, `@amykit/plugin-agent-relay`, `@amykit/plugin-claude`, `@amykit/plugin-codex`, `@amykit/plugin-hermes-agent`

`specs.json` had no row for the Claude 5 family, so a run whose harness did not
report a cost of its own was recorded with none, `spend.costUsd` never moved
for it, and `amy budget` reported a figure that was arithmetically true and
practically a lie. The table now prices `claude-opus-5`, `claude-sonnet-5`,
`claude-opus-4-8`, `claude-sonnet-4-6` and `claude-fable-5-1`, declares the
short names a harness CLI accepts (`opus`, `sonnet`, `haiku`, `fable`) so a
ladder written in them can be recognised, and adds `gpt-5.3-codex` and
`gpt-5.3-codex-spark`. A refresh keeps the aliases and the long-context
tiering, because models.dev carries neither.

A price table always lags, so the lasting half is that the ceiling knows: a
`costUsd` ceiling is refused at boot when a rung in any ladder — including a
step's own — names a model whose cost nobody could work out, naming the model
and the rung.

**Whose cost nobody could work out is not the same question as whose model is
in the table**, and conflating the two is the reason this is one change rather
than two. A rung now declares whether its harness accounts for itself
(`Rung.pricesItsOwnRuns`), and only a rung that does not is measured against
the table:

- **claude** puts `total_cost_usd` in its envelope, and a cost the harness
  reported beats anything a table computes.
- **hermes** writes `cost_status: "included"` for a run a subscription or a
  local model covered — where zero is the right answer rather than a missing
  one, and no price list will ever publish a rate for a model running on
  somebody's own machine — and prices the rest of its providers itself.
- **codex** reports no cost of its own, so the vendored table is the only way
  one of its runs gets a price. It is the one harness a missing row leaves a
  dollar ceiling inert for.

Reading the table's answer as the whole question would refuse an install whose
ceiling works perfectly well, which is the same failure as an inert ceiling
reached from the other side: a machine that will not start over a number it
already has.

The refusal also no longer offers a command that could not fix it.
`amy models refresh` re-rates the models the table already has and never adds
one, so a model with no row at all is told to get one in
`.amy/model-specs.json`, or a ceiling in tokens. `amy budget` says the same.

**Breaking for one config shape:** `ladder: [codex]` — a codex install naming
no model — is now refused under a `costUsd` ceiling, because there is no id to
price it by and codex reports nothing to price it with. Name the model
(`codex:gpt-5`) or set the ceiling in tokens.

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
