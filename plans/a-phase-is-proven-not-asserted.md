# A phase is proven, not asserted

[A project is three phases](../docs/design/a-project-is-three-phases.md) asks for the slot.
This is what goes in it, and it is the phase that does not exist anywhere in amy
today.

The word "test" already means the other thing here. A workflow's walkthrough
drives the whole lifecycle against a fake world in milliseconds. That is right
for a state machine and says nothing about whether the work the machine produced
holds.

## Two failures from one day, both through green

**A statement no database ever saw.** A batch insert and two batch updates in a
data-access layer, covered by twenty-six unit tests, all green. The tests mocked
the driver, so they asserted the *text* of the statement and nothing about its
validity. All three were rejected by the real server on the first row — one
because a parameter in a `VALUES` list has no column to take a type from and is
read as text, two because the target of an `UPDATE` cannot be referenced from a
`JOIN`. Nothing the branch could run would have found it. Preparing each
statement against a real server found all three in one command.

**A badge whose premise was never stated as a scenario.** A plan described three
outcomes a user would see and named no example. The case that broke it — a
partial payment plus a credit, where the two systems agree and the badge says
they do not — was found by a reviewer after the code was written.

Both are the same shape: **passing the tests a branch can run is not evidence the
work holds.**

## The discipline to port

A phase is not complete when its unit, integration or scripted tests pass. It is
complete when a named scenario exists, a real cheap agent completes the flow from
a customer-shaped prompt against the real local system, every required assertion
is `passed` and **none is `unsupported`**, and the run leaves a redacted artifact
attached as evidence.

The line that makes it hold rather than decorate: *a link to the common document
is not a substitute for the phase's own scenario.* Each phase names **its own**.
A generic reference does not count — the same discipline a brief applies to
sources, cited rather than gestured at, turned on proof.

`unsupported` earns its own mention. An assertion the harness could not evaluate
is the most common thing counted as a success, and most homegrown gates have no
such state, so an unevaluatable assertion quietly becomes green. That is the
failure this whole plan is about, wearing a different hat.

## A proof is a lock, and it goes stale

Decided 2026-10-01. A workflow is the three phases together, and the proving
phase is what stands between work being done and work being trusted.

**The lock is a project artifact, not a state of the execution phase.** It sits
beside the briefs in the project's artifact root: one proof record per unit of
work, written by `test/` and read by the others, the same way a brief is
written by `brief/` and read by `workflow/`. No phase reaches into another's
lifecycle, so the three stay independently driven, budgeted and stoppable.

**A proof can be manual.** A person running the scenario by hand and recording
the outcome is a proof like any other; what makes it one is the record, not
who ran it. The record names the scenario, each assertion's status, who ran it
and what it ran against.

**A proof goes stale.** It records the digest of the code it was run against
and the revision of the brief it proved. When either moves, the proof stops
counting and the unit is unproven again, without anybody remembering to look.
Unproven work is what the lock holds: it does not count as done.

**A missing phase is a warning, not a refusal.** A project without `brief/` or
`test/` still boots; `amy doctor` names the missing folder and what the project
loses without it. Refusing would block every project before there is anything
for a proving phase to run.

## Where it pays for itself

In the planning phase. A unit of work that must name the scenario proving it has
to write an example, and an example is the cheapest instrument anybody has for
finding the case a prose requirement left open — two phases earlier than a
reviewer finds it.

## What is not in this

**How a scenario is expressed.** Whatever schema a project wants. The core
mounts a port and refuses an unproven unit; it does not learn a scenario
language.

**Judging whether the work is any good.** This proves a scenario holds. A
well-proven scenario for the wrong feature passes everything here, exactly as a
well-sourced brief for the wrong feature passes its own checks.

**Replacing the walkthrough.** The state machine still needs its fast test
against a fake world. Two tests, two subjects, and conflating them is how the
first came to be mistaken for proof.

## Acceptance criteria

- [ ] A unit of work that names no scenario cannot leave the planning phase, and
      the refusal names the unit
      (proof: test:packages/core/tests/proving.test.ts)
- [ ] A scenario runs against the real system rather than the fake world the
      workflow's own walkthrough uses, and a scenario whose only actor is the
      fake world is refused
      (proof: assertion:proof.the_scenario_drove_the_real_system)
- [ ] An assertion the harness cannot evaluate blocks completion, naming the
      assertion and why, rather than counting as a pass
      (proof: test:packages/core/tests/proving.test.ts)
- [ ] A proof is a record in the project's artifact root, written by the
      proving phase and read by the others, with no phase reading another's
      records or queue
      (proof: assertion:proof.a_proof_crosses_the_phase_boundary)
- [ ] A person can record a manual run as the proof, naming who ran it and
      each assertion's status
      (proof: assertion:proof.a_manual_run_is_a_proof)
- [ ] A proof whose code digest or brief revision no longer matches what it
      certified stops counting, and the unit it proved is unproven again
      (proof: assertion:proof.the_artifact_expires_with_its_subject)
- [ ] A project without `brief/` or `test/` boots, and `amy doctor` names each
      missing folder and what the project loses without it
      (proof: test:packages/cli/tests/doctor.test.ts)

**Exit condition:** a unit of work whose scenario names no example cannot leave
planning, a phase whose run left one assertion unevaluated is refused with that
assertion named, a person's manual run locks a unit as proven, and a unit
proven last month against code or a brief that has since changed is unproven
again without anybody remembering to look.
