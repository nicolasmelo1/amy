---
"@amykit/core": patch
"@amykit/cli": patch
"@amykit/plugin-claude": patch
"@amykit/plugin-codex": patch
"@amykit/plugin-hermes-agent": patch
"@amykit/plugin-command-gate": patch
"@amykit/plugin-plan-check": patch
"@amykit/plugin-file-worktree": patch
"@amykit/plugin-github": patch
"@amykit/workflow-ticket-to-qa": patch
"@amykit/workflow-note-to-plan": patch
"@amykit/workflow-errand": patch
---

A base branch per repository.

`baseBranch:` maps a repository to its own base branch beside `defaultBranch`,
which keeps its name and stays the fallback; a config without the block
resolves exactly as before. The map rides `pluginSlices` to every reader of
the layout — the harnesses, the gate, the worktree manager, whose trees are
cut from the mapped branch, and the workflows, which resolve the repository's
own base where the piece of work is known — and the pull request each workflow
opens is told that base by name, falling back to the forge's own default when
nothing was named.