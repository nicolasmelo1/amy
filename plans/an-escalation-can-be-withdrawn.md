# An escalation can be withdrawn

`ESCALATED` is left only when a person answers, and the per-state attempt
counters that took the work there stay at the ceiling. So when the
escalation was caused by a *defect* rather than by the work, the only
recovery is editing the record JSON by hand while the daemon is not looking.
Five records needed that in one evening.

Three things are true together, and each is right on its own:

- A workflow's escalation is withdrawn by an observation — a reply from the
  person it named. Nothing else clears it, which is the correct default: a
  machine that un-escalates itself is a machine you cannot trust to stop.
- `attempts` is per state and folded by `applyPlan` before the workflow's
  own `apply` ever runs (`packages/core/src/work.ts:80`). Nothing in the CLI
  can clear it.
- `amy poke` brings the next look forward
  (`packages/cli/src/index.ts:493`). It re-reads the same ceiling and
  escalates again, so it is not a recovery.

Together: a defect that has since been fixed leaves records parked for
ever, and the fix does not reach them. On that evening, three records were
parked on a missing capability — automated threads nobody could close, now
[planned](the-threads-close-when-they-are-answered.md) — and two on a
counter that charged a branch checkout to the implementing state, so one
real round was billed as three.

## The repair, by hand, today

Per record: stop the loop, copy the file aside, set `state` to where it
actually stopped, empty `attempts`, drop the fields the workflow's own fold
wrote, append a history entry, start the loop again.

Two things make that worse than tedious. The daemon can rewrite the record
in the same second — there is no lock and no "is this claimed" to ask — so
the window is the whole risk. And knowing which fields are stale means
reading the workflow's `apply`; they are not core fields, and an operator
has no way to enumerate them.

## What changes

```sh
amy resume <workId> [--to <state>]
amy resume TBO-1241 TBO-1242 --to COPILOT_FIX
```

- **Refuses while the work is claimed or in flight.** This is the half a
  person cannot do safely by hand, and the reason the command belongs here
  rather than in a script.
- Backs the record up beside it — the store is one file per record, and a
  sibling with another extension is invisible to `all()` — and prints what
  changed.
- Clears the attempts of the state it resumes into, and of the state it
  leaves.
- Appends a history entry saying a person resumed it, so `amy status` and
  the log still tell the truth about how it got there.

`--to` is optional only when the workflow says where. The core knows
`state`, `attempts` and `history`; everything else on the record belongs to
the workflow that folded it. So the runtime contribution grows two optional
members:

```ts
resumeTarget?(record: R): string | null   // where this record goes on
resumed?(record: R, to: string): R        // drop what this escalation wrote
```

Core does the safe half — claim check, backup, attempts, history — and asks
the workflow for the rest. A workflow that implements neither still resumes
with `--to`, and refuses rather than guesses without one.

`amy attempts <workId> --clear <state>` covers the narrower case: the state
is right and only the counter is a lie.

The bare `amy resume` keeps releasing the handbrake
(`packages/cli/src/index.ts:385`); work ids are what make it a withdrawal.
Two levers that share a subject, and a script that typed `amy resume`
yesterday means today what it meant yesterday.

The log grows a `work.resumed` kind, so the repair is an event like every
other thing that happened to the work.

## The gate

The command is driven against a real store and queue from the CLI tests, as
`poke` is: a record at a ceiling resumes, refuses while claimed, and comes
back with an honest counter. The workflow's half — dropping its own
escalation fields — is proven where the fold lives.

## Acceptance criteria

- [ ] A resumed record starts its next look with no attempts spent in the
      state it re-enters (proof: test:packages/cli/tests/resume.test.ts)
- [ ] Resume refuses a piece of work that is claimed or in flight
      (proof: test:packages/cli/tests/resume.test.ts)
- [ ] The record is backed up before it is changed, and the backup is not
      listed as work (proof: test:packages/cli/tests/resume.test.ts)
- [ ] The history says a person resumed it, and `amy status` still tells
      the truth about how it got there
      (proof: test:packages/cli/tests/resume.test.ts)
- [ ] A workflow that folds its own escalation fields drops them on resume
      (proof: test:packages/workflow-ticket-to-qa/tests/plugin.test.ts)
- [ ] A workflow that implements no hook still resumes with `--to`, and
      refuses rather than guesses without one
      (proof: test:packages/workflow-ticket-to-qa/tests/plugin.test.ts)
- [ ] `amy attempts --clear` resets one state's counter and touches nothing
      else (proof: test:packages/cli/tests/attempts.test.ts)
- [ ] The log carries a `work.resumed` line the contract knows
      (proof: test:packages/core/tests/event-contract.test.ts)

**Exit condition:** a record that escalated on a defect comes back by a
command — counter honest, history truthful, and the daemon never once raced
the repair.