---
base: 1471c13ea5a21e998b417b336683844b0932092f
sources:
  - { id: S1, kind: decision, said: "after the harness step, setup branches: an agent guides the person through configuring a project, or the current step-by-step walk, kept. Decided 2026-11-12" }
  - { id: S2, kind: decision, said: "the agent fills the person with questions and configures a project, not a workflow; opinionated: the work first, then how grooming starts it, then how the result is proven. Decided 2026-11-12" }
  - { id: S3, kind: decision, said: "setup is done when the config mounts and amy doctor reports nothing: a machine that can be switched on, ready to operate. Decided 2026-11-12" }
  - { id: S4, kind: code, ref: "packages/workflow-setup/workflow.mmd", said: "the walk is DETECTING, HARNESS, PLUGIN_INSTALLED, PINGED, WORKFLOW, CHANNELS, CONFIGURING, CHECKED; it asks for one workflow and knows no project" }
  - { id: S5, kind: reference, ref: "docs/design/a-project-is-brief-work-and-proof.md", said: "a project is a folder holding brief/, workflow/ and prove/; its walk is BRIEF, WORK, PROVE" }
  - { id: S6, kind: reference, ref: "examples/a-whole-project/README.md", said: "each folder's index.ts is a few lines pointing at a shipped workflow, and a profile names any one folder" }
  - { id: S7, kind: code, ref: "packages/cli/src/chat-action.ts", symbol: "config apply", said: "a proposed config.yaml is shown as a diff and written only if the new config mounts" }
  - { id: S8, kind: code, ref: "packages/cli/skills/amy-init/SKILL.md", said: "the setup skill reads the machine before asking and asks in numbered rounds, each with the answer it recommends" }
  - { id: S9, kind: code, ref: "packages/core/src/ports/Harness.ts", symbol: "AskContext", said: "a harness can be asked with a skill lent by name and directory" }
  - { id: S10, kind: reference, ref: "plans/every-setup-step-says-what-it-is-for.md", said: "setup shows the one amy add line the answers need, and each plugin brings its own step-by-step guide" }
  - { id: S11, kind: decision, said: "the agent proposes config only through config apply; it never writes config.yaml itself. Proposed 2026-11-12" }
  - { id: S12, kind: decision, said: "the branch is a new state after PINGED, so a harness has answered before the agent is asked; each guided turn asks it read-only with amy-init lent and posts one question. Proposed 2026-11-12" }
  - { id: S13, kind: decision, said: "the project folder is written from the a-whole-project shape where the person says, and its workflow, brief and proof are adjusted from the answers. Proposed 2026-11-12" }
  - { id: S14, kind: decision, said: "the person can leave the guide for the steps at any question; what was applied stays. Proposed 2026-11-12" }
touches:
  - packages/workflow-setup/workflow.mmd
  - packages/workflow-setup/src/machine.ts
  - packages/workflow-setup/src/record.ts
  - packages/workflow-setup/src/asks.ts
  - packages/workflow-setup/src/actions.ts
  - packages/workflow-setup/src/observation.ts
  - packages/workflow-setup/src/ports/Guide.ts
  - packages/workflow-setup/src/index.ts
  - packages/workflow-setup/tests/walkthrough.test.ts
  - packages/workflow-setup/tests/guided.property.test.ts
  - packages/cli/src/setup.ts
  - packages/cli/src/chat-action.ts
  - packages/cli/tests/setup.test.ts
  - packages/cli/skills/amy-init/SKILL.md
  - docs/start/quickstart.md
  - docs/start/installation.md
  - .software-factory/policy.yaml
  - .software-factory/evidence/setup-guided-scenario.sh
criteria:
  - { id: A1, statement: "after the harness answers, setup asks once whether the agent guides or the steps go on; a flag answers it, and the steps walk today's states unchanged", proof: "deferred:test:packages/workflow-setup/tests/walkthrough.test.ts", sources: [S1, S4, S12] }
  - { id: A2, statement: "each guided turn asks the harness read-only with amy-init lent, posts its one question in the conversation, and folds the reply into the next turn", proof: "deferred:test:packages/workflow-setup/tests/walkthrough.test.ts", sources: [S2, S8, S9, S12] }
  - { id: A3, statement: "the guide asks about the work first, then how grooming starts it, then how it is proven, and writes a project folder with workflow/, brief/ and prove/", proof: "deferred:test:packages/cli/tests/setup.test.ts", sources: [S2, S5, S6, S13] }
  - { id: A4, statement: "for any sequence of proposals the agent makes, config.yaml only ever holds a config that mounts, and each write was shown as a diff first", proof: "deferred:property:packages/workflow-setup/tests/guided.property.test.ts#an_unmounted_config_is_written", sources: [S7, S11] }
  - { id: A5, statement: "a refused proposal goes back to the agent with what refused it, and the person sees both", proof: "deferred:test:packages/cli/tests/setup.test.ts", sources: [S7, S11] }
  - { id: A6, statement: "before installing, the guide shows the one amy add line its project needs and each plugin's guide when it reaches that plugin", proof: "deferred:test:packages/cli/tests/setup.test.ts", sources: [S10] }
  - { id: A7, statement: "the guided walk ends only when amy doctor reports nothing; a finding goes back to the agent naming the check", proof: "deferred:test:packages/workflow-setup/tests/walkthrough.test.ts", sources: [S3] }
  - { id: A8, statement: "leaving the guide at any question keeps what was applied and starts the steps at the first thing still unanswered", proof: "deferred:test:packages/workflow-setup/tests/walkthrough.test.ts", sources: [S14] }
  - { id: A9, statement: "a guided turn the harness fails or is limited on offers the steps, saying why, and spends no attempt on the limit", proof: "deferred:test:packages/workflow-setup/tests/walkthrough.test.ts", sources: [S1, S12] }
  - { id: A10, statement: "the built CLI, in another process with HOME empty and a harness scripted from a recorded guided session, ends with a three-folder project, a mounted config and doctor reporting nothing", proof: "assertion:setup.a_guided_setup_ends_ready", sources: [S2, S3, S5] }
crosses:
  - { mechanism: diagram, answer: works, proof: "deferred:test:packages/workflow-setup/tests/walkthrough.test.ts" }
  - { mechanism: agent-replies, answer: works, proof: "deferred:A2, A9; an empty or malformed turn asks again, a failed one offers the steps" }
guarantee:
  - { holds: "nothing the guide proposes reaches config.yaml unless it mounts and was shown as a diff", not_against: "config.yaml edited by hand while the walk runs" }
  - { holds: "the guide writes only the project folder and config.yaml", not_against: "a harness that ignores its read-only mode" }
  - { holds: "a guided setup ends with doctor reporting nothing", not_against: "a check that turns red after the walk ended" }
failures:
  - { step: guided turn, when: "the harness fails or is limited", goes_to: "the steps are offered, naming why" }
  - { step: apply, when: "the proposed config does not mount", goes_to: "nothing written; the agent and the person read why" }
  - { step: project folder, when: "the folder the person names exists and is not empty", goes_to: "the guide asks for another, writing nothing there" }
cut:
  - "the agent installing plugins itself: it shows the amy add line, and setup runs it only on the person's yes"
  - "drawing the guided walk in the window: the window plans"
exit: "on a fresh machine with a logged-in harness, `amy setup` offers the guide; the agent's questions build a project with work, brief and proof, every write shown as a diff, and the walk ends with doctor reporting nothing"
---
# Setup builds a project with an agent

Setup asks for one workflow and leaves the project to the person. After the
harness answers, a guided path lets that harness interrogate the person and
build a project: the work first, then grooming, then proof. Every change goes
through config apply, and the walk ends when `amy doctor` reports nothing.
