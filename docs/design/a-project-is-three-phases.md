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

Plugin-owned state follows the phase the same way: `amy btw` tasks and the
Slack thread memory live under the phase key, so two phases mounting the same
adapter never drain or answer each other's work. The notes, the inbox, the
roster and the handbrake stay machine-wide on purpose, and `amy stop` signals
only the selected phase's daemon rather than pulling that shared handbrake.

A workflow that ran alone before a sibling phase appeared keeps its records,
queue, log and PID where they were until an explicit migration moves them. Its
briefs are the exception, because they are what the sibling has to read: the
phase joins the project artifact root, and on its first mount there the host
copies the briefs it kept before into that root, linking each one into place
and never overwriting a brief a sibling already wrote.

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
- [x] A project with only `workflow/` mounts exactly as it does today, with no
      config change and no new key
      (proof: test:packages/cli/tests/project.test.ts)
      (proof: assertion:project.a_workflow_only_install_is_unchanged)
      (proof: assertion:project.a_workflow_only_install_keeps_its_briefs)
- [x] A brief written by one phase is read by another phase of the same
      project, with no shared directory named in config and no path escaping a
      profile's state
      (proof: assertion:project.a_brief_crosses_the_phase_boundary)
      (proof: assertion:project.no_config_names_a_shared_directory)
      (proof: assertion:project.no_phase_state_escapes_home)
- [x] A workflow promoted to a phase keeps the briefs it wrote alone
      (proof: assertion:project.a_promoted_workflow_keeps_its_briefs)
- [x] A phase directory that exists but exports no workflow is refused at
      boot, naming the directory (proof: test:packages/core/tests/mount.test.ts)
      (proof: assertion:project.a_phase_without_a_workflow_is_refused_by_name)
- [x] The core reads no phase's content: a fixture whose sections are nonsense
      to every schema still mounts and still delivers
      (proof: test:packages/core/tests/Brief.test.ts)

**Exit condition:** one project drives grooming with an expensive model and
execution with a cheap one, the second reads what the first wrote without
either naming a path belonging to the other, and an install that never heard
of phases does not change — the `project-phases` gate's scenario drives exactly
that through the built assembly.
