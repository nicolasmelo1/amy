# errand

**Say something in passing, and it gets done.**

You are in the middle of something and notice a small chore: the dependencies
in the API are stale, a README has a typo, somebody should check whether a
monitor still fires. Opening a ticket for it costs more than the chore itself,
so it usually gets forgotten.

With this workflow you type one line and go back to what you were doing:

```sh
amy btw "bump the deps in the api"
```

amy hands the chore to an agent (Claude Code, Codex, or whichever one you
mounted). If the agent changed code, amy opens a **draft** pull request for you
to look at when you have time. If it was a question, you get the answer. Either
way, you are told what happened.

## How it moves

```text
QUEUED ──> WORKING ──> PR_OPEN ──> DONE
  │           │            └─────> DECLINED   the code host refused the pull request
  │           ├──────────────────> DONE       it was a question, and it has an answer
  │           └──────────────────> DECLINED   refused, or not done in the attempts allowed
  └──────────────────────────────> DECLINED   not a repository amy works in
```

1. **QUEUED.** The chore waits on the queue. It also waits here while too many
   errands are already open, so you never end up with a pile of pull requests
   nobody asked to review.
2. **WORKING.** An agent does the chore in its own copy of the repository.
3. **PR_OPEN.** If something changed, the [pull-request](../workflow-pull-request)
   workflow opens a draft pull request.
4. **DONE** or **DECLINED.** A chore amy cannot do is handed back to you, never
   guessed at.

Nothing in this workflow waits on a person. If a chore needs one, it should
have been a ticket.

## What it needs

- **A place for the chores**, `@amykit/plugin-file-tasks`, which is what
  `amy btw` writes into.
- **An agent** to do the chore, like `@amykit/plugin-claude`.
- **A code host** to open the pull request, like `@amykit/plugin-github`.
- **A notifier** to tell you how it went, like `@amykit/plugin-slack` or
  `@amykit/plugin-telegram`.

`amy add` installs these for you, and `amy doctor` tells you what is still
missing.

## Try it

```sh
amy add @amykit/workflow-errand
amy doctor
amy btw "fix the typo in the api README"
amy tick        # one move at a time, so you can watch it
amy status
```

Only repositories listed in `repos` can receive an errand. Anything else is
handed back to you.

<!-- amy:generated reference -->

## Install

```sh
# Add @amykit/workflow-errand to amy.yaml, then install configured plugins:
amy init --install
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

- [Writing a workflow](https://github.com/nicolasmelo1/amy/tree/main/docs/build/write-a-workflow.md)
- [Reference: workflows](https://github.com/nicolasmelo1/amy/tree/main/docs/reference/workflows.md)
- [Ports and the registry](https://github.com/nicolasmelo1/amy/tree/main/docs/concepts/ports.md)

## Licence

MIT

<!-- amy:end reference -->
