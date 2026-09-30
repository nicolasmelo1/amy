# A project is three phases, and amy reads them

A machine that drives work needs three things: decide what the work is, do it,
show it holds. amy is the middle one.

## The contract

```
my-project/
  brief/        the grooming lifecycle: what the work is
  workflow/     the execution lifecycle: doing it
  test/         the proving lifecycle: showing it holds
```

A configured workflow whose filesystem spec ends in one of those directories is
a project phase. The parent directory is the project identity; there is no new
project schema and a workflow-only profile remains a normal configured profile.

## The delivery

Phase profiles derive their records, queues, event logs and daemon records under
one path-safe project state key. The log is the relay's budget ledger, so phases
spend independently. The host supplies one project artifact root alongside
phase-local state. The file brief provider uses that root when it exists, which
makes the same brief visible to grooming, execution and proving without either
profile naming another profile's state directory or using `..`.

A profile can override agent models, ladders and budget. The same merged values
reach the relay and harnesses, so grooming can use an expensive planning model
while execution uses a cheap continuous one.

Core sees neither phase names nor brief content. It only accepts an optional
artifact root and an optional host requirement that one workflow be mounted.
That opt-in requirement refuses a phase whose module exports no workflow while
leaving generic plugin-only mounts valid.

## Acceptance

- [x] A project laid out with the three directories has phase-local queues,
      records, logs, daemon identities and budgets
      (proof: test:packages/cli/tests/project.test.ts)
- [x] A project with only `workflow/` needs no new configuration key
      (proof: test:packages/cli/tests/project.test.ts)
- [x] A brief written at the project artifact root is read by another phase,
      without shared config paths or a profile state escape
      (proof: test:plugins/file-brief-store/tests/FileBriefStore.test.ts)
- [x] A phase host refuses a module that exports no workflow, naming its
      directory (proof: test:packages/core/tests/mount.test.ts)
- [x] The core preserves nonsensical brief sections without interpreting them
      as a workflow schema (proof: test:packages/core/tests/Brief.test.ts)
