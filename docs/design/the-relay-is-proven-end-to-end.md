# The relay is proven end to end

Every path it exists for is a path a good day never reaches.

`@amykit/plugin-agent-relay` decides how money gets spent when something goes
wrong. It only ever does anything on a quota refusal, a child killed mid-run,
or a ladder with a typo in it. None of those happen while anyone is watching,
and none of them can be produced on demand with a real credential.

Unit tests reach those causes with a fake `Agent`, and 30 of them do. They do
not reach the real argv, the real envelope parsing, or the real `mount()`. A
relay whose policy is perfect and whose plugin forgot to mount the port passes
every one of them.

## What this gate is about

The scenario mounts the **built** claude, codex and relay plugins from another
process, with fake `claude` and `codex` executables on the `PATH`. The fakes
are the only pretend part, and they have to be: proving that a quota moves to
another harness means producing a quota.

The fakes behave like the real CLIs where it counts. The claude one reports
the model that actually ran, under a full id with a window suffix rather than
the short alias it was asked for, because that is what the real envelope
carries and asserting on the alias would prove something easier than the
truth.

The activation paths include `packages/agent-kit/src/**` as well as the
plugin's own, because the shared `HarnessAgent` is what turns a harness reply
into an outcome. A change there can silently stop the relay from ever seeing a
cause, which is exactly what happened once: `triage` threw on a run that did
not complete, so the escalation was skipped at the one moment it was needed.
This scenario is what caught it.

## The load-bearing assertion

`relay.starts_nothing_else_after_an_abandoned_run`.

`amy stop` kills the child. A relay that read that as a failure would raise a
fresh process on the next harness the instant the handbrake came down, and the
handbrake would stop braking. It is the one property where being wrong costs
money **after** being told to stop.

## The ceiling on spending is part of the same claim

The relay is the only thing here that spends an agent, so the budget is its
setting and its port. The engine asks it before it starts a move that would
call one, and parks the ticket when the answer is no.

That makes it the same argument as everything above: the ceiling only ever
does anything on the day the money is nearly gone, which is the day nobody is
watching. So it is proved here, against the built artifacts, with a log
seeded to look like a window that is nearly spent.

## And who does the step, which is the same ladder again

A skill named for a step is tried before amy's own prompt, and the harness
ladder runs underneath it: a skill is tried across the harnesses it needs
before the next skill gets a turn. Two ladders, two questions. Who should do
this, and what to do when the one asked could not.

It is proved here for the same reason as everything above: a skill that does
not answer is not something a good day produces, and a skill named in a config
that nobody installed has to be refused before a ticket is touched rather than
after one escalates for no reason.

## Acceptance criteria

- [x] The relay is what mounts the `agent` port, and the harnesses on their
      own leave it unowned
      (proof: assertion:relay.mounts_the_agent_port)
- [x] A failure escalates to the stronger model of the same harness
      (proof: assertion:relay.escalates_the_model_after_a_failure)
- [x] A failure does not change harness while that harness still has a
      stronger model to offer
      (proof: assertion:relay.does_not_change_harness_on_a_failure)
- [x] A rate limit changes harness, because a bigger model sits behind the
      same quota that just refused
      (proof: assertion:relay.changes_harness_after_a_rate_limit)
- [x] A rate limit skips every remaining model of the throttled harness
      (proof: assertion:relay.skips_the_rest_of_the_throttled_harness)
- [x] A run that was cut off starts nothing else, so the handbrake keeps
      braking
      (proof: assertion:relay.starts_nothing_else_after_an_abandoned_run)
- [x] A ladder naming an agent nobody contributed is refused while boot can
      still refuse it
      (proof: assertion:relay.refuses_an_unknown_agent_at_boot)
- [x] A configured ceiling mounts a `budget` port, and an install with no
      ceiling mounts none
      (proof: assertion:relay.mounts_a_budget_when_a_ceiling_is_set)
- [x] A window past the stopping fraction refuses new work, naming the
      window and the measure that stopped it
      (proof: assertion:relay.stops_new_work_at_the_ceiling)
- [x] The same window with room in it allows work, so the brake lets go
      (proof: assertion:relay.starts_work_while_the_window_has_room)
- [x] A budget naming a window nobody meters is refused while boot can still
      refuse it
      (proof: assertion:relay.refuses_a_budget_it_cannot_mean_at_boot)
- [x] A step with a skill named for it is handed to that skill rather than to
      amy's own prompt
      (proof: assertion:relay.hands_the_step_to_the_skill_named_for_it)
- [x] A skill that answered ends the step, and nothing else is asked
      (proof: assertion:relay.asks_no_other_skill_once_one_answered)
- [x] A skill that did not answer hands the step to the next one named
      (proof: assertion:relay.moves_to_the_next_skill_when_the_first_did_not_answer)
- [x] A skill nobody installed is refused while boot can still refuse it
      (proof: assertion:relay.refuses_a_skill_nobody_installed_at_boot)
- [x] The refusal names what there was to choose from
      (proof: assertion:relay.names_the_skills_there_were_to_choose_from)

**Exit condition:** the gate carries a sealed manifest whose report shows
these sixteen assertions passing against the built artifacts, and touching the
relay or the shared agent kit turns `sf check` red until the run is repeated
and resealed.

What is not proven here, and is not pretended: no harness reports a quota
except claude, so codex and hermes read a throttle as a failure. The ladder
still reaches another harness, one rung later than it could.
