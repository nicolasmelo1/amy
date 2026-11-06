---
base: 2074c2a5172d17e61d3c22c62297dc9a00efd3c9
sources:
  - { id: S1, kind: decision, said: "packages/ holds amy itself: the core and what it needs to run. The workflows that ship as examples move to a directory of their own, examples/. Decided 2026-11-06" }
  - { id: S2, kind: code, ref: "packages/workflow-ticket-to-qa/package.json", said: "packages/ holds five workflows beside the machine: workflow-errand, workflow-feature-grooming, workflow-note-to-plan, workflow-pull-request and workflow-ticket-to-qa" }
  - { id: S3, kind: code, ref: "docs/mechanisms.yaml", said: "workflow-tooling lists packages/workflow-testkit/src/**: the testkit is what amy workflow check drives, so it is part of the machine, not an example" }
  - { id: S4, kind: code, ref: "packages/cli/package.json", said: "the cli names @amykit/workflow-errand and @amykit/workflow-note-to-plan under devDependencies only, for its tests; no file under packages/cli/src imports a workflow package" }
  - { id: S5, kind: code, ref: "packages/test-fixtures/src/ticket-to-qa.ts", said: "the private test-fixtures package imports @amykit/workflow-ticket-to-qa to drive the lifecycle in tests" }
  - { id: S7, kind: code, ref: "docs/mechanisms.yaml", said: "record-migration's paths are packages/workflow-*/src/machine.ts and record.ts, diagram's are packages/*/workflow.mmd, agent-replies names packages/workflow-ticket-to-qa/src/agent-steps.ts: the catalog finds a crossing by those paths" }
  - { id: S8, kind: code, ref: ".software-factory/policy.yaml", said: "twenty-eight gate activation paths name packages/workflow-*, and the workspaces, tsconfig.json and ten plugins' tsconfig references reach the workflows by directory" }
  - { id: S9, kind: decision, said: "the moved packages keep their names, their versions and the fixed release group: an install that names @amykit/workflow-ticket-to-qa does not notice, and only repository.directory follows the move. Decided 2026-11-06" }
  - { id: S10, kind: decision, said: "a published package under packages/ names no package under examples/ in dependencies or peerDependencies; a devDependency for tests, and the private test-fixtures, may. Decided 2026-11-06" }
  - { id: S12, kind: reference, ref: "plans/a-plugin-is-installed-into-a-workflow.md", said: "a fork's source is read from repository.directory at the tag of its version, so a version released before the move is still forked from where it was, and one after from examples/" }
  - { id: S13, kind: code, ref: "packages/workflow-ticket-to-qa/src/plugin.ts", said: "declares its brief and prove phases absent with reasons, as the errand and note-to-plan do; no directory in the repository is a brief/ or prove/ phase, so no whole project exists to copy" }
  - { id: S14, kind: decision, said: "one example is a whole project, examples/a-whole-project/: brief/ calls feature-grooming, workflow/ calls ticket-to-qa, prove/ calls the proving plugin with a browser scenario. Decided 2026-11-06" }
  - { id: S15, kind: reference, ref: "plans/a-phase-is-proven-not-asserted.md", said: "one proving workflow walks every scenario, the scenario a section of the brief; it ships as a plugin with a browser driver" }
touches:
  - examples/**
  - packages/workflow-errand/**
  - packages/workflow-feature-grooming/**
  - packages/workflow-note-to-plan/**
  - packages/workflow-pull-request/**
  - packages/workflow-ticket-to-qa/**
  - packages/core/tests/architecture.test.ts
  - plugins/agent-relay/tsconfig.json
  - plugins/claude/tsconfig.json
  - plugins/codex/tsconfig.json
  - plugins/command-gate/tsconfig.json
  - plugins/file-notes/tsconfig.json
  - plugins/file-tasks/tsconfig.json
  - plugins/hermes-agent/tsconfig.json
  - plugins/linear/tsconfig.json
  - plugins/plan-check/tsconfig.json
  - plugins/serial-engine/tsconfig.json
  - packages/cli/tsconfig.json
  - packages/test-fixtures/tsconfig.json
  - package.json
  - package-lock.json
  - tsconfig.json
  - tsconfig.tests.json
  - vitest.config.ts
  - docs/mechanisms.yaml
  - docs/**
  - plans/**
  - scripts/**
  - .software-factory/policy.yaml
  - .software-factory/evidence/**
untouched:
  - "packages/workflow-testkit/**: amy workflow check drives it, so it is the machine (S3)"
  - "packages/cli/src/**: it imports no workflow; its string tables naming the shipped workflows (profiles.ts, slices.ts, config.ts, config-template.ts) stay, moving what a workflow needs into it is another row"
criteria:
  - { id: A1, statement: "examples/ holds the five workflow packages, and packages/ holds none of them and keeps workflow-testkit", proof: "deferred:test:packages/core/tests/architecture.test.ts", sources: [S1, S2, S3] }
  - { id: A2, statement: "no published package under packages/ names a package under examples/ in dependencies or peerDependencies, and adding one turns the test red naming both", proof: "deferred:test:packages/core/tests/architecture.test.ts", sources: [S4, S5, S10] }
  - { id: A3, statement: "each moved package keeps its name, version and release group, and its repository.directory names its directory under examples/", proof: "deferred:test:packages/core/tests/architecture.test.ts", sources: [S9, S12] }
  - { id: A4, statement: "every mechanism and every gate activation that named a moved path names its new one, and a changed file under examples/ activates the gate and reaches the crossing it did before", proof: "deferred:test:scripts/plans/tests/mechanisms.test.ts", sources: [S7, S8] }
  - { id: A5, statement: "the lifecycle gate passes from examples/ with its evidence re-run and re-sealed, not edited", proof: "assertion:brief.parent_is_the_tracker_supplied_shared_id", sources: [S8] }
  - { id: A6, statement: "examples/a-whole-project mounts as one profile whose record walks BRIEF, WORK, PROVE and DONE, each phase a shipped workflow, its brief carrying a scenario the prove phase walks", proof: "deferred:test:examples/a-whole-project/tests/project.test.ts", sources: [S13, S14, S15] }
crosses:
  - { mechanism: diagram, answer: works, proof: "deferred:A4" }
  - { mechanism: record-migration, answer: n/a, why: "a record is read by the same code under another directory; no saved record changes shape" }
  - { mechanism: agent-replies, answer: n/a, why: "agent-steps.ts moves unchanged; only the path the catalog names follows it" }
  - { mechanism: workflow-tooling, answer: n/a, why: "the testkit stays in packages/ and drives the moved workflows as packages, by name" }
guarantee:
  - { holds: "an install that names a shipped workflow by package name mounts it before and after the move, unchanged", not_against: "an install that names a workflow by a path into a clone of this repository" }
  - { holds: "every path the gate, the catalog and the plans read that named a moved file names it after the move", not_against: "delivered design notes under docs/design, which describe what shipped where it shipped and keep their text" }
failures:
  - { step: "moving a directory", when: "a reference to its old path is missed", goes_to: "the gate is red, sf ready naming the plan line or the policy naming the path, before the change merges" }
cut:
  - "renaming the moved packages: refused, a name is what an install holds (S9)"
  - "moving the plugins that implement a workflow's own port (file-notes, file-tasks, plan-check): they are plugins and stay under plugins/"
  - "moving the cli's string tables into the workflows: not a move of directories, so not this row"
exit: "packages/ holds only amy and what it needs to run, examples/ the five shipped workflows under their same names and one whole project; the gate and e2e pass, and an install naming @amykit/workflow-ticket-to-qa updates across the move unchanged"
---
# The examples are not the machine

packages/ holds amy itself and what it needs to run. The workflows it ships are examples of what can be built on it, and move to examples/ under the same package names, so nothing an install names changes.
