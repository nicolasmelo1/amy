---
sources:
  - { id: S1, kind: code, ref: "packages/agent-kit/src/HarnessRelay.ts", said: "HarnessRelay.ask reads context.step (:46) and rungsFor reads it for the model ladder (ladders.ts:36), so run-errand passing step: self-review (workflow-errand/src/runtime.ts:110) reaches the ladders today" }
  - { id: S2, kind: code, ref: "plugins/agent-relay/src/skills.ts", said: "parseSkills refuses any key not a core action dispatching to the agent port (skills.ts:31), so skills: self-review: [/code-review] is refused at boot though the runtime honors it" }
  - { id: S3, kind: friction, ref: "issue #48", said: "a private workflow attaches the skill to run-errand whole, so it fires on triage, implementation and self-review alike: the wrong ladder for the steps it was not about; ladderByStep meets the same" }
  - { id: S4, kind: reference, ref: "plans/a-skill-ladder-for-your-own-steps.md", said: "the sibling widens the list to usesActions; this plan covers the steps between actions, which no list declares, and which any workflow phasing one action has" }
  - { id: S5, kind: decision, ref: "packages/core/src/plugin.ts", said: "Workflow gains optional declaredSteps?: readonly string[] (plugin.ts:18), names it may put in AskContext.step that are not its action names; a workflow without it works exactly as today" }
  - { id: S6, kind: decision, said: "step-name validation leaves parseSkills's CORE_ACTIONS-only world for a list built at mount: core actions dispatching to agent, the workflow's usesActions resolving to the agent port, and its declaredSteps" }
  - { id: S7, kind: decision, said: "a key on none of those is a typo, refused at boot naming the steps it knows, like every other refusal here; ladderByStep goes through the same check, whose keys nothing validates today" }
  - { id: S8, kind: decision, said: "the check runs in ready, beside the sibling's step-ladder check: the workflow has registered by then and the mount can still refuse (core/src/mount.ts second pass)" }
  - { id: S9, kind: decision, said: "the plugin-agent-relay gate is extended (it owns both ladders, mounts an outside workflow); that workflow gains declaredSteps: [\"self-review\"], proving acceptance, refusal with the list, and a model ladder on it" }
touches:
  - packages/core/src/plugin.ts
  - plugins/agent-relay/src/skills.ts
  - plugins/agent-relay/src/plugin.ts
  - plugins/agent-relay/tests/skills.test.ts
  - .software-factory/evidence/plugin-agent-relay-scenario.sh
  - .software-factory/policy.yaml
criteria:
  - { id: A1, statement: "a skill keyed by a workflow-declared half-step is accepted and fires for that step only", proof: "assertion:relay.a_declared_half_step_can_have_a_skill", sources: [S1, S2, S3, S4, S5, S6, S9] }
  - { id: A2, statement: "a half-step key nobody declares is refused at boot", proof: "assertion:relay.a_half_step_nobody_declares_is_refused_at_boot", sources: [S7, S8, S9] }
  - { id: A3, statement: "the refusal lists the steps there were", proof: "assertion:relay.the_half_step_refusal_lists_the_steps_there_were", sources: [S7, S9] }
  - { id: A4, statement: "ladderByStep keys on a declared half-step through the same rule", proof: "assertion:relay.a_model_ladder_can_key_on_a_declared_half_step", sources: [S1, S3, S7, S9] }
  - { id: A5, statement: "a workflow with no declaredSteps mounts and runs exactly as before", proof: "test:plugins/agent-relay/tests/skills.test.ts", sources: [S5] }
crosses:
  - { mechanism: mount-and-capabilities, answer: works, proof: "deferred:A2, A5" }
  - { mechanism: agent-replies, answer: n/a, why: "only which skill and ladder keys are accepted changes; how a reply is read does not" }
exit: "a workflow that phases one action into several steps can give each its own skill and its own model ladder, from config.yaml, with the typos refused at boot by name"
---
# A skill for the half-step

The runtime already keys skills and model ladders by any step name a workflow passes, but the validator refuses every step that is not a core action, so a half-step inside one action cannot be named in the config.
