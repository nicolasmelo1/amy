# pull-request

**A small workflow that other workflows use to open a pull request.**

Several workflows end the same way: some work is ready on a branch, and it
needs a pull request. Instead of each one doing that on its own, they all call
this workflow. That makes it a good first example of one workflow **calling**
another, like a function call.

You never run it by itself. You do not add it as a profile and you never
`amy tick` it. A workflow such as [errand](../workflow-errand) or
[note-to-plan](../workflow-note-to-plan) reaches a state that says "open the
pull request", hands this workflow the repository and the branch, and gets
back either the pull request or the reason there is none.

## How it moves

```text
OPENING ──> OPENED    the code host has a pull request on the branch
   └──────> REFUSED   the code host answered that it will not open one
```

1. **OPENING.** It asks the code host to open the pull request, then looks
   again until the pull request shows up.
2. **OPENED.** It hands back the number and the link.
3. **REFUSED.** It hands back the code host's reason, and the caller decides
   what to do with it.

It ends as soon as the pull request exists. Review, merge and anything after
that belong to whoever called it.

## What it needs

- **A code host**, like `@amykit/plugin-github`. This workflow never names
  GitHub itself, so any code host plugin works.

<!-- amy:generated reference -->

## Calling it

It takes an input, so it is called from a state of another workflow rather than mounted
as a profile. Depend on it from the package that calls it, mark the state `call` in that
workflow's diagram, draw an edge out of it named for each end (`OPENED`, `REFUSED`), and bind it:

```ts
import { plugin as pullRequest } from "@amykit/workflow-pull-request";

calls: { STATE: call(pullRequest, { input: (work) => ({ /* … */ }) }) },
```

Its settings below are set per call site, with `config` on the binding.

## The lifecycle

| State | Kind |
| :-- | :-- |
| `OPENING` | initial |
| `OPENED` | terminal |
| `REFUSED` | terminal |

It emits `open-pull-request`.

## Configuration

```ts
call(pullRequest, { config: { draft: false, policy: { settleMs: 30000 } } })
```

| Setting | Type | Required | Default | What it is |
| :-- | :-- | :-- | :-- | :-- |
| `draft` | `boolean` | no | `false` | open the pull request as a draft, for work nobody is waiting on at the moment it lands |
| `policy.settleMs` | `number` | no | `30000` | how long to wait for a pull request the host opened to show, before looking again |

Every field is checked at boot against the schema this package declares. A key that is
not one of the above is a refusal naming the plugin and the key, not a setting that
silently never applied.

## Where the reasoning is

- [Writing a workflow](https://github.com/nicolasmelo1/amy/tree/main/docs/build/write-a-workflow.md)
- [Reference: workflows](https://github.com/nicolasmelo1/amy/tree/main/docs/reference/workflows.md)
- [Ports and the registry](https://github.com/nicolasmelo1/amy/tree/main/docs/concepts/ports.md)

## Licence

MIT

<!-- amy:end reference -->
