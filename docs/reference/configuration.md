---
title: Configuration
description: Every key in config.yaml, its type and its default — from the interface that defines it.
group: Reference
order: 6
---

# Configuration reference

`~/.amy/config.yaml`. The host's own keys are read out of the interface that
defines them; each plugin's slice is in [Plugins](plugins.md).

For what the two halves mean and why, see
[Configuration](../start/configuration.md).

## The host's keys

<!-- amy:generated config-fields -->

| Key | Type | Default | What it is |
| :-- | :-- | :-- | :-- |
| `workflows` | `Record<string, WorkflowProfile>` | `{}` | The workflows this install can drive, by the name typed after `--workflow`. Merged over the shipped two, so naming one replaces it and naming a third adds it. |
| `defaultWorkflow` | `string` | `""` | Which profile runs when nothing is named. Empty means the first. |
| `extraPlugins` | `string[]` | `[]` | Plugins mounted under every profile, named here or added with `amy add`. A workflow's own plugins stay in its profile; this is the list for what somebody mounted on top, and it is kept apart so a profile left on the recommended set stays on it. |
| `add` | `unknown` | `"package"` | What `amy add <package>` does with no flag: install the published package (`package`), or take its source as a fork the profile owns (`fork`). Read as written, so a mode amy does not know is refused naming this key. |
| `forks` | `string` | `""` | Where forks go when `--to` names no place; empty means the default — the project of a workflow of your own, or the profile's directory in AMY_HOME. |
| `autoUpdate` | `AutoUpdateConfig` | `DEFAULT_AUTO_UPDATE` | One machine-wide cadence, persisted separately for every profile. |
| `autoUpdateSource` | `unknown` |  | A scalar/null source value retained so malformed YAML cannot become valid. |
| `chat` | `{ budget: boolean }` | `{ budget: false }` | The chat amy answers in. A conversation is not work: unless `budget` is on, its agent runs are held to no ceiling and kept out of the ledger the work is admitted against. |
| `chatSource` | `unknown` |  | The `chat` block as written, kept so a malformed one is refused rather than defaulted. |
| `retentionDays` | `number` | `7` |  |
| `staleClaimMs` | `number` | `30 * 60 * 1000` |  |
| `maxItemAttempts` | `number` | `5` |  |
| `agent` | `{ model?: string; /** Model tiers offered to the relay, cheapest first. */ models?: string[]; /** * Which contributed agents to try, in order, such as * `[claude:sonnet, claude:opus, codex:gpt-5]`. Empty means every agent * that was contributed, in mounting order. * * Naming a harness here is also what mounts it, so a ladder is the one * place an operator says which harnesses they have. */ ladder?: string[]; /** * A ladder for one step, keyed by the workflow's action name, overriding * the one above. * * Reading a ticket to decide whether it is clear enough to start is not * the same job as writing the change, and one list for both means paying * the expensive model to do the cheap step. A name here mounts its * harness exactly as a name in `ladder` does. */ ladderByStep?: Record<string, string[]>; reviewerHints?: Record<string, string>; timeoutMs?: number; /** * What the agents may spend, per window. Read by the relay, which is the * only thing here that spends one. Shape checked at boot, not here. */ budget?: Record<string, unknown>; }` | `{}` |  |
| `skills` | `Record<string, string[]>` | `{}` | Which skills answer for a step, in the order they are tried, keyed by the workflow's action name. A skill named here has to be installed. |
| `notify` | `NotifyConfig` | `{ hermes: null, inbox: true }` |  |
| `plugins` | `Record<string, unknown>` | `{}` | One slice per plugin, keyed by package name. |

<!-- amy:end config-fields -->

## A workflow profile

<!-- amy:generated config-profile -->

| Key | Type | Required | What it is |
| :-- | :-- | :-- | :-- |
| `workflow` | `string` | **yes** | The package contributing `plan()` and the runtime that answers it. |
| `plugins` | `string[]` | no | What to mount, in order. Empty means the recommended set. |
| `briefStore` | `string` | no | The package providing durable briefs for this workflow. When omitted, legacy explicit profiles that still name file-store receive the local file provider they had before briefs became their own mount. |
| `notes` | `boolean` | no | Whether `amy note` files friction onto this profile's queue. |
| `tasks` | `boolean` | no | Whether `amy btw` puts a task onto this profile's queue. |
| `agent` | `Partial<AmyConfig["agent"]>` | no | A profile may spend differently from the machine-wide default. |
| `settings` | `ProfileSettings` | no | The workflow's own settings, over what its schema and the machine fill in. |

<!-- amy:end config-profile -->

## Environment variables

<!-- amy:generated environment -->

| Variable | Read by |
| :-- | :-- |
| `AMY_PROJECT_ENV` | `@amykit/cli` |
| `AMY_SUPERVISOR` | `@amykit/cli` |
| `CLAUDE_CODE_OAUTH_TOKEN` | `@amykit/plugin-claude` |
| `CODEX_HOME` | `@amykit/plugin-codex` |
| `LANG` | `@amykit/cli` |
| `LINEAR_API_KEY` | `@amykit/plugin-linear` |
| `NO_COLOR` | `@amykit/cli` |
| `OLLAMA_API_KEY` | `@amykit/plugin-hermes-agent` |
| `PATH` | `@amykit/cli` |
| `TELEGRAM_BOT_TOKEN` | `@amykit/plugin-telegram` |
| `TERM` | `@amykit/cli` |
| `VITEST` | `@amykit/test-fixtures` |

<!-- amy:end environment -->

These live in `~/.amy/.env`, and anything already exported in the shell wins
over the file. A `.env` in the directory you ran the command from is read too,
and beats the machine-wide one.

## The annotated example

<!-- amy:generated config-example -->

```yaml
# The workflows this install can drive. The name is what goes after
# --workflow, and it is also the directory the profile's records and queue
# live in, so switching between two of them never loses the state of either.
#
# Declared here, not shipped: this machine drives nothing until a workflow is
# named. `amy add <package>` installs one and writes the profile block for
# you, from what the workflow's own schema asks for — the settings below are
# the example that teaches, and `amy config explain` names every setting the
# machine could take, with its type, its default and why it is there.
#
#   workflows:
#     ticket-to-qa:
#       workflow: "@amykit/workflow-ticket-to-qa"
#       settings:
#         # The status a ticket moves to when it is handed to QA.
#         qaStatusName: In QA
#         # The ceilings the ticket workflow's decisions read live here too —
#         # every one has a default, so naming a block is starting a tune.
#         # policy:
#         #   maxImplementAttempts: 3
#         #   pollBackoffMs: 300000
#
# A workflow of your own is the same shape, under ~/.amy/workflows;
# `amy workflow new <name>` writes one.
#
# Which one runs when --workflow is not given. The first, if this is empty.
# defaultWorkflow: ticket-to-qa
#
# Plugins mounted under every workflow, named here or added with `amy add`.
# Kept apart from a profile's own `plugins:` so a profile left on the
# recommended set stays on it and gains one, rather than having the whole
# recommendation copied into the config behind your back.
# extraPlugins: []
#
# Keep the packages this machine mounts current around workflow invocations.
# The count is kept per workflow profile under ~/.amy, so restarting does not
# reset it. Set enabled false to leave updates entirely to the operator.
autoUpdate:
  enabled: true
  timing: before
  everyRuns: 20

# Finished queue items are only useful for reading the log afterwards.
retentionDays: 7

# What the engine does with an item that went wrong rather than with the work
# itself. A claim older than staleClaimMs belonged to a worker that is no
# longer running, so the item is handed back; past maxItemAttempts the item is
# dropped and you are told, rather than retried forever in silence.
staleClaimMs: 1800000
maxItemAttempts: 5

# Which agents to try, cheapest first. Naming a harness here is what mounts
# it, so leaving codex and hermes out means they are never required to be
# installed. A failure moves to the next model of the same harness and then to
# the next harness; a rate limit skips the rest of that harness, because a
# bigger model behind the same quota is still blocked.
#
# ladderByStep overrides the list for one step, keyed by the workflow's action
# name — reading a ticket and writing the change are not the same job, and one
# list for both pays the expensive model to do the cheap step.
agent:
  ladder: [claude:sonnet, claude:opus]
  ladderByStep:
    triage: [claude:haiku]
    implement: [claude:opus]
  # Long flag: the claude CLI does not accept -m.
  model: sonnet
  # What the agents may spend. Two ceilings per window and the first one to
  # blow parks the work: tokens are what a subscription meters, dollars are
  # what an API key costs. A run whose cost nobody reported moves the token
  # ceiling and not the dollar one. Leave the whole block out for no ceiling.
  budget:
    perFiveHours: { tokens: 2000000, costUsd: 20 }
    perWeek: { tokens: 30000000, costUsd: 150 }
    # The fraction of a ceiling at which new work stops being started.
    stopAt: 0.9
  # Guidance appended when answering a particular reviewer, by host login.
  # A reviewer with known habits is cheaper to satisfy on the first pass.
  reviewerHints:
    edsger: >-
      Delete anything that is not needed. No variable that aliases an existing
      value, no check the types already guarantee, no comment stating the
      obvious, no non-null assertions.

# Who does each step. A step with no entry is done by the agent in amy's own
# words, which is every step until you say otherwise. A skill named here must
# be installed under ~/.claude/skills, or the mount is refused at boot: a
# ladder that quietly means less than it says would first show up as a ticket
# escalating for no reason.
#
# The skills are tried in order, and each one is tried across the harness
# ladder above before the next gets a turn. Only the three steps an agent
# performs can be handed over: triage, implement, address-threads.
# skills:
#   address-threads: [/northwind-code-review, /logion]
#   triage: [/logion]

# Where the machine reaches you. It needs at least one of these.
#
# There is no tracker line any more. A tracker comment is for a question that
# needs a person, and the workflow posts those itself; progress notices belong
# on the operator's channels, which are the two below. That removes the
# pollution rather than teaching every reader to filter it.
notify:
  hermes: slack:my-channel   # a Hermes delivery target, or null
  inbox: true        # a file in .amy/needs-input plus a desktop notification

# Any command line tool, reached by a name. One adapter for all of them: the
# machine learns that a name maps to a line somebody wrote down, and nothing
# about what pup or ntn mean.
#
# The line comes only from here, and only the arguments may come from a
# workflow. A line assembled from a ticket body would be a machine that runs
# whatever a stranger can type into an issue.
#
#   "@amykit/plugin-command":
#     allow:
#       datadog: pup monitors list --json
#       notion: ntn page get
#
# The machine carries none of the vocabulary of a particular plugin: what the
# agents spend is the only top-level block left here, and the workspace — the
# repositories, where their checkouts live, their branches and their worktrees —
# is the file-worktree plugin's slice, the gate commands the command-gate
# plugin's. `amy update` moves an old install, `amy config explain`
# lists every slice's settings, and an install that drives no code mounts no
# workspace and is asked for none of it.
#
#   plugins:
#     "@amykit/plugin-file-worktree":
#       repos:
#         - Northwind/northwind-backend
#         - Northwind/northwind-frontend
#       workspaceRoot: ~/workspaces/northwind
#       defaultBranch: main
#     "@amykit/plugin-command-gate":
#       gate:
#         Northwind/northwind-backend:
#           - npm run --workspace @northwind/api lint
#           - npm run --workspace @northwind/api typecheck
#
# The tracker's settings and every workflow's own live with what mounts them.
# plugins:
#   "@amykit/plugin-notify-hermes":
#     target: slack:my-channel
#   "@amykit/plugin-file-queue":
#     retentionDays: 7
#   "@amykit/plugin-linear":
#     workingStatusName: In Progress
#     repoByTeam:
#       PROJ: Northwind/northwind-backend
```

<!-- amy:end config-example -->

## The roster template

<!-- amy:generated roster-example -->

```yaml
# Who is reviewing today, and who owns QA.
#
# confirmedOn is checked against today's date on every workday. The machine
# refuses to assign anybody while it is stale, because people go on leave
# without editing a file and a review assigned to someone who is away stalls
# for days without anything looking broken.
#
# Confirm it with: amy roster confirm
confirmedOn: "1970-01-01"

reviewers:
  - tracker: ada@example.test
    host: ada
    available: true
  - tracker: alan@example.test
    host: alan
    available: true
  - tracker: edsger@example.test
    host: edsger
    available: true

qa:
  tracker: grace@example.test
  host: grace
  available: true
```

<!-- amy:end roster-example -->
