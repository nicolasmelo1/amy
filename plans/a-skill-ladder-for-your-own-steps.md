# A skill ladder for your own steps

`HarnessRelay.ask` looks up a skill ladder by whatever step the caller named:
`context.step && this.deps.skills?.[context.step]`
(`packages/agent-kit/src/HarnessRelay.ts:46`). Any string works, because the
runtime has no opinion about where an action name came from.

`parseSkills` has one. It refuses any key that is not a core action
dispatching to the agent port — *"`skills.<step>` is not a step an agent
performs"* (`plugins/agent-relay/src/skills.ts:31`), checked against
`CORE_ACTIONS` (`core/src/actions.ts:21`). So a workflow that emits its own
action names — which is every workflow somebody writes for themselves, and the
thing amy is now about — cannot give any of its steps a skill. The relay would
run it. The validator will not let the config say it.

The validator is right to exist: a typo in a `skills:` key is a ladder that
silently never fires, and finding that out costs a run. It is checking against
the wrong list. The list of steps that exist is the mounted workflow's
`usesActions`, which is data on the workflow for exactly this reason —
*"`usesActions` is data so the mount can be refused when an action has no port
behind it"*.

`ladderByStep` has the same shape and the same freedom on the runtime side
(`rungsFor`, `agent-kit/src/ladders.ts:35`), and nothing validates its keys at
all. Both should be checked the same way, once, against the same list.

## What changes

The step-name check moves from `register` to `ready`. `mount()` runs a second
pass for exactly this — *"a plugin that composes others can only judge its own
settings once those others have contributed themselves"*
(`core/src/mount.ts:87`) — and the workflow has registered by then.

A step is valid if it is a core action dispatching to the agent, or an action
the mounted workflow declares in `usesActions` that resolves to the agent
port. Everything else is refused by name at boot, with the list of steps there
were — the same shape as every other refusal here.

Both `skills` and `ladderByStep` go through it. A ladder keyed by a step
nobody dispatches has never been anything but a typo.

## And how hard to think

A step can be given its own model. It cannot be given how hard that model should
think, and that is the third map with the same shape:

```yaml
agent:
  ladderByStep:
    self-review: [claude:opus, codex:gpt-5.6-terra]
  effortByStep:
    self-review: high
```

Searching the core, the model specs and the agent kit for reasoning, thinking or
effort returns one hit, and it is the English word in a comment. Both CLIs amy
drives expose the control; amy does not.

It matters most where it is missing. The steps worth paying for are not the ones
that write the most code: a wrong decision at a planning step costs every ticket
downstream of it, and a wrong decision at an implementation step costs one
branch. On one real feature, fourteen tickets were groomed and six were
cancelled after code had been written. So the step that should think hardest is
usually the cheapest one to run and the one nobody would think to configure, and
the only way to buy more thinking today is to name a bigger model — which buys a
different tradeoff and costs the same on every step that model appears in.

`AskContext` gains the field, so a relay composing harnesses can act on it and a
single-harness install ignores it — the shape the two existing optional fields
already have. Adapters map it to whatever their CLI calls it, and a harness with
no such control receives the question unchanged rather than failing.

The boot refusal is the part worth insisting on, and it is why this belongs
here rather than in a row of its own: an unknown effort value is exactly the
defect this plan already refuses for skills, one key over. A ladder that quietly
means less than it says is worse than a loud refusal, and an effort level
silently dropped is harder to notice because the run still succeeds.

## The gate

`plugin-agent-relay`, extended. Add:

- `relay.a_workflows_own_step_can_have_a_skill`
- `relay.a_step_nobody_declares_is_refused_at_boot`
- `relay.the_refusal_lists_the_steps_there_were`
- `relay.a_model_ladder_is_checked_like_a_skill_ladder`
- `relay.an_effort_reaches_the_harness_that_has_one`
- `relay.an_effort_no_harness_accepts_is_refused_at_boot`

Its scenario already mounts a workflow written outside this repository, so the
step it declares is the one to key a skill on.

## Acceptance criteria

- [ ] A skill ladder keyed by a workflow's own action is accepted and fires
      (proof: assertion:relay.a_workflows_own_step_can_have_a_skill)
- [ ] A key no workflow declares is refused at boot
      (proof: assertion:relay.a_step_nobody_declares_is_refused_at_boot)
- [ ] The refusal lists the steps there were
      (proof: assertion:relay.the_refusal_lists_the_steps_there_were)
- [ ] `ladderByStep` is validated by the same rule
      (proof: assertion:relay.a_model_ladder_is_checked_like_a_skill_ladder)
- [ ] A core action still works as a key, unchanged
      (proof: test:plugins/agent-relay/tests/skills.test.ts)
- [ ] An action that does not reach the agent port is still refused
      (proof: test:plugins/agent-relay/tests/skills.test.ts)
- [ ] A step given an effort passes it to the harness, a step without one
      behaves exactly as today, and a harness with no such control receives the
      question unchanged rather than failing
      (proof: assertion:relay.an_effort_reaches_the_harness_that_has_one)
- [ ] An effort value no mounted harness accepts is refused at boot, naming the
      step and the value
      (proof: assertion:relay.an_effort_no_harness_accepts_is_refused_at_boot)
- [ ] The effort reaches a workflow-declared step through the relay, not only
      the core's own steps
      (proof: test:plugins/agent-relay/tests/skills.test.ts)

**Exit condition:** a workflow somebody wrote themselves gives one of its own
steps a cheaper model, a skill of its own and how hard to think, from
`config.yaml`, with nothing in amy's code naming that step — and a typo in any
of the three is refused at boot rather than discovered by a run that succeeded
while meaning less than it said.
