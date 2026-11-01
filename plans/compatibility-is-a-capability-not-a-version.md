---
sources:
  - { id: S1, kind: code, ref: "plugins/linear/package.json", said: "every plugin and workflow names \"@amykit/core\": \"^0.6.0\" under dependencies (plugins/linear/package.json:31, and thirty-one more); neither consequence of that line was decided" }
  - { id: S2, kind: friction, said: "^0.6.0 pre-1.0 means >=0.6.0 <0.7.0: the core is already locked; the next minor takes every published plugin out of resolution at once, nobody argued for it, invisible until it happens" }
  - { id: S3, kind: code, ref: "packages/core/src/index.ts", said: "as dependencies, npm may install a second core; the core exports CORE_ACTIONS, EVENT_KINDS, WORKFLOW_RUNTIME, Git, LogBudget, FileStopSwitch, so a workflow reading its own bundled copy disagrees with the host, nothing printed" }
  - { id: S4, kind: code, ref: "packages/core/src/mount.ts", said: "mount() already refuses by name at boot, every problem not the first (mount.ts): capability checks; a version is only a lossy proxy for whether the surface a plugin calls is there" }
  - { id: S5, kind: reference, ref: "docs/concepts/plugins.md", said: "the table of mount()'s refusals, e.g. action X: nothing defines it, needs the tracker port, which nothing mounted" }
  - { id: S6, kind: decision, said: "three pieces ship together, because a declaration nothing reads is worse than no declaration" }
  - { id: S7, kind: decision, said: "@amykit/core moves to peerDependencies in every plugin and workflow, with a devDependencies entry so the workspace builds; the range widens to >=0.6.0, the floor only; peers resolve one core and complain on conflict" }
  - { id: S8, kind: code, ref: "scripts/check-release-config.ts", said: "the workspace-wide half belongs in check-release-config.ts, which walks every manifest for quiet late failures; its logic moves into packages/cli/src/manifests.ts so it can be tested, as plan-board.ts is" }
  - { id: S9, kind: code, ref: "packages/core/src/event-contract.ts", said: "packages/core/contracts.json sits next to events.json, read from disk not imported so a hash lock can watch it (event-contract.ts:38); generated from the sources npm run docs:generate walks, not a second list" }
  - { id: S10, kind: decision, said: "contracts.json goes in the scope of L2.GENERATED_FILES_ARE_LOCKED, so a reviewer sees the diff when the contract moves" }
  - { id: S11, kind: decision, said: "contracts.json shape: version, ports with methods, actions with port and method, collections with read_by, and deprecated entries with since, removedIn and use" }
  - { id: S12, kind: decision, said: "a plugin may declare builtAgainst (a core version) and needs (port:, action:, event: members); mount() refuses a removed member, naming it, the core that removed it, the built-against version, and update or hold the core" }
  - { id: S13, kind: decision, said: "both fields are optional; a plugin declaring nothing behaves exactly as today: landing this as a break in the mechanism whose purpose is not breaking would argue against itself" }
  - { id: S14, kind: decision, said: "a deprecated member keeps working and says so at boot, naming the release it goes in and what to use instead; a warning, never a refusal: a plugin that works today must start today" }
  - { id: S15, kind: decision, said: "no new gate: contracts.json is generated and hash-locked, the refusal is a mount() branch unit-tested like its siblings, the manifest claim a pure function; none can fail on a machine yet pass a test" }
  - { id: S16, kind: decision, said: "the canary alone finds a break nobody predicted, defining breaking behaviourally: a third-party plugin runs its own artifact scenario against @amykit/core@next, and this repository runs those whose authors opt in" }
touches:
  - plugins/*/package.json
  - packages/workflow-*/package.json
  - packages/core/package.json
  - packages/core/contracts.json
  - packages/core/src/plugin.ts
  - packages/core/src/mount.ts
  - scripts/check-release-config.ts
  - scripts/docs/generate.ts
  - packages/cli/src/manifests.ts
  - packages/cli/tests/manifests.test.ts
  - packages/core/tests/contracts.test.ts
  - packages/core/tests/mount.test.ts
  - .software-factory/policy.yaml
criteria:
  - { id: A1, statement: "every published plugin and workflow names the core as a peer, and none names it as a dependency", proof: "test:packages/cli/tests/manifests.test.ts", sources: [S1, S2, S7, S8] }
  - { id: A2, statement: "a manifest that would let two copies of the core resolve fails the check by name, before anything is published", proof: "test:packages/cli/tests/manifests.test.ts", sources: [S3, S7, S8] }
  - { id: A3, statement: "contracts.json regenerated from the source changes nothing", proof: "assertion:compat.regenerating_the_contract_changes_nothing", sources: [S9, S10, S15] }
  - { id: A4, statement: "every port, action and collection the core owns appears in contracts.json exactly once", proof: "test:packages/core/tests/contracts.test.ts", sources: [S9, S11] }
  - { id: A5, statement: "a plugin declaring a member the installed core still has mounts", proof: "test:packages/core/tests/mount.test.ts", sources: [S12] }
  - { id: A6, statement: "a plugin declaring a member the installed core removed is refused at boot, naming the member and the version it was built against", proof: "test:packages/core/tests/mount.test.ts", sources: [S6, S12] }
  - { id: A7, statement: "that refusal arrives with the others, in one list, not first and alone", proof: "test:packages/core/tests/mount.test.ts", sources: [S4, S5, S15] }
  - { id: A8, statement: "a plugin declaring nothing mounts exactly as it does today", proof: "test:packages/core/tests/mount.test.ts", sources: [S13] }
  - { id: A9, statement: "a plugin using a deprecated member starts, and is told the release it goes in and what to use instead", proof: "test:packages/core/tests/mount.test.ts", sources: [S14] }
  - { id: A10, statement: "a deprecation entry naming a member the core does not have fails the contract's own check", proof: "test:packages/core/tests/contracts.test.ts", sources: [S11, S14] }
  - { id: A11, statement: "the published core carries contracts.json in its files", proof: "assertion:compat.the_installed_core_ships_its_contract", sources: [S9] }
  - { id: A12, statement: "whether a third-party plugin survives the next core is answered by running its own scenario against it", proof: "deferred:the canary is its own row, and waits on test-fixtures being public", sources: [S16] }
crosses:
  - { mechanism: mount-and-capabilities, answer: works, proof: "deferred:A5, A6, A7, A8, A9" }
  - { mechanism: rendering, answer: n/a, why: "plugins/ui-stub only moves @amykit/core to a peer in its package.json; no view or renderer changes" }
cut:
  - "locking the core: refused; it stops the core moving, the accidental status quo"
  - "publishing a supported version window: refused; the number is guessed, nobody knows which change breaks whom, so authors bump it on reflex every release"
  - "install it and let it break, as pi.dev does (no compatibility declaration; outside catalogue, changelog agent and shims fill the gap): refused; amy breaks unattended at three in the morning on a real ticket"
  - "a gate built on this precondition: not in this plan"
  - "the canary: its own row, waiting on @amykit/test-fixtures being a supported public package"
  - "amy plugin add reading the floor before installing: its own row, waiting on amy add (row 4)"
exit: "a machine with a plugin built against an older core is told at boot which member it lost and which release removed it; a plugin declaring nothing still starts; one copy of the core resolves anywhere in the install"
---
# Compatibility is a capability, not a version

Every plugin pins the core with `^0.6.0` under `dependencies`: that silently locks the core to one minor and lets npm install a second copy whose constants disagree with the host's, with nothing printed.
