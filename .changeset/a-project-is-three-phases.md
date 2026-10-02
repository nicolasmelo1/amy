---
"@amykit/cli": patch
"@amykit/core": patch
"@amykit/plugin-file-brief-store": patch
"@amykit/plugin-file-worktree": patch
"@amykit/plugin-slack": patch
---

Let a project keep three phases — `brief/`, `workflow/`, `test/` — that share briefs while keeping state and spending isolated. Every such folder is a phase, a lone `workflow/` included, so its state moves under the project key and nothing is kept from an old profile of the same name. Each phase keeps its own tasks and Slack threads, `amy brief` names the missing `brief/` when a project has none, and `amy stop` signals only the selected phase's daemon without touching the shared handbrake.
