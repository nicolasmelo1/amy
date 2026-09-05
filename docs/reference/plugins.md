---
title: Plugins
description: Every shipped plugin — what it mounts, what it contributes, and every setting it declares.
group: Reference
order: 2
---

# Plugin reference

Everything on this page is read out of the plugins themselves: each one is
registered against a registry that only takes notes, and its declared config
schema is read from the built package. Nothing here is a list somebody
maintains.

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

## Settings, plugin by plugin

Every field below is validated at boot. A key that is not one a plugin declared
is a refusal naming the plugin and the key — see
[Plugins and the registry](../concepts/plugins.md).

<!-- amy:generated plugin-settings -->

### `@amy/plugin-agent-relay`

One agent made of several: swaps harness on a quota, escalates model on a failure.

|  |  |
| :-- | :-- |
| Source | `plugins/agent-relay` |
| Mounts | `agent` |
| Contributes | _nothing_ |
| Needs in the environment | _nothing_ |
| Depends on | `@amy/agent-kit`, `@amy/core`, `@amy/workflow-ticket-to-qa` |

```yaml
plugins:
  "@amy/plugin-agent-relay":
    budget: {}
    ladder: []
    skillRoots: []
    skills: {}
```

| Setting | Type | Required | Default | What it is |
| :-- | :-- | :-- | :-- | :-- |
| `budget` | `record` | no | `{}` | what the agents may spend, per window: perFiveHours and perWeek, each with tokens and/or costUsd, plus stopAt, the fraction of a ceiling at which new work stops being started |
| `ladder` | `string[]` | no | `[]` | the contributed agents to try, in order, such as [claude:sonnet, claude:opus, codex:gpt-5]. Empty means every contributed agent, in the order the plugins were mounted |
| `skillRoots` | `string[]` | no | `[]` | where installed skills are looked for. Empty means ~/.claude/skills, which is where the harness looks |
| `skills` | `record` | no | `{}` | which skills answer for a step, in the order they are tried, keyed by the workflow's action name: {"triage": ["/logion"]}. A skill named here must be installed, or the mount is refused |

### `@amy/plugin-claude`

The claude CLI as the agent, with git on the side.

|  |  |
| :-- | :-- |
| Source | `plugins/claude` |
| Mounts | _nothing_ |
| Contributes | `agent:claude`, `harness:claude` |
| Needs in the environment | _nothing_ |
| Depends on | `@amy/agent-kit`, `@amy/core`, `@amy/model-specs` |

```yaml
plugins:
  "@amy/plugin-claude":
    defaultBranch: main
    model: ""
    models: []
    reviewerHints: {}
    timeoutMs: 1800000
```

| Setting | Type | Required | Default | What it is |
| :-- | :-- | :-- | :-- | :-- |
| `defaultBranch` | `string` | no | `main` | the branch new work is cut from, which is not always `main` |
| `model` | `string` | no | `""` | passed to the CLI as --model, which is the flag it accepts |
| `models` | `string[]` | no | `[]` | the model tiers to offer the relay, cheapest first. One agent is contributed per tier, named `claude:<model>`. Empty means a single agent using `model` |
| `reviewerHints` | `record` | no | `{}` | guidance appended when answering a particular reviewer, by host login |
| `timeoutMs` | `number` | no | `1800000` | how long one agent call may run before it is given up on |

### `@amy/plugin-codex`

The codex CLI as the agent, over its JSONL event stream.

|  |  |
| :-- | :-- |
| Source | `plugins/codex` |
| Mounts | _nothing_ |
| Contributes | `agent:codex`, `harness:codex` |
| Needs in the environment | _nothing_ |
| Depends on | `@amy/agent-kit`, `@amy/core`, `@amy/model-specs` |

```yaml
plugins:
  "@amy/plugin-codex":
    defaultBranch: main
    model: ""
    models: []
    reviewerHints: {}
    timeoutMs: 1800000
```

| Setting | Type | Required | Default | What it is |
| :-- | :-- | :-- | :-- | :-- |
| `defaultBranch` | `string` | no | `main` | the branch new work is cut from, which is not always `main` |
| `model` | `string` | no | `""` | passed to the CLI as --model. Empty leaves the choice to codex |
| `models` | `string[]` | no | `[]` | the model tiers to offer the relay, cheapest first. One agent is contributed per tier, named `codex:<model>`. Empty means a single agent named `codex` |
| `reviewerHints` | `record` | no | `{}` | guidance appended when answering a particular reviewer, by host login |
| `timeoutMs` | `number` | no | `1800000` | how long one agent call may run before it is given up on |

### `@amy/plugin-command`

Any command line tool, reached by a name the config allows.

|  |  |
| :-- | :-- |
| Source | `plugins/command` |
| Mounts | `commands` |
| Contributes | _nothing_ |
| Needs in the environment | _nothing_ |
| Depends on | `@amy/core` |

```yaml
plugins:
  "@amy/plugin-command":
    allow: {}
    cwd: ""
    timeoutMs: 300000
```

| Setting | Type | Required | Default | What it is |
| :-- | :-- | :-- | :-- | :-- |
| `allow` | `record` | **yes** |  | the commands a workflow may run, by name. The name is what a workflow asks for; the value is the command line it stands for, and this is the only place one is written |
| `cwd` | `string` | no | `""` | where a command runs when it does not say, defaulting to the state directory |
| `timeoutMs` | `number` | no | `300000` | how long one command may run before it is given up on |

### `@amy/plugin-command-gate`

A gate that runs the target repository's own commands.

|  |  |
| :-- | :-- |
| Source | `plugins/command-gate` |
| Mounts | `gate` |
| Contributes | _nothing_ |
| Needs in the environment | _nothing_ |
| Depends on | `@amy/core`, `@amy/workflow-ticket-to-qa` |

```yaml
plugins:
  "@amy/plugin-command-gate":
    commands: {}
    defaultBranch: main
    timeoutMs: 1800000
```

| Setting | Type | Required | Default | What it is |
| :-- | :-- | :-- | :-- | :-- |
| `commands` | `record` | **yes** |  | the check commands per repository, with a `default` fallback |
| `defaultBranch` | `string` | no | `main` | the branch new work is cut from, which is not always `main` |
| `timeoutMs` | `number` | no | `1800000` | how long one check may run before it is given up on |

### `@amy/plugin-file-notes`

Friction as a directory of notes: written by hand, by a hook, or by a tick that failed.

|  |  |
| :-- | :-- |
| Source | `plugins/file-notes` |
| Mounts | `notes` |
| Contributes | _nothing_ |
| Needs in the environment | _nothing_ |
| Depends on | `@amy/core`, `@amy/plugin-notify-fanout` |

```yaml
plugins:
  "@amy/plugin-file-notes":
    directory: notes
    repo: ""
    writeFailureNotes: true
```

| Setting | Type | Required | Default | What it is |
| :-- | :-- | :-- | :-- | :-- |
| `directory` | `string` | no | `notes` | where the notes are watched for, relative to the state directory |
| `repo` | `string` | no | `""` | the repository a note is about when it does not say, which is also the one this machine's own failures are filed against |
| `writeFailureNotes` | `boolean` | no | `true` | whether a tick this machine gave up on leaves a note behind, so the thing that broke becomes the thing that gets fixed |

### `@amy/plugin-file-queue`

A queue kept as one file per item, claimed by rename.

|  |  |
| :-- | :-- |
| Source | `plugins/file-queue` |
| Mounts | `queue` |
| Contributes | _nothing_ |
| Needs in the environment | _nothing_ |
| Depends on | `@amy/core` |

```yaml
plugins:
  "@amy/plugin-file-queue":
    directory: queue
    retentionDays: 7
    staleClaimMs: 1800000
```

| Setting | Type | Required | Default | What it is |
| :-- | :-- | :-- | :-- | :-- |
| `directory` | `string` | no | `queue` | where the queue is kept, relative to the state directory. One per workflow, so two profiles under one `.amy` do not claim each other's work |
| `retentionDays` | `number` | no | `7` | how long a finished queue item is kept before it is pruned |
| `staleClaimMs` | `number` | no | `1800000` | how long a claimed item may sit before it counts as abandoned |

### `@amy/plugin-file-store`

Work records kept as one file per item.

|  |  |
| :-- | :-- |
| Source | `plugins/file-store` |
| Mounts | `store` |
| Contributes | _nothing_ |
| Needs in the environment | _nothing_ |
| Depends on | `@amy/core` |

```yaml
plugins:
  "@amy/plugin-file-store":
    directory: tickets
```

| Setting | Type | Required | Default | What it is |
| :-- | :-- | :-- | :-- | :-- |
| `directory` | `string` | no | `tickets` | where the records are kept, relative to the state directory. One per workflow, so two profiles under one `.amy` do not read each other's work |

### `@amy/plugin-file-tasks`

Tasks as a directory of files: written by `amy btw`, by an editor, or by a hook.

|  |  |
| :-- | :-- |
| Source | `plugins/file-tasks` |
| Mounts | `tasks` |
| Contributes | _nothing_ |
| Needs in the environment | _nothing_ |
| Depends on | `@amy/core` |

```yaml
plugins:
  "@amy/plugin-file-tasks":
    directory: tasks
    repo: ""
```

| Setting | Type | Required | Default | What it is |
| :-- | :-- | :-- | :-- | :-- |
| `directory` | `string` | no | `tasks` | where the tasks are kept, relative to the state directory |
| `repo` | `string` | no | `""` | what a task is about when it does not say |

### `@amy/plugin-github`

GitHub as the code host, through the gh CLI.

|  |  |
| :-- | :-- |
| Source | `plugins/github` |
| Mounts | `code-host` |
| Contributes | _nothing_ |
| Needs in the environment | _nothing_ |
| Depends on | `@amy/core` |

This plugin declares no settings, so the config must not give it any.

### `@amy/plugin-hermes-agent`

Hermes as the agent, over its one-shot mode and usage report.

|  |  |
| :-- | :-- |
| Source | `plugins/hermes-agent` |
| Mounts | _nothing_ |
| Contributes | `agent:hermes`, `harness:hermes` |
| Needs in the environment | _nothing_ |
| Depends on | `@amy/agent-kit`, `@amy/core`, `@amy/model-specs` |

```yaml
plugins:
  "@amy/plugin-hermes-agent":
    defaultBranch: main
    model: ""
    models: []
    reviewerHints: {}
    timeoutMs: 1800000
```

| Setting | Type | Required | Default | What it is |
| :-- | :-- | :-- | :-- | :-- |
| `defaultBranch` | `string` | no | `main` | the branch new work is cut from, which is not always `main` |
| `model` | `string` | no | `""` | passed to the CLI as --model. Empty leaves the choice to hermes |
| `models` | `string[]` | no | `[]` | the model tiers to offer the relay, cheapest first. One agent is contributed per tier, named `hermes:<model>`. Empty means a single agent named `hermes` |
| `reviewerHints` | `record` | no | `{}` | guidance appended when answering a particular reviewer, by host login |
| `timeoutMs` | `number` | no | `1800000` | how long one agent call may run before it is given up on |

### `@amy/plugin-linear`

Linear as the tracker, over its GraphQL API.

|  |  |
| :-- | :-- |
| Source | `plugins/linear` |
| Mounts | `tracker` |
| Contributes | `notify-channel:tracker` |
| Needs in the environment | `LINEAR_API_KEY` |
| Depends on | `@amy/core`, `@amy/plugin-notify-fanout`, `@amy/workflow-ticket-to-qa` |

```yaml
plugins:
  "@amy/plugin-linear":
    defaultRepo: ""
    endpoint: https://api.linear.app/graphql
    repoByTeam: {}
    workingStatusName: …
```

| Setting | Type | Required | Default | What it is |
| :-- | :-- | :-- | :-- | :-- |
| `defaultRepo` | `string` | no | `""` | the repository used for a team that is not in repoByTeam |
| `endpoint` | `string` | no | `https://api.linear.app/graphql` | the GraphQL endpoint to talk to. Linear's own by default, and the one thing that has to move for a stand-in tracker to take its place in an end-to-end run |
| `repoByTeam` | `record` | no | `{}` | which repository a team's tickets land in, by team key |
| `workingStatusName` | `string` | **yes** |  | the exact status name a ticket must be in to be picked up |

### `@amy/plugin-notify-fanout`

Sends one announcement down every configured channel, and keeps going when one is down.

|  |  |
| :-- | :-- |
| Source | `plugins/notify-fanout` |
| Mounts | `notifier` |
| Contributes | _nothing_ |
| Needs in the environment | _nothing_ |
| Depends on | `@amy/core` |

This plugin declares no settings, so the config must not give it any.

### `@amy/plugin-notify-hermes`

Announcements over Hermes, which already owns the messaging credentials.

|  |  |
| :-- | :-- |
| Source | `plugins/notify-hermes` |
| Mounts | _nothing_ |
| Contributes | `notify-channel:hermes` |
| Needs in the environment | _nothing_ |
| Depends on | `@amy/core`, `@amy/plugin-notify-fanout` |

```yaml
plugins:
  "@amy/plugin-notify-hermes":
    target: …
```

| Setting | Type | Required | Default | What it is |
| :-- | :-- | :-- | :-- | :-- |
| `target` | `string` | **yes** |  | a Hermes delivery target, such as `slack:my-channel` or a bare platform name for its home channel |

### `@amy/plugin-notify-inbox`

Announcements as a file on disk plus a desktop notification.

|  |  |
| :-- | :-- |
| Source | `plugins/notify-inbox` |
| Mounts | _nothing_ |
| Contributes | `notify-channel:inbox` |
| Needs in the environment | _nothing_ |
| Depends on | `@amy/core`, `@amy/plugin-notify-fanout` |

```yaml
plugins:
  "@amy/plugin-notify-inbox":
    directory: needs-input
```

| Setting | Type | Required | Default | What it is |
| :-- | :-- | :-- | :-- | :-- |
| `directory` | `string` | no | `needs-input` | where the questions are left, relative to the workspace |

### `@amy/plugin-plan-check`

The quality bar for a drafted plan: the repository's own check, run in its checkout.

|  |  |
| :-- | :-- |
| Source | `plugins/plan-check` |
| Mounts | `plan-check` |
| Contributes | _nothing_ |
| Needs in the environment | _nothing_ |
| Depends on | `@amy/core`, `@amy/workflow-note-to-plan` |

```yaml
plugins:
  "@amy/plugin-plan-check":
    commands: 
      default:
        - sf check
    defaultBranch: main
    timeoutMs: 600000
```

| Setting | Type | Required | Default | What it is |
| :-- | :-- | :-- | :-- | :-- |
| `commands` | `record` | no | `{"default":["sf check"]}` | the check commands per repository, with a `default` fallback. `sf check` is the whole quality bar in a repository that has one |
| `defaultBranch` | `string` | no | `main` | the branch a plan branch is cut from, which is not always `main` |
| `timeoutMs` | `number` | no | `600000` | how long one check may run before it is given up on |

### `@amy/plugin-serial-engine`

Advances one work item by one move per tick.

|  |  |
| :-- | :-- |
| Source | `plugins/serial-engine` |
| Mounts | the engine |
| Contributes | _nothing_ |
| Needs in the environment | _nothing_ |
| Depends on | `@amy/core`, `@amy/workflow-ticket-to-qa` |

```yaml
plugins:
  "@amy/plugin-serial-engine":
    maxItemAttempts: 5
    retentionDays: 7
    retryDelayMs: 300000
    staleClaimMs: 1800000
```

| Setting | Type | Required | Default | What it is |
| :-- | :-- | :-- | :-- | :-- |
| `maxItemAttempts` | `number` | no | `5` | how many times one item may fail before the operator is told and it is dropped |
| `retentionDays` | `number` | no | `7` | how long a finished queue item is kept before it is pruned |
| `retryDelayMs` | `number` | no | `300000` | how long a failed item is held before it is looked at again |
| `staleClaimMs` | `number` | no | `1800000` | how long a claimed item may sit before it counts as abandoned |

<!-- amy:end plugin-settings -->

## Collections

<!-- amy:generated collections -->

| Collection | Contributed to by | Read by |
| :-- | :-- | :-- |
| `agent` | `claude` — `@amy/plugin-claude`<br>`codex` — `@amy/plugin-codex`<br>`hermes` — `@amy/plugin-hermes-agent` | `@amy/agent-kit` |
| `harness` | `claude` — `@amy/plugin-claude`<br>`codex` — `@amy/plugin-codex`<br>`hermes` — `@amy/plugin-hermes-agent` | `@amy/agent-kit` |
| `notify-channel` | `hermes` — `@amy/plugin-notify-hermes`<br>`inbox` — `@amy/plugin-notify-inbox`<br>`tracker` — `@amy/plugin-linear` | _whichever plugin reads it_ |
| `workflow-runtime` | `errand` — `@amy/workflow-errand`<br>`note-to-plan` — `@amy/workflow-note-to-plan`<br>`ticket-to-qa` — `@amy/workflow-ticket-to-qa` | `@amy/agent-kit` |

<!-- amy:end collections -->
