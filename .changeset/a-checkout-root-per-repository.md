---
"@amykit/core": patch
"@amykit/cli": patch
"@amykit/plugin-claude": patch
"@amykit/plugin-codex": patch
"@amykit/plugin-hermes-agent": patch
"@amykit/plugin-command-gate": patch
"@amykit/plugin-plan-check": patch
"@amykit/plugin-file-worktree": patch
"@amykit/workflow-ticket-to-qa": patch
"@amykit/workflow-note-to-plan": patch
"@amykit/workflow-errand": patch
---

A checkout root per repository.

`checkouts:` maps a repository to its own path beside `workspaceRoot`; a
repository named there is never looked for under the root at all, `~` expands
the way the root's does, and a config without the block resolves exactly as
before. The map rides the host paths and every `Git` layout to the worktree
manager, which cuts a named repository's trees from its own checkout, and
`amy doctor` names which root it asked for each repository.