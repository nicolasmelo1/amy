# An update keeps the workflow current

Issue #88 asks for every workflow to be able to update the machine around its
run. `amy update` already has the safety boundary: it refuses a live daemon,
resolves both roots, probes the copies npm wrote, and rolls back a machine that
will not mount. Scheduling must preserve that boundary rather than teaching an
already-running daemon to replace the code it is executing.

## The boundary

A workflow run is one invocation of `amy tick`, `amy run`, or a daemon
lifecycle. A foreground command can update before it assembles the engine or
after it has finished; a background daemon can update before its child starts
or after that child exits. It never updates between daemon ticks, because the
process holding the loaded modules is exactly the live loop `amy update`
refuses.

The schedule belongs to the machine, not to a workflow package. One top-level
`autoUpdate:` block applies to every configured profile:

```yaml
autoUpdate:
  enabled: true
  timing: before
  everyRuns: 20
```

It is enabled by default, runs before the workflow, and is due every twenty
workflow invocations. The count is persisted per profile under the amy home,
so a restart does not turn a cadence into a coincidence. `enabled: false`
means no update command is invoked. `timing` accepts only `before` or `after`;
`everyRuns` is a positive integer. A bad value is refused by `amy doctor`
before the workflow runs.

A due update that refuses or fails makes that workflow invocation fail. Running
stale after a known failed update is not the promised behavior, and swallowing
the failure would make the default look active while doing nothing. A run that
is not due proceeds with no update subprocess.

## The gate

Extend `amy-update`, because this is the command's lifecycle boundary. Its
scenario drives a machine through both timings and reads back the scheduler
state and the npm invocation log. Add:

- `update.default_auto_update_runs_before_a_workflow`
- `update.auto_update_can_run_after_a_workflow`
- `update.auto_update_respects_its_cadence`
- `update.auto_update_can_be_disabled`
- `update.invalid_auto_update_settings_refuse_before_work`
- `update.a_daemon_updates_only_at_its_lifecycle_boundary`

## Acceptance criteria

- [ ] A config that names no `autoUpdate` block runs the update before its
      workflow and records that run
      (proof: assertion:update.default_auto_update_runs_before_a_workflow)
- [ ] `timing: after` runs the update after the workflow has finished
      (proof: assertion:update.auto_update_can_run_after_a_workflow)
- [ ] `everyRuns` invokes update only on the configured ordinal and survives a
      process restart
      (proof: assertion:update.auto_update_respects_its_cadence)
- [ ] `enabled: false` invokes no update subprocess
      (proof: assertion:update.auto_update_can_be_disabled)
- [ ] A zero, non-integer or unknown timing is refused before a workflow is
      assembled or advanced
      (proof: assertion:update.invalid_auto_update_settings_refuse_before_work)
- [ ] A daemon updates before it starts or after it ends, never beneath a live
      loop
      (proof: assertion:update.a_daemon_updates_only_at_its_lifecycle_boundary)
- [ ] A failed scheduled update fails the workflow invocation and names the
      update's refusal
      (proof: test:packages/cli/tests/auto-update.test.ts)

**Exit condition:** every workflow runs with a persisted, configurable update
cadence; the default updates before every twentieth invocation, operators can
disable it or place it after the work, and no loaded daemon replaces itself.