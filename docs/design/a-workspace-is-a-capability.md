---
base: 1ff8a2f0c0ee18b243cc5178d1b11a1c342295f1
sources:
  - { id: S1, kind: code, ref: "packages/cli/src/config.ts", symbol: "machineSchema", said: "seven of the machine's own top-level keys only mean something with repositories: repos, workspaceRoot, checkouts, defaultBranch, baseBranch, gate and worktrees" }
  - { id: S2, kind: code, ref: "packages/core/src/plugin.ts", symbol: "HostPaths", said: "every plugin's context carries a workspace and a checkouts map, and checkouts() hands it a Git built from them, whether or not anything mounted works in a repository" }
  - { id: S3, kind: code, ref: "packages/cli/src/doctor.ts", symbol: "configContents", said: "amy doctor fails an install whose repos list is empty, so a machine driving no code is told it is broken" }
  - { id: S4, kind: code, ref: "packages/cli/src/slices.ts", symbol: "derivedSlices", said: "the host hands config.repos, defaultBranch and gate down into the plugins' slices, so the machine keeps settings only some plugins read" }
  - { id: S5, kind: reference, ref: "docs/design/the-config-is-written-by-what-is-mounted.md", said: "the host stopped keeping a workflow's settings and amy update moved them under the work that reads them; the workspace is the same move one layer down" }
  - { id: S6, kind: friction, said: "amy drives workflows, not only development: support, sales, hiring, planning. A support inbox mounts today, but on a config that asks for repositories and a doctor that wants one" }
  - { id: S7, kind: decision, said: "a workspace (the repositories, where their checkouts live, their branches and worktrees) is a capability a plugin provides, not something every install has. Decided 2026-11-03" }
  - { id: S8, kind: decision, said: "repos, workspaceRoot, checkouts, defaultBranch, baseBranch and worktrees become @amykit/plugin-file-worktree's slice, and gate @amykit/plugin-command-gate's; the machine keeps none of the seven. The agent's choice of owners, for the person to confirm" }
  - { id: S9, kind: decision, said: "PluginContext.checkouts() answers through the mounted workspace; a plugin calling it where none is mounted is refused at mount, naming that plugin and the workspace it needs" }
  - { id: S10, kind: decision, said: "amy doctor asks about repositories, checkouts and worktrees only of an install that mounts a workspace" }
  - { id: S11, kind: decision, said: "amy update moves the seven keys under the plugin that now owns each, as it moved the workflows' vocabulary: original kept, a second run a no-op, a key put back refused at boot naming its new place" }
  - { id: S12, kind: decision, said: "the proof is a workflow with no code, a support inbox: a request arrives, an agent triages it and drafts the answer, the operator approves it in the conversation, it is sent; installed and driven by the executable" }
  - { id: S14, kind: code, ref: "packages/core/src/define-workflow.ts", symbol: "defineWorkflow", said: "building a declared workflow's runtime calls ctx.checkouts() for every workflow, so refusing it where no workspace is mounted would refuse workflows that never touch a repository" }
  - { id: S15, kind: decision, said: "a workflow is handed checkouts only when it uses them, asked for when first read; one that never reads them mounts with no workspace" }
  - { id: S13, kind: decision, said: "a new gate, a-workspace-is-a-capability, runs that inbox on an install with none of the seven keys and no workspace, from amy init to a sent answer, and drives ticket-to-qa, errand and note-to-plan with their workspace in its plugin" }
touches:
  - packages/cli/src/config.ts
  - packages/cli/src/slices.ts
  - packages/cli/tests/slices.property.test.ts
  - packages/cli/src/doctor.ts
  - packages/cli/src/update.ts
  - packages/core/src/plugin.ts
  - packages/core/src/mount.ts
  - packages/core/src/define-workflow.ts
  - packages/core/src/checkouts.ts
  - plugins/file-worktree/src/**
  - plugins/command-gate/src/**
  - .software-factory/evidence/a-workspace-is-a-capability*
  - .software-factory/policy.yaml
  - packages/core/src/index.ts
  - packages/core/src/ports/Workspace.ts
  - packages/cli/src/add.ts
  - packages/cli/src/assemble.ts
  - packages/cli/src/config-template.ts
  - packages/cli/src/index.ts
  - packages/cli/src/workflow.ts
  - packages/cli/package.json
  - package-lock.json
  - plugins/github/src/plugin.ts
  - packages/workflow-feature-grooming/src/plugin.ts
  - packages/test-fixtures/src/**
  - packages/cli/tests/**
  - packages/core/tests/**
  - packages/workflow-*/tests/**
  - plugins/*/tests/**
  - plugins/command-gate/README.md
  - plugins/file-worktree/README.md
  - scripts/docs/draft.ts
  - plugins/next-steps/src/plugin.ts
  - README.md
  - docs/**
criteria:
  - { id: A1, statement: "the machine's schema has none of the seven keys; the file-worktree plugin's slice has the six workspace keys and the command-gate plugin's has gate, each with its default and description", proof: "test:packages/cli/tests/config.test.ts", sources: [S1, S7, S8], done: true }
  - { id: A2, statement: "a plugin calling checkouts() on a mount with no workspace is refused at mount, naming the plugin and the workspace it needs", proof: "test:packages/core/tests/checkouts.test.ts", sources: [S2, S9], done: true }
  - { id: A8, statement: "a workflow declared with defineWorkflow that never reads its checkouts mounts and walks with no workspace mounted", proof: "test:packages/core/tests/define-workflow.test.ts", sources: [S14, S15], done: true }
  - { id: A3, statement: "amy doctor on an install that mounts no workspace asks nothing about repositories, checkouts or worktrees, and says ready", proof: "test:packages/cli/tests/doctor.test.ts", sources: [S3, S10], done: true }
  - { id: A4, statement: "the host hands no plugin a repository, branch or gate it did not read from that plugin's own slice", proof: "property:packages/cli/tests/slices.property.test.ts#machine_key_leaks_into_a_slice", sources: [S4, S8], done: true }
  - { id: A5, statement: "amy update moves the seven keys under their plugins, keeps the original, moves nothing the second time, and a key put back is refused at boot naming its new place", proof: "assertion:update.the_workspace_moves_into_its_plugin", sources: [S5, S11], done: true }
  - { id: A6, statement: "on an install with none of the seven keys and no workspace mounted, the installed support inbox walks a request from arrival to a sent answer, after the operator approves it in the conversation", proof: "assertion:workspace.a_workflow_without_code_needs_no_workspace", sources: [S6, S12, S13], done: true }
  - { id: A7, statement: "ticket-to-qa, errand and note-to-plan walk as their gates prove, with the workspace in the plugin's slice instead of the machine's", proof: "assertion:workspace.the_code_workflows_walk_with_their_workspace_in_its_plugin", sources: [S7, S8, S11], done: true }
crosses:
  - { mechanism: config, answer: works, proof: "test:packages/cli/tests/config.test.ts (A1), assertion:update.the_workspace_moves_into_its_plugin (A5)" }
  - { mechanism: checkouts-and-leases, answer: works, proof: "test:packages/core/tests/checkouts.test.ts (A2), assertion:workspace.the_code_workflows_walk_with_their_workspace_in_its_plugin (A7)" }
  - { mechanism: mount-and-capabilities, answer: works, proof: "test:packages/core/tests/checkouts.test.ts (A2), test:packages/core/tests/define-workflow.test.ts (A8)" }
  - { mechanism: install-and-update, answer: works, proof: "assertion:update.the_workspace_moves_into_its_plugin (A5)" }
  - { mechanism: calls, answer: works, proof: "test:packages/core/tests/define-workflow.test.ts (A8); a called workflow's runtime is built on the same path, so it too is handed checkouts only when it reads them" }
  - { mechanism: tracker-and-host-writes, answer: n/a, why: "the workspace port is a new port beside the others; no tracker or code-host write is claimed or handed over differently" }
  - { mechanism: workflow-tooling, answer: n/a, why: "amy workflow check lends its stand-in checkouts the same way; only the HostPaths fields it no longer passes changed" }
  - { mechanism: hooks, answer: n/a, why: "before, after and interrupt are untouched; only when a runtime's checkouts are built changes" }
guarantee:
  - { holds: "an install that drives no code is asked for no repository, by the config, the doctor or the mount", not_against: "a workflow plugin that asks for a repository setting of its own, outside config, doctor and mount" }
failures:
  - { step: mount, when: "a plugin calls checkouts() and no workspace is mounted", goes_to: "refused at boot, naming the plugin and the workspace it needs" }
  - { step: boot, when: "one of the seven keys is put back at the top level", goes_to: "refused, naming the plugin slice it now lives in" }
cut:
  - "a shipped support workflow: the inbox is the proof's fixture, not a package anybody installs"
  - "renaming the worktree plugin: it keeps its name and gains the workspace keys"
deviations:
  - "feature-grooming builds its grooming source once every plugin has registered: it mounts before the workspace's provider, and a repository with no checkout is still refused at boot"
  - "the next-steps tracker reads its workplace when the table is read, not while it registers: it mounts before the workflow and the workspace after, so a machine driving ticket-to-qa from a table stopped booting"
  - "A6's gate also requires workspace.the_config_names_no_workspace, workspace.the_doctor_asks_nothing_of_a_repository_and_says_ready and workspace.nothing_is_sent_before_the_operator_approves: the three facts the walk rests on, each failing on its own"
  - "A5's assertion is the amy-update gate's; the new gate re-runs that scenario and carries update.the_workspace_moves_into_its_plugin over, so the gate this note names requires every check its criteria cite"
  - "touches widened at delivery to every file the work changed: the workspace port and its exports, the host's assembly, add and template reading the moved keys, the tests and docs naming HostPaths' workspace, the lockfile"
  - "the doctor asks for `gh` and `git` only where a workspace is mounted: an install driving no code was otherwise told it is broken for want of a GitHub login, which the guarantee rules out"
  - "A6's inbox lists its plugins: every workflow's recommended set includes file-worktree and github (packages/cli/src/profiles.ts, outside touches), so a path-added workflow on the recommendation mounts a workspace. Narrowing that is left to the person"
  - "A6's inbox drafts through the core's generic `draft-plan` and catalogues `ask-operator` and `send-answer` on its own port: an outside workflow cannot run an uncatalogued handler, and a port-bound action on an unknown port is refused"
  - "A7 is proven inside the new gate by running the ticket-to-qa, errand and note-to-plan scenarios as they stand and reading each kept world's config: none of the seven keys at the top, the repositories in the file-worktree plugin's slice"
  - "main's move of every action onto the ports (#156) and its drawn workflows landed during the work; the tests and evidence drivers that lent a workspace through HostPaths now mount one through the workspace port"
exit: "on an install whose config.yaml has none of repos, workspaceRoot, checkouts, defaultBranch, baseBranch, gate and worktrees, amy doctor says ready and an installed support inbox walks a request to a sent answer the operator approved; the code workflows still walk"
---
# A workspace is a capability

amy drives workflows, and only some of them touch code, yet every install carries the settings of one that does.
Seven of the machine's top-level keys name repositories, and the doctor fails a machine that names none.

The config plan moved a workflow's vocabulary under the workflow that reads it.
This is the same move one layer down: the repositories move under the plugin that works in them.
