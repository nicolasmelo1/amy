---
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
  - { id: S13, kind: decision, said: "a new gate, a-workspace-is-a-capability, runs that inbox on an install whose config.yaml has none of the seven keys and mounts no workspace, from amy init to a sent answer" }
touches:
  - packages/cli/src/config.ts
  - packages/cli/src/slices.ts
  - packages/cli/src/doctor.ts
  - packages/cli/src/update.ts
  - packages/core/src/plugin.ts
  - packages/core/src/mount.ts
  - packages/core/src/checkouts.ts
  - plugins/file-worktree/src/**
  - plugins/command-gate/src/**
  - .software-factory/evidence/a-workspace-is-a-capability*
  - .software-factory/policy.yaml
criteria:
  - { id: A1, statement: "the machine's schema has none of the seven keys; the file-worktree plugin's slice has the six workspace keys and the command-gate plugin's has gate, each with its default and description", proof: "deferred:test:packages/cli/tests/config.test.ts", sources: [S1, S7, S8] }
  - { id: A2, statement: "a plugin calling checkouts() on a mount with no workspace is refused at mount, naming the plugin and the workspace it needs", proof: "deferred:test:packages/core/tests/checkouts.test.ts", sources: [S2, S9] }
  - { id: A3, statement: "amy doctor on an install that mounts no workspace asks nothing about repositories, checkouts or worktrees, and says ready", proof: "deferred:test:packages/cli/tests/doctor.test.ts", sources: [S3, S10] }
  - { id: A4, statement: "the host hands no plugin a repository, branch or gate it did not read from that plugin's own slice", proof: "deferred:test:packages/cli/tests/slices.test.ts", sources: [S4, S8] }
  - { id: A5, statement: "amy update moves the seven keys under their plugins, keeps the original, moves nothing the second time, and a key put back is refused at boot naming its new place", proof: "deferred:assertion:update.the_workspace_moves_into_its_plugin", sources: [S5, S11] }
  - { id: A6, statement: "on an install with none of the seven keys and no workspace mounted, the installed support inbox walks a request from arrival to a sent answer, after the operator approves it in the conversation", proof: "deferred:assertion:workspace.a_workflow_without_code_needs_no_workspace", sources: [S6, S12, S13] }
  - { id: A7, statement: "ticket-to-qa, errand and note-to-plan walk as their gates prove, with the workspace in the plugin's slice instead of the machine's", proof: "deferred:assertion:update.the_new_version_drives_the_work", sources: [S7, S8, S11] }
crosses:
  - { mechanism: config, answer: works, proof: "deferred:A1, A5" }
  - { mechanism: checkouts-and-leases, answer: works, proof: "deferred:A2, A7" }
  - { mechanism: mount-and-capabilities, answer: works, proof: "deferred:A2" }
  - { mechanism: install-and-update, answer: works, proof: "deferred:A5" }
guarantee:
  - { holds: "an install that drives no code is asked for no repository, by the config, the doctor or the mount" }
failures:
  - { step: mount, when: "a plugin calls checkouts() and no workspace is mounted", goes_to: "refused at boot, naming the plugin and the workspace it needs" }
  - { step: boot, when: "one of the seven keys is put back at the top level", goes_to: "refused, naming the plugin slice it now lives in" }
cut:
  - "a shipped support workflow: the inbox is the proof's fixture, not a package anybody installs"
  - "renaming the worktree plugin: it keeps its name and gains the workspace keys"
exit: "on an install whose config.yaml has none of repos, workspaceRoot, checkouts, defaultBranch, baseBranch, gate and worktrees, amy doctor says ready and an installed support inbox walks a request to a sent answer the operator approved; the code workflows still walk"
---
# A workspace is a capability

amy drives workflows, and only some of them touch code, yet every install carries the settings of one that does.
Seven of the machine's top-level keys name repositories, and the doctor fails a machine that names none.

The config plan moved a workflow's vocabulary under the workflow that reads it.
This is the same move one layer down: the repositories move under the plugin that works in them.
