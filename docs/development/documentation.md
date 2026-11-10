---
title: Documentation
description: How half of this is generated from the code, how the other half is held to rules, why the gate goes red when either drifts, and what a site consumes.
group: Development
order: 4
---

# Documentation

The rule this documentation is built to is one sentence:

> **Anything a machine can read out of the code is never written by hand.**

Every table of commands, settings, ports, actions, events, states, gates and
rules on this site was read out of the thing it describes. The prose between
them is written by people, and held to the [prose check](#the-prose-check). The
gate goes red when the two disagree, and when the prose breaks a rule.

## Generating and checking

```sh
npm run docs:generate      # rewrite everything derived from the code
npm run docs:check         # write nothing; exit non-zero if anything would change
```

`docs:check` is in `npm run gate` and the pre-commit hook. Add a setting to a
plugin, forget to regenerate, and:

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
| The host's commands, arguments, options, defaults | `packages/cli/src/index.ts` | The commander chain, parsed as a TypeScript AST |
| Action catalogue | `packages/core/src/actions.ts` | AST, with each action's doc comment |
| Port contracts and their methods | `packages/core/src/ports/*.ts` | AST, with signatures and doc comments |
| Plan kinds | `packages/core/src/work.ts` | AST over the union |
| Event kinds and every `detail` shape | `packages/core/events.json` | Read as data; it already is a contract |
| **What each plugin mounts and contributes** | The built plugin | It is *registered*, against a registry that only takes notes |
| The operations, commands and events a package brings | The built plugin | What it declares beside `register` |
| Each plugin's settings | The built plugin | Its declared `configSchema` |
| Each workflow's states, waiting states, terminal states, actions | The built workflow and its `workflow.mmd` | The machine it registers, shaped by the diagram beside it |
| When to use a plugin | Its `package.json` | `amy.about`, the one paragraph written by hand |
| Environment variables a package needs | Its `src` | Every `process.env.X` it names |
| `config.yaml` keys and defaults | `packages/cli/src/config.ts` | AST over `AmyConfig` and `DEFAULT_CONFIG` |
| The annotated example config | The same file | The constant that holds it |
| Gates, rules, and why a rule is off | `.software-factory/policy.yaml` | Including the YAML comments, which is where the reasons live |
| Releases | GitHub, cached | See below |
| Pending changes | `.changeset/` | Front matter and body |

The plugin row is the unusual one. Nothing declares "this plugin mounts the
`tracker` port" in a manifest somebody keeps in step: **the plugin is
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
| `@amykit/plugin-agent-browser` | Drives a web page through agent-browser: open, snapshot, act on refs, diff, and a UI check that settles on structure, then pixels, then an agent. |  |  |
| `@amykit/plugin-agent-desktop` | Drives a desktop app through agent-desktop: snapshot its accessibility tree and act on its refs. |  |  |
| `@amykit/plugin-agent-relay` | One agent made of several: swaps harness on a quota, escalates model on a failure. | `agent` |  |
| `@amykit/plugin-claude` | The claude CLI as the agent, over its JSON envelope. |  | `harness:claude`<br>`usage:Claude` |
| `@amykit/plugin-codex` | The codex CLI as the agent, over its JSONL event stream. |  | `harness:codex`<br>`usage:Codex` |
| `@amykit/plugin-command` | Any command line tool, reached by a name the config allows. | `commands` |  |
| `@amykit/plugin-command-gate` | A gate that runs the target repository's own commands. | `gate` |  |
| `@amykit/plugin-concurrent-engine` | Advances one work item per tick, moving every lane of a fork at once. | the engine |  |
| `@amykit/plugin-file-brief-store` | Briefs kept as one file per item. | `brief` |  |
| `@amykit/plugin-file-notes` | Friction as a directory of notes: written by hand, by a hook, or by a tick that failed. | `notes` |  |
| `@amykit/plugin-file-queue` | A queue kept as one file per item, claimed by rename. | `queue` |  |
| `@amykit/plugin-file-store` | Work records kept as one file per item. | `store` |  |
| `@amykit/plugin-file-tasks` | Tasks as a directory of files: written by `amy btw`, by an editor, or by a hook. | `tasks` |  |
| `@amykit/plugin-file-worktree` | One isolated checkout per piece of work, created or reused, pruned by retention. | `workspace`<br>`worktree` |  |
| `@amykit/plugin-github` | GitHub as the code host, through the gh CLI. | `code-host` |  |
| `@amykit/plugin-hermes-agent` | Hermes as the agent, over its one-shot mode and usage report. |  | `harness:hermes`<br>`usage:Hermes ()` |
| `@amykit/plugin-linear` | Linear as the tracker, over its GraphQL API. | `feature`<br>`tracker` |  |
| `@amykit/plugin-next-steps` | A next-steps table as the tracker: a row is a work item, its plan the body, read from the base branch. | `tracker` |  |
| `@amykit/plugin-notify-fanout` | Posts announcements to a mounted conversation, or fans them out through configured channels when no conversation is mounted. | `notifier` |  |
| `@amykit/plugin-notify-hermes` | Announcements over Hermes, which already owns the messaging credentials. | `notify` | `notify-channel:hermes` |
| `@amykit/plugin-notify-inbox` | Announcements as a file on disk plus a desktop notification. |  | `notify-channel:inbox` |
| `@amykit/plugin-plan-check` | The quality bar for a drafted plan: the repository's own check, run in its checkout. | `plan-check` |  |
| `@amykit/plugin-serial-engine` | Advances one work item by one move per tick. | the engine |  |
| `@amykit/plugin-slack` | A Slack thread per piece of work, over the Web API, as the conversation port. | `conversation` |  |
| `@amykit/plugin-telegram` | A topic per piece of work in the operator's private chat with a Telegram bot, as the conversation port. | `conversation` |  |
| `@amykit/plugin-terminal` | Drives an interactive terminal program through terminal-use: run it, type, press keys, wait for text and read the screen. |  |  |
| `@amykit/plugin-terminal-conversation` | The person's terminal as an amy conversation: asks post to stdout, and answers come back as a line or a number. | `conversation` |  |

<!-- amy:end plugin-index -->

The reasoning about all this is prose, and it is mine.
```

Everything **outside** the markers belongs to whoever wrote it and is never
touched. Everything inside is replaced.

These are errors rather than warnings:

- A page naming a block nothing produces. A reference section that renders
  nothing without saying so is worse than a build that fails.
- A block nothing places. A fact the documentation has and does not show is the
  same failure as one that is out of date.

## What is written wholesale

**Every package README.** `packages/*/README.md` and `plugins/*/README.md` are
generated from the package itself and carry a banner saying so. A plugin's
README says what it extends (ports, actions, operations, commands, events,
environment), read from the package, and opens with its `amy.about`; a plugin
under `plugins/` with no `amy.about` fails the generator, naming it. A
hand-written README per package is one more thing per package that stops being
true without anybody noticing.

**An example keeps its introduction as prose.** `examples/*/README.md` opens
with what the workflow is for, written for somebody who has never seen amy,
and the generator owns only the `reference` block below it: the states, the
settings and what the package brings.

**The root `README.md` is a summary, written by hand.** Its Node requirement is
a generated block. The command table and the factory counts it used to carry
live in the [CLI reference](../reference/cli.md) and [The gate](the-gate.md),
and the prose check holds the rest. Why: [the README counts nothing by hand](../design/the-readme-counts-nothing-by-hand.md).

**`docs/manifest.json`**: see below.

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
forget. What is editorial, such as "Start here" coming before "Reference", is the
only thing written down, because nothing in the file system says it.

## The news cache

```sh
npm run docs:changelog     # hits GitHub, writes docs/changelog/releases.json
```

Its own command rather than part of generating, because the two answer to
different masters. Fetching needs a network and a credential and changes when
somebody publishes; generating has to be reproducible on any machine at any
time. Keeping them apart is what lets `docs:check` be a check rather than a coin
toss, and it means building the documentation works on an aeroplane.

## The part that uses an agent

```sh
npm run docs:draft
```

Everything above is deterministic and is what the gate enforces. This is the
other half: for a surface that is newly *undocumented* (a new port, a plugin
with no page, a workflow nobody wrote prose for) it asks an agent to draft the
prose and leaves it for a person to edit.

It does not have an HTTP client of its own. It **mounts amy's own harness
plugins** through `mount()` and asks through the `agent` port, which means it
goes up the same ladder, under the same budget ceiling, into the same event log
as everything else amy does.

That is deliberate dogfooding: it is a consumer of the plugin model that is not
the engine, and if the model only works for the thing it was written for, it
does not work. See [`scripts/docs/draft.ts`](https://github.com/nicolasmelo1/amy/blob/main/scripts/docs/draft.ts).

**It never runs in the gate**, and nothing it writes is trusted without review.
A generated table is a fact; generated prose is a draft.

## The prose check

The written half drifts the same few ways every time, so `scripts/docs/prose.ts`
holds it to rules, and `npm run docs:check` fails naming the file, the line and
the rule. It reads every page a user reads: `README.md`, `CONTRIBUTING.md`,
`docs/` outside `docs/design/` and the changelog, and the READMEs under
`examples/`, `plugins/` and `packages/`. Plans, changesets and design notes keep
their prose as written. Prose is what is left once fenced code, inline code,
link targets, HTML comments and generated blocks are blanked; front matter's
`title` and `description` count as prose.

- **No hand-written count.** A digit or a number-word directly before a plural
  noun, in a heading or a sentence, is a count somebody will forget to change.
  Say it with no number, or let a generated block say it.
- **No listed slop.** The em dash, an en dash between spaces,
  `not just`, `isn't just`, `not only` and `not merely`, and a list of words and phrases (`SLOP` in the file) taken from
  [Wikipedia's signs of AI writing](https://en.wikipedia.org/wiki/Wikipedia:Signs_of_AI_writing)
  and from amy's own taglines. Review still reads for what a list cannot catch.
- **A prose limit.** The root README, a guide, a concept page and an example's
  introduction each have a ceiling in characters (`LIMITS`); code and generated
  blocks do not count.
- **Code that compiles.** Every `ts` fence on a page under `docs/guides/` or
  `docs/concepts/` is typechecked against the repository's source, by
  `scripts/docs/tests/examples.test.ts` rather than the docs check, because it
  compiles the core. A page there with no checked block fails, unless it is in
  `PROSE_ONLY` with its reason. A block that cannot compile opts out only with
  `<!-- amy:untyped REASON -->` on the line above it; relabelling the fence or
  silencing it with `@ts-ignore` fails. `<!-- amy:file NAME -->` names a block
  as a file, so another block on the page can import it, and
  `<!-- amy:scaffold NAME -->` names a block as a file `amy workflow new`
  writes, which the `workflow-new` scenario holds byte for byte to the scaffold.
- **Glossary links in guides.** In `docs/guides/`, the first prose use of each
  term the [glossary](../concepts/glossary.md) defines links to its anchor.
- **Every design note is reachable.** A note in `docs/design/` is linked from a
  page a user reads, or listed in `SUPERSEDED` naming what replaced it.
- **The README stays a summary.** It links every nav group, each of its sections
  ends in a link, its install block stays under the command ceiling the check
  sets, it names Claude Code,
  Codex and Hermes, it links the skills for agents, and it shows the logo.
- **`amy.about` is prose too.** A plugin's `amy.about` is held to the count and
  slop rules where it is written, in its `package.json`.

## Adding a generated block

1. Write the extractor under `scripts/docs/sources/`, returning plain data.
2. Add the renderer to `scripts/docs/blocks.ts`, keyed by the block's name.
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
