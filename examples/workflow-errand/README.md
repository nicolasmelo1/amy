# errand

This workflow takes a chore you mention in passing and has an agent do it, opening a draft pull request or answering you.

You notice something small mid-task: stale dependencies, a typo, a monitor
nobody checked. A ticket costs more than the chore, so you type one line and
go back to what you were doing:

```sh
amy btw "bump the deps in the api"
```

The agent you mounted does the chore in its own copy of the repository. If it
changed code, amy opens a **draft** pull request. If it was a question, you get
the answer. Either way, you are told what happened.

## How it moves

```text
QUEUED ──> WORKING ──> PR_OPEN ──> DONE
  │           │            └─────> DECLINED   the code host refused the pull request
  │           ├──────────────────> DONE       it was a question, and it has an answer
  │           └──────────────────> DECLINED   refused, or not done in the attempts allowed
  └──────────────────────────────> DECLINED   not a repository amy works in
```

- **QUEUED** also waits while the ceiling on open errands is reached, so pull
  requests nobody asked for do not pile up.
- **PR_OPEN** calls the [pull-request](../workflow-pull-request) workflow.
- **DECLINED** hands the chore back to you instead of guessing.

Nothing here waits on a person. A chore that needs one should have been a
ticket.

## Try it

```sh
amy add @amykit/workflow-errand
amy doctor        # names what is still missing
amy btw "fix the typo in the api README"
amy tick          # one move at a time, so you can watch it
```

It needs `@amykit/plugin-file-tasks` (where `amy btw` writes), an agent such as
`@amykit/plugin-claude`, a code host such as `@amykit/plugin-github`, and a
notifier such as `@amykit/plugin-slack`. Only repositories listed in `repos`
receive an errand. How it is proven: [the errand is proven end to
end](../../docs/design/the-errand-is-proven-end-to-end.md).

<!-- amy:generated reference -->

## Install

```sh
amy add @amykit/workflow-errand
```

Then name it in `~/.amy/config.yaml`:

```yaml
workflows:
  errand:
    workflow: "@amykit/workflow-errand"
```

## The lifecycle

| State | Kind |
| :-- | :-- |
| `QUEUED` | initial, waiting |
| `WORKING` | working |
| `PR_OPEN` | working |
| `DONE` | terminal |
| `DECLINED` | terminal |

It emits `announce`, `open-pull-request` and `run-errand`.

## Configuration

```yaml
plugins:
  "@amykit/workflow-errand":
    baseBranch: {}
    defaultBranch: "main"
    policy:
      ceilingBackoffMs: 1800000
      maxAttempts: 2
      maxInFlight: 3
    queueDirectory: "queue"
    repos: []
    tasksDirectory: "tasks"
```

| Setting | Type | Required | Default | What it is |
| :-- | :-- | :-- | :-- | :-- |
| `baseBranch` | `record` | no | `{}` | where one repository's base branch is, instead of the fallback. A repository named here has its work cut from, and its pull requests opened against, that branch |
| `defaultBranch` | `string` | no | `main` | the branch new work is cut from, for a repository that named none, which is not always `main` |
| `policy.ceilingBackoffMs` | `number` | no | `1800000` | how long a task is held while the in-flight ceiling is reached |
| `policy.maxAttempts` | `number` | no | `2` | how many times an agent may try one errand before it is handed back |
| `policy.maxInFlight` | `number` | no | `3` | how many errands this machine may carry in flight at once. Capturing costs nothing, which is the whole point and also the failure, and past this many it holds rather than opening another pull request nobody asked to review |
| `queueDirectory` | `string` | no | `queue` | where this machine keeps the queue `amy btw` puts the task on, relative to the state root. The host sets it; a value here only stands in for one |
| `repos` | `string[]` | no | `[]` | where an errand may be done. The machine's own list of repositories names this by default, and a profile narrows or widens it. An errand about a place not on the list is handed back to whoever asked |
| `tasksDirectory` | `string` | no | `tasks` | where this machine keeps the tasks `amy btw` writes, relative to the state root. The host sets it; a value here only stands in for one |

Every field is checked at boot against the schema this package declares. A key that is
not one of the above is a refusal naming the plugin and the key, not a setting that
silently never applied.

## What it brings

| Command | What it does |
| :-- | :-- |
| `amy btw` | Something to do, said in passing. Goes on the queue, never becomes a ticket |

Typed on a machine that mounted this package, and unknown on one that did not.

## Where the reasoning is

- [Writing a workflow](https://github.com/nicolasmelo1/amy/tree/main/docs/guides/write-a-workflow.md)
- [Reference: workflows](https://github.com/nicolasmelo1/amy/tree/main/docs/reference/workflows.md)
- [Ports and the registry](https://github.com/nicolasmelo1/amy/tree/main/docs/concepts/ports.md)

## Licence

MIT

<!-- amy:end reference -->
