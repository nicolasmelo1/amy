---
"@amykit/core": minor
"@amykit/cli": minor
"@amykit/agent-kit": minor
"@amykit/plugin-file-worktree": minor
"@amykit/plugin-command-gate": minor
"@amykit/plugin-plan-check": minor
"@amykit/plugin-claude": minor
"@amykit/plugin-codex": minor
"@amykit/plugin-hermes-agent": minor
"@amykit/workflow-ticket-to-qa": minor
"@amykit/workflow-note-to-plan": minor
"@amykit/workflow-errand": minor
---

The worktree is the workplace.

The core grows a `worktree` port (`acquire`, `pathFor`, `states`, `release`,
`prune`) and the `acquire-worktree` action beside it. `Git` gains worktree
mode without losing shared-checkout mode: with the port mounted, every path
it answers — agent prompts, the gate, plan checks, commits and pushes — is
the item's own tree, cut from the default branch, and preparing an item never
repoints the standing checkout's branch. The new `@amykit/plugin-file-worktree`
mounts the port over `~/.amy/worktrees/<workflow>/<workId>/<repo>`, prunes
terminal clean trees after retention, logs every removal as
`worktree.removed`, and refuses to delete an in-flight or dirty tree. The CLI
gains `amy worktrees list|remove|prune`, and `amy doctor` reports both roots.