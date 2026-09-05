---
"@amykit/core": minor
---

Friction becomes a plan, and the queue stops needing a ticket.

Two contracts move into the core, because neither of them ever named a domain.
`CodeHost` and the pull request view it returns — a repository, a branch, a
login — leave `@amykit/workflow-ticket-to-qa`, so one mounted `@amykit/plugin-github`
now serves any workflow. `Harness` joins them: a prompt, a directory, and an
account of what the answer cost. The harness plugins contribute the bare CLI
alongside their ticket-shaped agent, and `@amykit/plugin-agent-relay` mounts both
halves behind the one `agent` port, so a second workflow's own prompts climb
the same ladder, under the same ceiling, in the same log.

`@amykit/workflow-note-to-plan` is that second workflow, and it is the proof the
plugin model was waiting for: it runs on `@amykit/plugin-serial-engine`
unmodified. Going through the seam found one defect in it — every workflow
runtime re-ran `applyPlan`, which the engine had already run, so every retry
was counted twice and every move wrote a transition from a state to itself. A
ceiling of three implement attempts was really one and a half. Fixed, and both
end-to-end scenarios still pass unchanged.

For anyone driving this from a config: `@amykit/plugin-file-queue` and
`@amykit/plugin-file-store` gained a `directory` setting, so two workflows can
share one `.amy` without reading each other's work. `Announcement` gained an
optional `kind` — `failing`, `gave-up` or `recovered` — so a channel can tell
a step that failed once from a machine that has stopped.

For anyone typing at it: `amy note "..."` writes a piece of friction down and
queues it, `.amy/notes/` is watched for the longer ones, and
`amy --workflow note-to-plan tick` drives them to a pull request adding a plan
to the repository the friction is about. Nothing in that path touches a
tracker.
