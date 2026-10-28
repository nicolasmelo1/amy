# The README counts nothing by hand

The README says that half of `docs/` is generated from the code and that
`npm run gate` goes red when the two disagree. The README itself is not in that
half, and it has drifted on every fact it states by hand:

| The README says | The code says |
| :-- | :-- |
| **33 rules**, and `sf verify` proves every one fires | 47 enabled in `.software-factory/policy.yaml` |
| **Ten gates** each pin a claim to a scenario | 18 gates in the same file |
| The commands table, sixteen rows | `docs/reference/cli.md` also has `add`, `remove`, `update`, `brief`, `poke`, `worktrees` and `daemon`, none of them in the table |
| The core's actions: eleven, in the diagram | `CORE_ACTIONS` has more — `run-errand`, `self-review`, `acquire-worktree`, `resolve-review-thread`, `discuss`, `hand-over` are missing from it |
| The core's ports: `Queue, Store, Notifier, EventLog, Budget, StopSwitch, CodeHost, Harness` | the generated table in `docs/concepts/ports.md` has eighteen kinds, and `agent`, `tracker`, `gate`, `conversation` and `worktree` are not on the README's line |
| `amy init` — "Write the config and roster templates" | the README's own install section, ten lines above, says it also installs the packages the config needs |
| Node 24+, on the badge | [Write a workflow](../docs/build/write-a-workflow.md) says Node 22.18 or later |

None of these is a big error. Every one of them is the first page somebody
reads, telling them something that stopped being true, about the one project
whose pitch is that what it says is checked.

## What changes

Every fact on the README that can be counted or listed is either generated, by
the same `amy:generated` markers and the same `npm run docs:check` the rest of
`docs/` already uses, or it is deleted and linked to the page that is generated:

- the rule count and the gate count, generated;
- the commands table, generated from the CLI, short form only, linking to
  `docs/reference/cli.md` for the rest;
- the action and port lists in the architecture diagram, removed from the
  diagram — it shows the shape, and links to [Actions](../docs/concepts/actions.md)
  and [Ports](../docs/concepts/ports.md) for the lists;
- the Node version, one source, read by the badge and by every page that states
  it.

And the README gets shorter. It is the pitch, the install, the one idea and
the links; everything below that is already a page in `docs/` and is linked
rather than retold.

This comes before the rest of the documentation work because it depends on
nothing: none of these facts changes with the contract.

## Acceptance criteria

- [ ] Every count and every list on the README is between generated markers,
      and `npm run docs:check` goes red when one disagrees with the code
      (proof: deferred:test:scripts/docs/tests/readme.test.ts)
- [ ] Adding a command to the CLI without regenerating turns `npm run gate`
      red naming the README
      (proof: deferred:test:scripts/docs/tests/readme.test.ts)
- [ ] The Node version is stated in one place and read everywhere else
      (proof: deferred:test:scripts/docs/tests/readme.test.ts)

**Exit condition:** every number and every list on the README is generated,
and the README is shorter than it is today.
