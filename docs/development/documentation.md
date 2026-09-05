---
title: Documentation
description: How half of this is generated from the code, why the gate goes red when it drifts, and what a site consumes.
group: Development
order: 4
---

# Documentation

The rule this documentation is built to is one sentence:

> **Anything a machine can read out of the code is never written by hand.**

Every table of commands, settings, ports, actions, events, states, gates and
rules on this site was read out of the thing it describes. The prose between
them is written by people. The gate goes red when the two disagree.

## The two commands

```sh
npm run docs:generate      # rewrite everything derived from the code
npm run docs:check         # write nothing; exit non-zero if anything would change
```

`docs:check` is in `npm run gate`. Add a setting to a plugin, forget to
regenerate, and:

```
docs: the code moved and the documentation did not. These are out of date:
  docs/reference/plugins.md
  plugins/file-queue/README.md
  docs/manifest.json

  run `npm run docs:generate` and commit the result
```

Same promise `L3.GATE_HAS_FRESH_EVIDENCE` makes about a gate's evidence: a proof
about code that no longer exists is not a proof.

## What is derived, and from where

| Fact | Read from | How |
| :-- | :-- | :-- |
| Commands, arguments, options, defaults | `packages/cli/src/index.ts` | The commander chain, parsed as a TypeScript AST |
| Action catalogue | `packages/core/src/actions.ts` | AST, with each action's doc comment |
| Port contracts and their methods | `packages/core/src/ports/*.ts` | AST, with signatures and doc comments |
| Plan kinds | `packages/core/src/work.ts` | AST over the union |
| Event kinds and every `detail` shape | `packages/core/events.json` | Read as data — it already is a contract |
| **What each plugin mounts and contributes** | The built plugin | It is *registered*, against a registry that only takes notes |
| Each plugin's settings | The built plugin | Its declared `configSchema` |
| Each workflow's states, waiting states, terminal states, actions | The built workflow | Its exported machine object |
| Environment variables a package needs | Its `src` | Every `process.env.X` it names |
| `config.yaml` keys and defaults | `packages/cli/src/config.ts` | AST over `AmyConfig` and `DEFAULT_CONFIG` |
| The `amy init` templates | The same file | The constants the command writes them from |
| Gates, rules, and why a rule is off | `.software-factory/policy.yaml` | Including the YAML comments, which is where the reasons live |
| Releases | GitHub, cached | See below |
| Pending changes | `.changeset/` | Front matter and body |

The plugin row is the one worth pausing on. Nothing declares "this plugin mounts
the `tracker` port" in a manifest somebody keeps in step — **the plugin is
registered against a fake registry and asked**. A plugin that reads a credential
at mount is given a placeholder for exactly the variables its own source names,
for the length of one call, and never over a value already in the environment.

## How a page is generated

A page is markdown with markers in it:

```markdown
## Every shipped plugin

<!-- amy:generated plugin-index -->

| Plugin | What it is | Mounts | Contributes |
| :-- | :-- | :-- | :-- |
| `@amy/plugin-agent-relay` | One agent made of several: swaps harness on a quota, escalates model on a failure. | `agent` |  |
| `@amy/plugin-claude` | The claude CLI as the agent, with git on the side. |  | `agent:claude`<br>`harness:claude` |
| `@amy/plugin-codex` | The codex CLI as the agent, over its JSONL event stream. |  | `agent:codex`<br>`harness:codex` |
| `@amy/plugin-command` | Any command line tool, reached by a name the config allows. | `commands` |  |
| `@amy/plugin-command-gate` | A gate that runs the target repository's own commands. | `gate` |  |
| `@amy/plugin-file-notes` | Friction as a directory of notes: written by hand, by a hook, or by a tick that failed. | `notes` |  |
| `@amy/plugin-file-queue` | A queue kept as one file per item, claimed by rename. | `queue` |  |
| `@amy/plugin-file-store` | Work records kept as one file per item. | `store` |  |
| `@amy/plugin-file-tasks` | Tasks as a directory of files: written by `amy btw`, by an editor, or by a hook. | `tasks` |  |
| `@amy/plugin-github` | GitHub as the code host, through the gh CLI. | `code-host` |  |
| `@amy/plugin-hermes-agent` | Hermes as the agent, over its one-shot mode and usage report. |  | `agent:hermes`<br>`harness:hermes` |
| `@amy/plugin-linear` | Linear as the tracker, over its GraphQL API. | `tracker` | `notify-channel:tracker` |
| `@amy/plugin-notify-fanout` | Sends one announcement down every configured channel, and keeps going when one is down. | `notifier` |  |
| `@amy/plugin-notify-hermes` | Announcements over Hermes, which already owns the messaging credentials. |  | `notify-channel:hermes` |
| `@amy/plugin-notify-inbox` | Announcements as a file on disk plus a desktop notification. |  | `notify-channel:inbox` |
| `@amy/plugin-plan-check` | The quality bar for a drafted plan: the repository's own check, run in its checkout. | `plan-check` |  |
| `@amy/plugin-serial-engine` | Advances one work item by one move per tick. | the engine |  |

<!-- amy:end plugin-index -->

The reasoning about all this is prose, and it is mine.
```

Everything **outside** the markers belongs to whoever wrote it and is never
touched. Everything inside is replaced.

Two things are errors rather than warnings:

- A page naming a block nothing produces. A reference section that quietly
  renders nothing is worse than a build that fails.
- A block nothing places. A fact the documentation has and does not show is the
  same failure as one that is out of date.

## What is written wholesale

**Every package README.** `packages/*/README.md` and `plugins/*/README.md` are
generated from the package itself and carry a banner saying so. Twenty
hand-written READMEs is twenty things that quietly stop being true.

**The root `README.md` is not**, deliberately. It is the front door, it is
argued rather than listed, and generating it would cost the one piece of writing
that makes anybody try this at all.

**`docs/manifest.json`** — see below.

## The manifest

```sh
docs/manifest.json
```

One file a website reads instead of the repository. It holds the navigation,
every page with its front matter and headings, the full reference data, the
catalogue, and the news.

The point of it is that **a website is not allowed to become a second place
where the truth lives**. A site can be rebuilt from this file alone and cannot
disagree with the docs.

```json
{
  "version": 1,
  "product": { … },
  "nav": [{ "group": "Start here", "items": [{ "title": "Overview", "path": "/start/overview" }] }],
  "pages": [{ "path": "/start/overview", "title": …, "headings": [ … ], "edit": "https://github.com/…" }],
  "reference": { "actions": [ … ], "contracts": [ … ], "events": [ … ], "cli": { … } },
  "catalog": { "shipped": [ … ], "discovery": { "npmKeyword": "amy-plugin" } },
  "changelog": { "releases": [ … ], "unreleased": [ … ] }
}
```

There is **no timestamp anywhere in it**, deliberately. A generated file that
changes every time it is generated cannot be checked for drift.

## The navigation

`docs/nav.yaml` says which groups exist and in what order. The pages inside one
come from the directory, ordered by the `order` in each page's front matter.

So adding a page puts it in the navigation, and there is no second list to
forget. What is genuinely editorial — that "Start here" comes before "Reference"
— is the only thing written down, because nothing in the file system says it.

## The news cache

```sh
npm run docs:changelog     # hits GitHub, writes docs/changelog/releases.json
```

Its own command rather than part of generating, because the two answer to
different masters. Fetching needs a network and a credential and changes when
somebody publishes; generating has to be reproducible on any machine at any
time. Keeping them apart is what lets `docs:check` be a check rather than a coin
toss — and it means building the documentation works on an aeroplane.

## The part that uses an agent

```sh
npm run docs:draft
```

Everything above is deterministic and is what the gate enforces. This is the
other half: for a surface that is newly *undocumented* — a new port, a plugin
with no page, a workflow nobody wrote prose for — it asks an agent to draft the
prose and leaves it for a person to edit.

It does not have an HTTP client of its own. It **mounts amy's own harness
plugins** through `mount()` and asks through the `agent` port, which means it
goes up the same ladder, under the same budget ceiling, into the same event log
as everything else amy does.

That is deliberate dogfooding: it is a consumer of the plugin model that is not
the engine, and if the model only works for the thing it was written for, it
does not work. See [`scripts/docs/draft.mjs`](https://github.com/nicolasmelo1/amy/blob/main/scripts/docs/draft.mjs).

**It never runs in the gate**, and nothing it writes is trusted without review.
A generated table is a fact; generated prose is a draft.

## Adding a generated block

1. Write the extractor under `scripts/docs/sources/`, returning plain data.
2. Add the renderer to `scripts/docs/blocks.mjs`, keyed by the block's name.
3. Put the markers on the page that should show it.
4. `npm run docs:generate`.

Step 3 is not optional: a block nothing places fails the generator.

## Writing the prose half

- **Say why, not what.** The reference tables already say what. A page that
  restates them is a page that will be skipped.
- **Name the failure.** Nearly every design decision here exists because
  something went wrong. The version of the sentence that names it is the one
  people remember.
- **Link, do not repeat.** One place says a thing; everywhere else points at it.
  Repetition is how documentation drifts even when nobody edits it.
