---
"@amykit/agent-kit": patch
"@amykit/cli": patch
"@amykit/core": patch
"@amykit/model-specs": patch
"@amykit/plugin-agent-browser": patch
"@amykit/plugin-agent-desktop": patch
"@amykit/plugin-agent-relay": patch
"@amykit/plugin-claude": patch
"@amykit/plugin-codex": patch
"@amykit/plugin-command": patch
"@amykit/plugin-command-gate": patch
"@amykit/plugin-concurrent-engine": patch
"@amykit/plugin-file-brief-store": patch
"@amykit/plugin-file-log": patch
"@amykit/plugin-file-notes": patch
"@amykit/plugin-file-queue": patch
"@amykit/plugin-file-store": patch
"@amykit/plugin-file-tasks": patch
"@amykit/plugin-file-worktree": patch
"@amykit/plugin-github": patch
"@amykit/plugin-hermes-agent": patch
"@amykit/plugin-linear": patch
"@amykit/plugin-next-steps": patch
"@amykit/plugin-notify-fanout": patch
"@amykit/plugin-notify-hermes": patch
"@amykit/plugin-notify-inbox": patch
"@amykit/plugin-plan-check": patch
"@amykit/plugin-prove": patch
"@amykit/plugin-serial-engine": patch
"@amykit/plugin-slack": patch
"@amykit/plugin-telegram": patch
"@amykit/plugin-terminal": patch
"@amykit/plugin-terminal-conversation": patch
"@amykit/ui": patch
"@amykit/ui-conformance": patch
"@amykit/workflow-errand": patch
"@amykit/workflow-feature-grooming": patch
"@amykit/workflow-note-to-plan": patch
"@amykit/workflow-pull-request": patch
"@amykit/workflow-setup": patch
"@amykit/workflow-testkit": patch
"@amykit/workflow-ticket-to-qa": patch
---

The docs describe the contract that exists. Every README is rewritten against the code: a plugin's README lists the ports, actions, operations, commands, events and environment its package registers, and opens with `amy.about`, a new field in its package.json saying when to use it.
