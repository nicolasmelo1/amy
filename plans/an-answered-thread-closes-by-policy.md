# An answered thread closes by policy

The machine now closes an automated review thread after the agent judged it
fixed. The decision is literal in `planCopilotFix`: every unresolved automated
thread whose recorded verdict is `fixed` becomes a `resolve-review-thread`
action (`packages/workflow-ticket-to-qa/src/machine.ts:287`). The delivered
design says human threads stay open as workflow policy
(`docs/design/the-threads-close-when-they-are-answered.md:41`), but the policy
is prose and a branch, not configuration. An installation can neither leave
bot threads for their author to close nor allow the machine to settle human
threads after it has answered them.

Issue #54 calls out the boundary: plugins are plugins because two installs can
make different choices. The code-host port should expose the mechanism and the
workflow should choose the policy, but neither choice belongs written in
stone. The default may preserve the decision just delivered; the operator
must still be able to set and alter it, and the machine must do exactly what
the current configuration says.

## What changes

**Resolution policy is explicit per reviewer class.** The ticket workflow's
`policy` gains:

```yaml
policy:
  answeredThreadResolution:
    automated: close
    human: leave-open
```

Each value is `close` or `leave-open`. Defaults are `automated: close` and
`human: leave-open`, preserving the current machine for an unchanged install.
The two axes are independent: both closed, both left open and either mixed
configuration are valid. `close` applies only after an affirmative answer — a
`fixed` verdict today, and an `answered` verdict when the planned review
triage lands. `disagreed`, `deferred`, `wont-fix`, a missing verdict and an
agent run that did not complete never close a thread under any configuration.

The setting belongs to `@amykit/workflow-ticket-to-qa`, not to GitHub. GitHub
implements `resolveReviewThread`; it does not decide whose objection amy may
settle. Linear does not see it either. The pure machine receives the parsed
policy and emits or omits the action, so tests can prove the decision without
mocking config inside an adapter.

**The nested policy is parsed, not cast.** `configSchema.policy` currently says
only `record`, and `runtimeFor` spreads it into `DEFAULT_POLICY` with a type
assertion (`packages/workflow-ticket-to-qa/src/plugin.ts:64`, `:98`). A local
`parsePolicy` becomes the one path from plugin config to `Policy`: it validates
every known scalar, validates both `answeredThreadResolution` keys and enum
values, fills omitted values from `DEFAULT_POLICY`, and refuses unknown nested
keys at boot with their full path. This plan does not grow the five-type core
schema language for one workflow's nested vocabulary.

**The decision does not enter the record.** The record keeps what the agent
answered; the current policy decides what to do with that answer on each look.
After somebody edits config and restarts amy, an unresolved thread judged
`fixed` can therefore be closed under the new setting, or left open under the
other, without migrating the ticket record. A thread already closed is not
silently reopened when policy changes to `leave-open`: changing future policy
is not permission to rewrite remote history. `unresolveReviewThread` remains
an explicit capability for a workflow action, not a config side effect.

**One helper owns eligibility.** The machine derives closeable threads from
three facts: reviewer class, latest recorded verdict and current resolution
policy. Both automated and human review states use that helper. No second
hard-coded "humans never" branch survives beside it, and future verdicts go
through the same exhaustive switch so adding one cannot inherit `close` by
accident.

## The gate

`ticket-to-qa`, extended. The stand-in forge starts with one automated and one
human unresolved thread, records every resolve mutation and does not close a
thread merely because code changed. The installed scenario runs each policy
combination and then repeats one record after editing config and restarting:

- `resolution.the_default_closes_only_the_answered_automated_thread`
- `resolution.leave_open_closes_no_answered_thread`
- `resolution.each_reviewer_class_follows_its_own_setting`
- `resolution.both_close_closes_each_answered_thread_once`
- `resolution.a_non_answer_never_closes_under_any_policy`
- `resolution.changing_policy_changes_the_next_move_not_the_record`
- `resolution.invalid_policy_is_refused_before_the_first_mutation`

The assertions read the forge's raw thread state and mutation log. A plan or
record saying "resolved" is not proof that the remote conversation closed.
The changed-policy case first judges a thread while configured `leave-open`,
then remounts with `close` and proves exactly one mutation occurs on the next
eligible look; the inverse proves no already-closed thread is reopened.

## Acceptance criteria

- [ ] The unchanged default closes answered automated threads and leaves
      answered human threads open
      (proof: assertion:resolution.the_default_closes_only_the_answered_automated_thread)
- [ ] Every combination of automated and human `close` or `leave-open` is
      accepted, and each reviewer class follows its own setting independently
      (proof: assertion:resolution.each_reviewer_class_follows_its_own_setting)
- [ ] When both reviewer classes are configured to close, each answered
      thread receives exactly one remote mutation
      (proof: assertion:resolution.both_close_closes_each_answered_thread_once)
- [ ] A configuration that leaves both classes open sends no resolve mutation
      even though both answers are recorded
      (proof: assertion:resolution.leave_open_closes_no_answered_thread)
- [ ] A disagreement, deferral, wont-fix, missing verdict or incomplete run
      never closes a thread under either policy
      (proof: assertion:resolution.a_non_answer_never_closes_under_any_policy)
- [ ] Editing the policy and remounting changes the next decision without a
      record migration and never reopens already-settled remote history
      (proof: assertion:resolution.changing_policy_changes_the_next_move_not_the_record)
- [ ] Unknown keys and values in `answeredThreadResolution` are refused at
      boot with the full config path, before any code-host mutation
      (proof: assertion:resolution.invalid_policy_is_refused_before_the_first_mutation)
- [ ] The machine has one exhaustive eligibility rule for both reviewer
      classes, with no hard-coded automated or human exception beside it
      (proof: test:packages/workflow-ticket-to-qa/tests/machine.test.ts)

**Exit condition:** an operator can independently choose whether answered
automated and human threads close, alter that choice for the next mounted run,
and see the exact configured mutations — no more, no fewer — proven against
the stand-in forge rather than inferred from the machine's record.