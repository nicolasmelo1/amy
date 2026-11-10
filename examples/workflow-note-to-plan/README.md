# note-to-plan

**Write down what got in your way, and get back a plan to fix it.**

Every day something slows you down: a flaky retry, a confusing command, a step
you always forget. You notice it, sigh, and move on. A week later nobody
remembers it happened.

With this workflow you write the friction down in one line:

```sh
amy note "the relay retries a harness that already said it was out of quota"
```

amy asks an agent to turn that note into a **plan**: a short document, inside
the repository the friction is about, that says what is wrong and what should
change. Before anybody sees it, the plan is checked by the repository's own
checks. Then amy opens a pull request with it. Fixing the problem is still
somebody's decision; this workflow makes sure it is written down where that
decision gets made.

## How it moves

```text
NOTED ──> DRAFTED ──> CHECKED ──> PR_OPEN ──> DONE
  │          │  ^          │          └─────> DECLINED   the code host refused the pull request
  │          │  └──────────┘  the check is red, so the agent drafts again
  │          └──────────────────────────────> DECLINED   no good draft in the attempts allowed
  └─────────────────────────────────────────> DECLINED   not a repository amy writes into
```

1. **NOTED.** The note waits on the queue. It also waits while a repository
   already has too many plans open, so nobody gets a backlog of robot plans.
2. **DRAFTED.** An agent writes the plan into a branch of the repository.
3. **CHECKED.** The repository's checks read the plan. Red sends it back to the
   agent, green moves it on.
4. **PR_OPEN.** The [pull-request](../workflow-pull-request) workflow opens a
   pull request with the plan.
5. **DONE** or **DECLINED.** Merging the plan is a person's choice, so the
   workflow ends as soon as the pull request exists.

## What it needs

- **An agent** to draft the plan, like `@amykit/plugin-claude`.
- **A place for notes**, `@amykit/plugin-file-notes`, which is what `amy note`
  writes into.
- **A plan check**, `@amykit/plugin-plan-check`, which runs the commands in
  `check` (by default `sf check`).
- **A code host** to open the pull request, like `@amykit/plugin-github`.
- **A notifier** to tell you how it went, like `@amykit/plugin-slack`.

`amy add` installs these for you, and `amy doctor` tells you what is still
missing.

## Try it

```sh
amy add @amykit/workflow-note-to-plan
amy doctor
amy note "amy doctor does not say which repository is missing"
amy tick        # one move at a time, so you can watch it
amy status
```

`repos` is required: it is the list of repositories a plan may be written into.
A note about anything else is handed back to you.

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

- [Writing a workflow](https://github.com/nicolasmelo1/amy/tree/main/docs/build/write-a-workflow.md)
- [Reference: workflows](https://github.com/nicolasmelo1/amy/tree/main/docs/reference/workflows.md)
- [Ports and the registry](https://github.com/nicolasmelo1/amy/tree/main/docs/concepts/ports.md)

## Licence

MIT

<!-- amy:end reference -->
