# A skill for the half-step

A workflow can send several logical steps through one agent action, and
the runtime already keys by them: `HarnessRelay.ask` reads
`context.step` (`packages/agent-kit/src/HarnessRelay.ts:46`) and
`rungsFor` reads the same name for the model ladder
(`packages/agent-kit/src/ladders.ts:36`), so `run-errand` passing
`step: "self-review"` reaches the ladder machinery today
(`packages/workflow-errand/src/runtime.ts:110`).

The validator does not. `parseSkills` refuses any key that is not a core
action dispatching to the agent port — *"`skills.<step>` is not a step an
agent performs"* (`plugins/agent-relay/src/skills.ts:31`) — so
`skills: self-review: [/antikus-code-review]` is refused at boot even
though the runtime honors it. Workflow-revv's workaround is to attach the
skill to `run-errand` whole, which then fires on triage, implementation
and self-review alike: the wrong ladder for three of the four steps it
was not about. The same blindness will meet `ladderByStep` the day a
workflow routes a half-step to a cheaper model.

This was found on the Revv workflow (issue #48), but no workflow is
exempt: any workflow that phases one action — ask, then check, then
review — has half-steps the config cannot name. The sibling plan for the
action-name half of this ([a-skill-ladder-for-your-own-steps.md](a-skill-ladder-for-your-own-steps.md))
widens the list to `usesActions`; this plan is about the steps *between*
actions, which no list on the workflow declares.

## What changes

**The workflow declares its half-steps.** `Workflow` gains an optional
`declaredSteps?: readonly string[]` (`packages/core/src/plugin.ts:18`) —
the names the workflow itself may put in `AskContext.step` that are not
its own action names. Optional, for the same reason every new seam on the
runtime contribution is: a workflow without it works exactly as today.

**One check, two lists.** The step-name validation moves out of
`parseSkills`'s `CORE_ACTIONS`-only world into a list built at mount:
core actions that dispatch to `agent`, plus the mounted workflow's
`usesActions` that resolve to the agent port, plus its `declaredSteps`.
A key on none of those is a typo, and it is cheaper to say so at boot
with the list of steps there were than to leave a ladder that never
fires — the refusal message names the steps it knows, the same shape as
every other refusal in this codebase. `ladderByStep` goes through the
same check; today nothing validates its keys at all.

**Where the check runs.** In `ready`, beside the step-ladder check of
the sibling plan, because the workflow has registered by then and the
mount can still refuse (`core/src/mount.ts` second pass). The scenario's
outside-repository workflow gains a `declaredSteps: ["self-review"]`, so
the assertion proves a half-step key is accepted, one nobody declares is
refused with the list, and a model ladder keys on the same half-step.

## The gate

`plugin-agent-relay`, extended — it owns both ladders and the scenario
already mounts a workflow written outside this repository:

- `relay.a_declared_half_step_can_have_a_skill`
- `relay.a_half_step_nobody_declares_is_refused_at_boot`
- `relay.the_half_step_refusal_lists_the_steps_there_were`
- `relay.a_model_ladder_can_key_on_a_declared_half_step`

## Acceptance criteria

- [ ] A skill keyed by a workflow-declared half-step is accepted and
      fires for that step only
      (proof: assertion:relay.a_declared_half_step_can_have_a_skill)
- [ ] A half-step key nobody declares is refused at boot
      (proof: assertion:relay.a_half_step_nobody_declares_is_refused_at_boot)
- [ ] The refusal lists the steps there were
      (proof: assertion:relay.the_half_step_refusal_lists_the_steps_there_were)
- [ ] `ladderByStep` keys on a declared half-step through the same rule
      (proof: assertion:relay.a_model_ladder_can_key_on_a_declared_half_step)
- [ ] A workflow with no `declaredSteps` mounts and runs exactly as
      before (proof: test:plugins/agent-relay/tests/skills.test.ts)

**Exit condition:** a workflow that phases one action into several steps
can give each of them its own skill and its own model ladder, from
`config.yaml`, with the typos refused at boot by name.