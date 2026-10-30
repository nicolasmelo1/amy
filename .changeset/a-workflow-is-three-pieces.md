---
"@amykit/core": minor
"@amykit/cli": minor
"@amykit/workflow-errand": minor
"@amykit/workflow-note-to-plan": minor
"@amykit/workflow-ticket-to-qa": minor
---

Workflows can now declare one decision per diagram state, compose pure
`before` and `after` filters around those decisions, and provide `discover`,
`observe`, `actions`, and `remember` as individual runtime pieces. `extend`
mounts supporting infrastructure from the same declaration. Legacy
`plan`/`runtime` declarations and raw plugins remain supported, while mixing
the legacy and new declaration members is refused at boot.

`amy workflow new` now writes a runnable diagram-backed three-piece workflow.
The shipped errand, note-to-plan, and ticket-to-QA workflows use the new form.
