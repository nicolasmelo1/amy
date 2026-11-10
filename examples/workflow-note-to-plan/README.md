# note-to-plan

This workflow turns a note about something that got in your way into a checked plan, opened as a pull request in the repository the note is about.

A flaky retry, a confusing command, a step you always forget: you notice it
and move on, and a week later nobody remembers. Write it down in one line:

```sh
amy note "the relay retries a harness that already said it was out of quota"
```

An agent drafts a **plan** in that repository: what is wrong and what should
change. The repository's own checks read it before anybody does, then amy opens
a pull request. Fixing the problem stays somebody's decision. Why: [friction
becomes a plan](../../docs/design/friction-becomes-a-plan.md).

## How it moves

```text
NOTED ──> DRAFTED ──> CHECKED ──> PR_OPEN ──> DONE
  │          │  ^          │          └─────> DECLINED   the code host refused the pull request
  │          │  └──────────┘  the check is red, so the agent drafts again
  │          └──────────────────────────────> DECLINED   no good draft in the attempts allowed
  └─────────────────────────────────────────> DECLINED   not a repository amy writes into
```

- **NOTED** also waits while the ceiling on open plans is reached.
- **CHECKED** sends a red plan back to the agent and moves a green one on.
- **PR_OPEN** calls the [pull-request](../workflow-pull-request) workflow.
  Merging is a person's choice, so the workflow ends once the pull request
  exists.

## Try it

```sh
amy add @amykit/workflow-note-to-plan
amy doctor        # names what is still missing
amy note "amy doctor does not say which repository is missing"
amy tick          # one move at a time, so you can watch it
```

It needs an agent such as `@amykit/plugin-claude`, `@amykit/plugin-file-notes`
(where `amy note` writes), `@amykit/plugin-plan-check` (which runs the commands
in `check`, by default `sf check`), a code host such as `@amykit/plugin-github`,
and a notifier. `repos` lists the repositories a plan may be written into; a
note about anything else is handed back to you.

<!-- amy:generated reference -->

## Install

```sh
amy add @amykit/workflow-note-to-plan
```

Then name it in `~/.amy/config.yaml`:

```yaml
workflows:
  note-to-plan:
    workflow: "@amykit/workflow-note-to-plan"
```

## The lifecycle

| State | Kind |
| :-- | :-- |
| `NOTED` | initial, waiting |
| `DRAFTED` | working |
| `CHECKED` | working |
| `PR_OPEN` | working |
| `DONE` | terminal |
| `DECLINED` | terminal |

It emits `announce`, `check-plan`, `draft-plan` and `open-pull-request`.

## Configuration

```yaml
plugins:
  "@amykit/workflow-note-to-plan":
    baseBranch: {}
    check: {"default":["sf check"]}
    defaultBranch: "main"
    notesDirectory: "notes"
    policy:
      ceilingBackoffMs: 3600000
      maxDraftAttempts: 3
      maxOpenPlansPerRepo: 2
    queueDirectory: "queue"
    repos: <string[]>
```

| Setting | Type | Required | Default | What it is |
| :-- | :-- | :-- | :-- | :-- |
| `baseBranch` | `record` | no | `{}` | where one repository's base branch is, instead of the fallback. A repository named here has its work cut from, and its pull requests opened against, that branch |
| `check` | `record` | no | `{"default":["sf check"]}` | the check commands per repository, with a `default` fallback, that judge a plan before it goes anywhere. `sf check` is the whole quality bar in a repository that has one; the plan-check plugin mounts them |
| `defaultBranch` | `string` | no | `main` | the branch new work is cut from, for a repository that named none, which is not always `main` |
| `notesDirectory` | `string` | no | `notes` | where this machine keeps the notes `amy note` writes, relative to the state root. The host sets it; a value here only stands in for one |
| `policy.ceilingBackoffMs` | `number` | no | `3600000` | how long a note is held while the plan ceiling is reached |
| `policy.maxDraftAttempts` | `number` | no | `3` | how many times an agent may try to write a plan the check accepts before it is handed back |
| `policy.maxOpenPlansPerRepo` | `number` | no | `2` | how many plans this machine may carry in flight for one repository. A machine that files twelve plans a day into three repositories is producing a backlog with a robot's name on it, and past this many it holds |
| `queueDirectory` | `string` | no | `queue` | where this machine keeps the queue `amy note` puts the note on, relative to the state root. The host sets it; a value here only stands in for one |
| `repos` | `string[]` | **yes** |  | the repositories a plan may be written into. A note about anything else is handed back to the operator |

Every field is checked at boot against the schema this package declares. A key that is
not one of the above is a refusal naming the plugin and the key, not a setting that
silently never applied.

## What it brings

| Command | What it does |
| :-- | :-- |
| `amy note` | Write a piece of friction down, and put it on the queue |

Typed on a machine that mounted this package, and unknown on one that did not.

## Where the reasoning is

- [Writing a workflow](https://github.com/nicolasmelo1/amy/tree/main/docs/guides/write-a-workflow.md)
- [Reference: workflows](https://github.com/nicolasmelo1/amy/tree/main/docs/reference/workflows.md)
- [Ports and the registry](https://github.com/nicolasmelo1/amy/tree/main/docs/concepts/ports.md)

## Licence

MIT

<!-- amy:end reference -->
