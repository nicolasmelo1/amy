---
sources:
  - { id: S1, kind: code, ref: "packages/agent-kit/src/HarnessRelay.ts:46", said: "HarnessRelay.ask looks a skill ladder up by whatever step the caller named; any string works, the runtime has no opinion where an action name came from" }
  - { id: S2, kind: code, ref: "plugins/agent-relay/src/skills.ts:31", said: "parseSkills refuses any key not a core action dispatching to the agent port, against CORE_ACTIONS (core/src/actions.ts:21): a workflow's own actions cannot get a skill, though the relay would run it" }
  - { id: S3, kind: decision, said: "the validator is right to exist (a skills typo is a ladder that silently never fires, found only by a run); it checks the wrong list" }
  - { id: S4, kind: code, ref: "packages/core/src/mount.ts", said: "the steps that exist are the keys of the mounted workflow's actions, each declared and implemented at once; usesActions is gone and mount refuses a workflow still declaring it" }
  - { id: S5, kind: reference, ref: "docs/design/a-workflow-is-three-pieces.md", said: "those keys are the actions of the workflow's defineWorkflow call" }
  - { id: S6, kind: code, ref: "packages/agent-kit/src/ladders.ts:35", said: "ladderByStep (rungsFor) has the same shape and freedom, and nothing validates its keys; both are checked the same way, once, against the same list" }
  - { id: S7, kind: code, ref: "packages/core/src/mount.ts:87", said: "the step check moves from register to ready, mount's second pass for a plugin judging its settings once others contributed; the workflow has registered by then" }
  - { id: S8, kind: decision, said: "a step is valid if a core action dispatching to the agent, or a mounted workflow's runtime actions key whose handler reaches the agent port; anything else is refused by name at boot, listing the steps there were" }
  - { id: S9, kind: decision, said: "skills and ladderByStep both go through it: a ladder keyed by a step nobody dispatches is a typo" }
  - { id: S10, kind: decision, said: "effortByStep is a third same-shaped map, e.g. `agent: { ladderByStep: { self-review: [claude:opus, codex:gpt-5.6-terra] }, effortByStep: { self-review: high } }`" }
  - { id: S11, kind: code, said: "core, model specs and agent kit hold no reasoning/thinking/effort control (one hit, a comment word); both CLIs amy drives expose it" }
  - { id: S12, kind: friction, said: "a wrong planning decision costs every downstream ticket, an implementation one a branch; on one real feature 14 tickets were groomed and 6 cancelled after code was written" }
  - { id: S13, kind: decision, said: "the step that should think hardest is usually cheapest and unconfigured; today only a bigger model buys thinking, a different tradeoff costing the same on every step it appears in" }
  - { id: S14, kind: decision, ref: "packages/core/src/ports/Harness.ts", said: "AskContext gains the field, optional like its two existing ones: a relay acts on it, a single harness ignores it. Adapters map it to their CLI's name; a harness without it gets the question unchanged, not failing" }
  - { id: S15, kind: decision, said: "an unknown effort is refused at boot, the defect already refused for skills one key over; a silently dropped effort is harder to notice because the run still succeeds. That is why it belongs here" }
  - { id: S16, kind: decision, said: "gate plugin-agent-relay is extended with six relay.* assertions; its scenario already mounts a workflow written outside this repository, whose declared step keys the skill" }
touches:
  - plugins/agent-relay/src/skills.ts
  - plugins/agent-relay/src/plugin.ts
  - plugins/agent-relay/src/config.ts
  - plugins/agent-relay/tests/skills.test.ts
  - packages/agent-kit/src/HarnessRelay.ts
  - packages/core/src/ports/Harness.ts
  - plugins/claude/src/**
  - plugins/codex/src/**
  - packages/cli/src/config.ts
  - .software-factory/evidence/plugin-agent-relay/**
  - .software-factory/policy.yaml
criteria:
  - { id: A1, statement: "a skill ladder keyed by a workflow's own action is accepted and fires", proof: "assertion:relay.a_workflows_own_step_can_have_a_skill", sources: [S1, S2, S4, S5, S16] }
  - { id: A2, statement: "a key no workflow declares is refused at boot", proof: "assertion:relay.a_step_nobody_declares_is_refused_at_boot", sources: [S3, S7, S8] }
  - { id: A3, statement: "the refusal lists the steps there were", proof: "assertion:relay.the_refusal_lists_the_steps_there_were", sources: [S8] }
  - { id: A4, statement: "ladderByStep is validated by the same rule", proof: "assertion:relay.a_model_ladder_is_checked_like_a_skill_ladder", sources: [S6, S9] }
  - { id: A5, statement: "a core action still works as a key, unchanged", proof: "test:plugins/agent-relay/tests/skills.test.ts", sources: [S8] }
  - { id: A6, statement: "an action that does not reach the agent port is still refused", proof: "test:plugins/agent-relay/tests/skills.test.ts", sources: [S8] }
  - { id: A7, statement: "a step given an effort passes it to the harness, a step without one behaves exactly as today, and a harness with no such control receives the question unchanged rather than failing", proof: "assertion:relay.an_effort_reaches_the_harness_that_has_one", sources: [S10, S11, S12, S13, S14] }
  - { id: A8, statement: "an effort value no mounted harness accepts is refused at boot, naming the step and the value", proof: "assertion:relay.an_effort_no_harness_accepts_is_refused_at_boot", sources: [S15] }
  - { id: A9, statement: "the effort reaches a workflow-declared step through the relay, not only the core's own steps", proof: "test:plugins/agent-relay/tests/skills.test.ts", sources: [S10, S14] }
crosses:
  - { mechanism: attempts-and-waits, answer: n/a, why: "the lookup changes which skill, model and effort a step asks with, not how attempts are charged or given back" }
  - { mechanism: agent-replies, answer: n/a, why: "only what is asked changes; a reply is read as today" }
  - { mechanism: tracker-and-host-writes, answer: n/a, why: "AskContext gains an optional field; the Harness port writes nothing to the tracker or the code host" }
  - { mechanism: config, answer: works, proof: "deferred:A2, A4, A8" }
exit: "a self-written workflow gives its own step a cheaper model, its own skill and how hard to think from config.yaml, no amy code naming it; a typo in any is refused at boot, not found by a succeeding run"
---
# A skill ladder for your own steps

The relay would run a skill on any step, but the config validator refuses every step a self-written workflow declares, and no step can be told how hard to think.
