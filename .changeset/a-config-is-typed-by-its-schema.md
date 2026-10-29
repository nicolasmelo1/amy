---
"@amykit/cli": minor
"@amykit/core": minor
"@amykit/plugin-agent-relay": minor
"@amykit/plugin-claude": minor
"@amykit/plugin-codex": minor
"@amykit/plugin-command": minor
"@amykit/plugin-command-gate": minor
"@amykit/plugin-file-brief-store": minor
"@amykit/plugin-file-notes": minor
"@amykit/plugin-file-queue": minor
"@amykit/plugin-file-store": minor
"@amykit/plugin-file-tasks": minor
"@amykit/plugin-file-worktree": minor
"@amykit/plugin-github": minor
"@amykit/plugin-hermes-agent": minor
"@amykit/plugin-linear": minor
"@amykit/plugin-notify-hermes": minor
"@amykit/plugin-notify-inbox": minor
"@amykit/plugin-plan-check": minor
"@amykit/plugin-serial-engine": minor
"@amykit/plugin-slack": minor
"@amykit/workflow-errand": minor
"@amykit/workflow-feature-grooming": minor
"@amykit/workflow-note-to-plan": minor
"@amykit/workflow-ticket-to-qa": minor
---

**A config is typed by its schema.** `definePlugin` gives a plugin's register and ready hooks the post-validation type derived from its schema, rejects mismatched defaults, and moves every shipped schema onto that declaration. Scalar and `string[]` settings no longer cast away the host's validation; record settings remain explicitly narrowed where a plugin needs a stronger value shape.
