# @amykit/core

The kernel every workflow and plugin is written against. It knows no domain.

To this package a state is a `string` and an action is an open name. It cannot
tell a ticket from a deploy: a workflow is the order in which actions happen,
so a second workflow reuses `implement` rather than dragging a whole domain
along with it.

## What it exports

- **Declaring:** `defineWorkflow` (with `act`, `advance`, `wait`, `settled`,
  `port`, `optional`, `call` and `notWritten`) and `definePlugin`, whose
  config is typed by its schema. Why: [a workflow is one
  declaration](../../docs/design/a-workflow-is-one-declaration.md), [a config
  is typed by its schema](../../docs/design/a-config-is-typed-by-its-schema.md).
- **The diagram:** `readDiagram`, `withDiagram` and `withDiagramBeside`, which
  read the states from a `workflow.mmd`.
- **Mounting:** `mount`, `unmetNeeds` and `validateConfig`, which assemble the
  plugins once and refuse what cannot run. Why: [a mount builds
  once](../../docs/design/a-mount-builds-once.md).
- **The ports:** the types every adapter implements (`Tracker`, `CodeHost`,
  `Harness`, `Notifier`, `Conversation`, `Store`, `Queue`, `BriefStore`,
  `Worktree`, `EventLog` and more), and `Git` with the checkouts the host
  lends. Why: [the ports belong to the
  core](../../docs/design/the-ports-belong-to-the-core.md).
- **Actions:** `CORE_ACTIONS`, the catalogue of actions and the port each one
  dispatches to, and `runAction`.
- **Operations:** `defineOperation` and `defineContract`, how a plugin offers
  typed operations the host serves and documents as OpenAPI. Why: [amy speaks
  in domains](../../docs/design/amy-speaks-in-domains.md).
- **Process infrastructure:** `NodeCommandRunner`, `FileStopSwitch`, leases,
  budgets, the event contract, and `takeLock`, the one process lock the daemon,
  the chat and the proof all take. Why: [a lock is taken one
  way](../../docs/design/a-lock-is-taken-one-way.md).

`src/index.ts` is the whole list.

## What it refuses, and when

Everything at mount, by name, before a ticket is touched:

- a setting that is not one the plugin declared, because that is a typo and
  ignoring it means the setting never applied
- a port, action or observation claimed by more than one plugin
- an action a workflow emits that nothing can run

## The rule that holds this together

`L0.CORE_STAYS_IGNORANT`, a local rule in
[`.software-factory/rules/`](../../.software-factory/rules/core-stays-ignorant.yaml):
nothing under `src/` may import an `@amykit/workflow-*` or `@amykit/plugin-*`
package. One such import and the core learns a domain, and every workflow
after the first becomes a fork. `sf verify` proves the rule still fires. More
in [Plugins](../../docs/concepts/plugins.md) and [Ports](../../docs/concepts/ports.md).
