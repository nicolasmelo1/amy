# pull-request

This workflow opens a pull request for a branch another workflow prepared, and hands back the pull request or the code host's reason there is none.

Several workflows end the same way, so they all call this one, the way code
calls a function. You never add it as a profile or `amy tick` it. A workflow
such as [errand](../workflow-errand) or [note-to-plan](../workflow-note-to-plan)
reaches a state drawn as a call, hands over the repository and the branch, and
leaves on the end this one reached. Why: [a workflow calls
another](../../docs/design/a-workflow-calls-another.md).

## How it moves

```text
OPENING ──> OPENED    the code host has a pull request on the branch
   └──────> REFUSED   the code host answered that it will not open one
```

- **OPENING** asks the code host to open the pull request, then looks again
  until it shows up.
- **OPENED** hands back the number and the link.
- **REFUSED** hands back the code host's reason, and the caller decides.

Review, merge and anything after belong to the caller. It needs a code host,
such as `@amykit/plugin-github`; it never names GitHub itself, so any code
host plugin works.

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

- [Writing a workflow](https://github.com/nicolasmelo1/amy/tree/main/docs/guides/write-a-workflow.md)
- [Reference: workflows](https://github.com/nicolasmelo1/amy/tree/main/docs/reference/workflows.md)
- [Ports and the registry](https://github.com/nicolasmelo1/amy/tree/main/docs/concepts/ports.md)

## Licence

MIT

<!-- amy:end reference -->
