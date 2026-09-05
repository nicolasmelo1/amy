---
title: Configuration
description: One file, two halves — what the host needs to know, and one slice per plugin.
group: Start here
order: 4
---

# Configuration

`~/.amy/config.yaml` has two halves, and the split is the whole design.

The **top level** is what the host itself needs: which workflows exist, which
repositories the team works in, what the tracker's status names are, what the
agents may spend. The **`plugins:` block** is one slice per plugin, keyed by
package name, and *the host never reads inside a slice*. Each plugin declares
what its own looks like, and a key that is not one it declared is refused at
boot naming the plugin and the key.

That is why adding a plugin nobody here has heard of costs no change to amy: it
brings its own schema, and validation follows.

```sh
amy init          # writes the template below
amy doctor        # checks it, and exits non-zero when something is wrong
```

## The host's own keys

<!-- amy:generated config-fields -->

| Key | Type | Default | What it is |
| :-- | :-- | :-- | :-- |
| `workflows` | `Record<string, WorkflowProfile>` | `{}` | The workflows this install can drive, by the name typed after `--workflow`. Merged over the shipped two, so naming one replaces it and naming a third adds it. |
| `defaultWorkflow` | `string` | `""` | Which profile runs when nothing is named. Empty means the first. |
| `repos` | `string[]` | `[]` |  |
| `qaStatusName` | `string` | `"In QA"` |  |
| `workingStatusName` | `string` | `"In Progress"` | The tracker status a ticket must be in to be picked up. |
| `retentionDays` | `number` | `7` |  |
| `staleClaimMs` | `number` | `30 * 60 * 1000` |  |
| `maxItemAttempts` | `number` | `5` |  |
| `policy` | `Policy` | `DEFAULT_POLICY` |  |
| `workspaceRoot` | `string` | `"."` | Directory holding one checkout per repository. `~` is expanded. |
| `defaultBranch` | `string` | `"main"` | Branch new work is cut from. |
| `repoByTeam` | `Record<string, string>` | `{}` | Which repository a team's tickets land in, by team key. |
| `gate` | `Record<string, string[]>` | `{}` | Gate commands per repository, with a `default` fallback. |
| `agent` | `{ model?: string; /** Model tiers offered to the relay, cheapest first. */ models?: string[]; /** * Which contributed agents to try, in order, such as * `[claude:sonnet, claude:opus, codex:gpt-5]`. Empty means every agent * that was contributed, in mounting order. * * Naming a harness here is also what mounts it, so a ladder is the one * place an operator says which harnesses they have. */ ladder?: string[]; /** * A ladder for one step, keyed by the workflow's action name, overriding * the one above. * * Reading a ticket to decide whether it is clear enough to start is not * the same job as writing the change, and one list for both means paying * the expensive model to do the cheap step. A name here mounts its * harness exactly as a name in `ladder` does. */ ladderByStep?: Record<string, string[]>; reviewerHints?: Record<string, string>; timeoutMs?: number; /** * What the agents may spend, per window. Read by the relay, which is the * only thing here that spends one. Shape checked at boot, not here. */ budget?: Record<string, unknown>; }` | `{}` |  |
| `skills` | `Record<string, string[]>` | `{}` | Which skills answer for a step, in the order they are tried, keyed by the workflow's action name. A skill named here has to be installed. |
| `notify` | `NotifyConfig` | `{ tracker: true, hermes: null, inbox: true }` |  |
| `plans` | `PlansConfig` | `{ repos: [], check: { default: ["sf check"] }, policy: {} }` |  |
| `errands` | `ErrandsConfig` | `{ policy: {} }` |  |
| `plugins` | `Record<string, unknown>` | `{}` | One slice per plugin, keyed by package name. |

<!-- amy:end config-fields -->

## A workflow profile

Each entry under `workflows:` is a **profile**: a name you type after
`--workflow`, and the directory its records and queue live in.

<!-- amy:generated config-profile -->

| Key | Type | Required | What it is |
| :-- | :-- | :-- | :-- |
| `workflow` | `string` | **yes** | The package contributing `plan()` and the runtime that answers it. |
| `plugins` | `string[]` | no | What to mount, in order. Empty means the recommended set. |
| `notes` | `boolean` | no | Whether `amy note` files friction onto this profile's queue. |
| `tasks` | `boolean` | no | Whether `amy btw` puts a task onto this profile's queue. |

<!-- amy:end config-profile -->

Naming a profile that matches a shipped one replaces it; naming a new one adds
it. Nothing in amy's own code enumerates what is allowed. See
[Workflows and profiles](workflows-and-profiles.md).

## Plugin settings

Every plugin declares its own schema, and every field below is checked at boot.
The full table, one section per plugin, is in
[Reference → Plugins](../reference/plugins.md).

```yaml
plugins:
  "@amykit/plugin-file-queue":
    directory: queue
    retentionDays: 7
```

Three things this buys, and each one is a failure that used to be silent:

- **A typo is refused, not ignored.** `retentionDay: 7` is `` `retentionDay` is
  not a setting this plugin has ``, at boot. A setting that silently never
  applied is the expensive kind of wrong.
- **Every problem at once.** Validation reports every field it can, so one boot
  fixes one round of edits rather than one field per attempt.
- **A plugin with no schema takes no settings.** Giving one settings anyway is
  refused, because there is nothing that would read them.

## The template `amy init` writes

This is the file itself, taken from the constant the command writes it from — so
it cannot drift from what you actually get.

<!-- amy:generated config-example -->

```yaml
# The workflows this install can drive. The name is what goes after
# --workflow, and it is also the directory the profile's records and queue
# live in, so switching between two of them never loses the state of either.
#
# Leave this out and you get the two below. Name a third — a work one, an
# on-call one, one that is yours and not versioned anywhere — and it drives
# on the same engine, the same log and the same budget as these.
workflows:
  ticket-to-qa:
    workflow: "@amykit/workflow-ticket-to-qa"
    # plugins: []   # empty means the recommended set for this workflow
  note-to-plan:
    workflow: "@amykit/workflow-note-to-plan"
    notes: true     # `amy note` files friction onto this profile's queue

# Which one runs when --workflow is not given. The first, if this is empty.
defaultWorkflow: ticket-to-qa

# Repositories the team reviews in. Review load is counted across all of
# them, because counting one would send every review to whoever happens to be
# quiet in that one.
repos:
  - Northwind/northwind-backend
  - Northwind/northwind-frontend

# Tracker status names, matched exactly. Not categories: the tracker files
# In Review, In QA and Ready To Release under the same category as
# In Progress, so a category match picks up work that is already past
# implementation.
workingStatusName: In Progress
qaStatusName: In QA

# Finished queue items are only useful for reading the log afterwards.
retentionDays: 7

# What the engine does with an item that went wrong rather than with the work
# itself. A claim older than staleClaimMs belonged to a worker that is no
# longer running, so the item is handed back; past maxItemAttempts the item is
# dropped and you are told, rather than retried forever in silence.
staleClaimMs: 1800000
maxItemAttempts: 5

# The third workflow: something you said in passing becomes a pull request.
# `amy btw "bump the deps in the api"` puts one on the queue. It works in the
# repositories named above, so it needs no list of its own — only its ceilings.
errands:
  policy:
    maxAttempts: 2
    # Capturing an errand costs nothing, which is the whole point and also the
    # failure: past this many in flight it holds rather than opening a
    # thirtieth pull request nobody asked to review.
    maxInFlight: 3
    ceilingBackoffMs: 1800000

# How the machine behaves when something is in its way. Anything left out
# keeps its default. maxOpenReviewsPerReviewer is the one that spends a
# currency nobody can top up: past it, the pull request stays open with
# nobody assigned rather than landing on somebody already buried.
#
# The two ceilings on size are the cheap ones: the forge already told us how
# big the change is, so a pull request nobody should automate is handed back
# before an agent is called rather than after three attempts at it. Zero on
# either switches it off.
#
# The two backoffs are how long a waiting state holds before it looks again.
# Neither one runs while work is happening: a step that takes half an hour is
# one look that takes half an hour, and the look after it is queued the moment
# it finishes. They only govern how quickly the machine notices somebody else
# moved, and `amy poke <workId>` collapses either on demand.
policy:
  maxImplementAttempts: 3
  maxGateAttempts: 3
  pollBackoffMs: 300000       # 5 minutes: waiting on an answer, or on a review
  rosterBackoffMs: 1800000    # 30 minutes: waiting for the roster to be confirmed
  maxOpenReviewsPerReviewer: 2
  maxPullRequestFiles: 60
  maxPullRequestLines: 2000

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

# Where the checkouts live. One directory per repository, named after the
# repository without its owner.
workspaceRoot: ~/workspaces/northwind
defaultBranch: main

# Which repository a team's tickets land in, by team key. A team that is not
# listed falls back to the first entry in "repos".
repoByTeam:
  PROJ: Northwind/northwind-backend
  WEB: Northwind/northwind-backend

# The deterministic gate. Nothing reaches a pull request until this is green.
# A repository with no entry here, and no "default", is refused rather than
# waved through.
gate:
  Northwind/northwind-backend:
    - npm run --workspace @northwind/api lint
    - npm run --workspace @northwind/api typecheck

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
notify:
  tracker: true      # comment on the ticket
  hermes: slack:my-channel   # a Hermes delivery target, or null
  inbox: true        # a file in .amy/needs-input plus a desktop notification

# The second workflow: friction this machine hits becomes a plan in the
# repository it is about. Leave "repos" out and nothing here is mounted at all
# — a note would have nowhere to go.
#
# The check is the whole quality bar, and it is the repository's own rather
# than a rubric invented here: a plan with no exit condition, or one missing
# from the ordered list, is red and goes back to the agent with the finding.
plans:
  repos:
    - Northwind/amy
    - Northwind/software-factory
  check:
    default:
      - sf check
  policy:
    maxDraftAttempts: 2
    # Past this many plans in flight for one repository, it holds rather than
    # opening another pull request nobody has read. The reviewer ceiling's
    # argument with a different number.
    maxOpenPlansPerRepo: 2
    ceilingBackoffMs: 1800000

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

# One slice per plugin, keyed by package name. Nothing here is read by the
# host: each plugin declares what its own slice looks like, and "amy doctor"
# refuses a field that is not one the plugin has. A plugin with no slice runs
# on its defaults.
plugins:
  "@amykit/plugin-notify-hermes":
    target: slack:my-channel
  "@amykit/plugin-file-queue":
    retentionDays: 7
```

<!-- amy:end config-example -->

## The roster

`~/.amy/roster.yaml` says who is reviewing and who owns QA. It carries a
`confirmedOn` date, and on a workday the machine **refuses to assign anybody
while it is not today**.

That is not bureaucracy. People go on leave without editing a config file, and a
review assigned to somebody who is away stalls for days with nothing looking
broken. It does not ask at the weekend, because nobody is there to answer.

```sh
amy roster confirm     # stamp today's date
amy roster show        # print it, and whether it is current
```

<!-- amy:generated roster-example -->

```yaml
# Who is reviewing today, and who owns QA.
#
# confirmedOn is checked against today's date on every workday. The machine
# refuses to assign anybody while it is stale, because people go on leave
# without editing a config file and a review assigned to someone who is away
# stalls for days without anything looking broken.
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

## Credentials

Never in `config.yaml`. They go in `~/.amy/.env`, and the environment wins over
the file. See [Installation → Credentials](installation.md#credentials).

## Two ceilings

An overnight run spends two things that are not yours to spend: quota, and your
colleagues' attention.

```yaml
policy:
  maxOpenReviewsPerReviewer: 2
agent:
  budget:
    perFiveHours: { tokens: 2000000, costUsd: 20 }
    perWeek: { tokens: 30000000, costUsd: 150 }
    stopAt: 0.9
```

Both are explained in [Budgets and ceilings](../concepts/budgets.md), including why
the budget is read from the log rather than from a tally of its own, and why the
reviewer ceiling parks the pull request instead of the work.
