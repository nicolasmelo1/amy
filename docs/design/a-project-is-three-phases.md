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
a project phase, whether or not its siblings exist. The parent directory is the
project identity; there is no new project schema. A packaged workflow is not a
phase and keeps the layout it always had.

This is opinionated on purpose. Most processes fail by thinking about only one
of the three — only doing, or only proving — so a missing folder is a missing
part of the work, and amy says so rather than papering over it: without
`brief/`, `amy brief` names the folder a project would need instead of looking
for a brief nobody could have written. What `test/` drives is still open; the
slot exists so its absence is visible.

A lone `workflow/` used to stay an ordinary profile, so that an install which
never heard of phases would not move. That rule, and the promotion it forced
when a sibling appeared — keeping old records, copying old briefs from a store
every profile shared — cost more than it bought while the only install was the
author's and no brief had been written. It was dropped before release: a phase
never reads what an old profile of the same name left behind.

## The delivery

Phase profiles derive their records, queues, event logs and daemon records under
one path-safe project state key. The log is the relay's budget ledger, so phases
spend independently. The host supplies one project artifact root alongside
phase-local state. The file brief provider uses that root when it exists, which
makes the same brief visible to grooming, execution and proving without either
profile naming another profile's state directory or using `..`.

Plugin-owned state follows the phase the same way: `amy btw` tasks and the
Slack thread memory live under the phase key, so two phases mounting the same
adapter never drain or answer each other's work. The notes, the inbox, the
roster and the handbrake stay machine-wide on purpose, and `amy stop` signals
only the selected phase's daemon rather than pulling that shared handbrake.

`amy workflow rm` forgets a phase's records, queue, tasks and threads, and
never its log: the budget is measured off it.

A profile can override agent models, ladders and budget. The same merged values
reach the relay and harnesses, so grooming can use an expensive planning model
while execution uses a cheap continuous one.

Core sees neither phase names nor brief content. It only accepts an optional
artifact root and an optional host requirement that one workflow be mounted.
That opt-in requirement refuses a phase whose module exports no workflow while
leaving generic plugin-only mounts valid.

## Acceptance

- [x] A project laid out with the three directories mounts all three, and each
      is driven with its own queue, records, log, daemon identity, tasks and
      budget (proof: test:packages/cli/tests/project.test.ts)
      (proof: assertion:project.every_phase_mounts)
      (proof: assertion:project.each_phase_has_its_own_queue)
      (proof: assertion:project.each_phase_spends_its_own_budget)
      (proof: assertion:project.each_phase_is_its_own_daemon)
      (proof: assertion:project.each_phase_keeps_its_own_tasks)
- [x] Grooming and execution choose their own models and budgets
      (proof: assertion:project.grooming_and_execution_choose_their_own_models)
- [x] A lone `workflow/` is a phase with no new configuration key, and a
      packaged workflow keeps the layout it always had
      (proof: test:packages/cli/tests/project.test.ts)
      (proof: assertion:project.a_lone_workflow_is_a_phase)
      (proof: assertion:project.a_packaged_workflow_is_unchanged)
- [x] A project without `brief/` is told which folder it lacks when asked for
      a brief (proof: assertion:project.a_project_without_brief_keeps_no_briefs)
- [x] A brief written by one phase is read by another phase of the same
      project, with no shared directory named in config and no path escaping a
      profile's state
      (proof: assertion:project.a_brief_crosses_the_phase_boundary)
      (proof: assertion:project.no_config_names_a_shared_directory)
      (proof: assertion:project.no_phase_state_escapes_home)
- [x] A phase never reads the records an old profile of the same name left
      (proof: assertion:project.a_phase_never_reads_an_old_profiles_records)
- [x] A phase directory that exists but exports no workflow is refused at
      boot, naming the directory (proof: test:packages/core/tests/mount.test.ts)
      (proof: assertion:project.a_phase_without_a_workflow_is_refused_by_name)
- [x] The core reads no phase's content: a fixture whose sections are nonsense
      to every schema still mounts and still delivers
      (proof: test:packages/core/tests/Brief.test.ts)

**Exit condition:** one project drives grooming with an expensive model and
execution with a cheap one, the second reads what the first wrote without
either naming a path belonging to the other, and a packaged workflow does not
change — the `project-phases` gate's scenario drives exactly
that through the built assembly.
