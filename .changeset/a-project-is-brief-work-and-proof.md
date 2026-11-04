---
"@amykit/cli": minor
"@amykit/core": minor
"@amykit/workflow-errand": minor
"@amykit/workflow-note-to-plan": minor
"@amykit/workflow-ticket-to-qa": minor
---

**A project is brief, work and proof.** The `brief/`, `workflow/` and
`prove/` folders of a project compose the one workflow its config entry
drives: each phase a `call()` to the `defineWorkflow` declaration its folder
exports, walked as child records of one record, one profile and one daemon
for the whole walk. The brief's own declared sections give the walk its
vocabulary, what the brief workflow returned is what the proving workflow is
handed as its input exactly, and an end named `refused` carries the row back
to WORK, saying what did not hold. A phase neither present nor declared
absent is refused at the walk's mount, naming it; a phase declared absent
carries its reason on the workflow for `amy status` to show; a `test/`
folder is told the phase is named `prove/`.

`defineWorkflow` gains the optional `phases` member — one reason per
declared-absent phase — which the plugin carries beside its workflow; the
shipped `errand`, `note-to-plan` and `ticket-to-qa` declare brief and prove
out with their reasons, and every other package is unchanged. A project's
queue, records, tasks, threads and log live under
`projects/<project>/<profile>` with its briefs under the project's shared
artifact root; the per-phase layout of an older machine stays on disk,
unread, and `amy update` folds a config that named one project as three
phase profiles into its single project profile, saying every fold and
moving nothing the second time.