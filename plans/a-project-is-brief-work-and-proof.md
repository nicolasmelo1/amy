---
base: a4fbbce72037c7983f9046f105be58da7a7f61f0
sources:
  - { id: S1, kind: code, ref: "packages/cli/src/profiles.ts", symbol: "PROJECT_PHASES", said: "a workflow whose folder is brief, workflow or test is a phase of the project its parent folder names, and each phase is a profile of its own" }
  - { id: S2, kind: reference, ref: "docs/design/a-project-is-three-phases.md", said: "each phase runs as its own profile with its own daemon, linked only by a shared brief store, and what test/ drives is still open" }
  - { id: S3, kind: code, ref: "packages/cli/src/profiles.ts", symbol: "missingPhase", said: "the only place a missing phase is noticed is amy brief naming the folder it would need; nothing stops work starting unbriefed or ending unproven" }
  - { id: S4, kind: friction, said: "workflow-personal was designed without its brief and its proof until somebody asked, and a private project runs its brief and its work as two profiles and two daemons. Forgetting a phase is the usual failure" }
  - { id: S5, kind: code, ref: "packages/core/src/calls.ts", symbol: "call", said: "a workflow calls another: the callee runs as a child record, and the caller takes the edge named for the end it reached, folding what it returned" }
  - { id: S6, kind: code, ref: "packages/workflow-pull-request/workflow.mmd", said: "a workflow can be a piece, called and never mounted on its own: it ends as soon as its one job is done, and whatever follows is its caller's" }
  - { id: S7, kind: decision, said: "a project is one workflow: amy derives BRIEF, WORK and PROVE from its folders, each a call to its folder's workflow, and PROVE refused goes back to WORK. Nobody writes the project's diagram. Decided 2026-11-03" }
  - { id: S8, kind: decision, said: "what BRIEF returns is PROVE's input: the criteria the brief settled (product, architecture, code design, performance, interface) are exactly what PROVE is asked to show hold" }
  - { id: S9, kind: decision, said: "test/ becomes prove/: proving a support answer or a proposal may be a person checking, not a script, so the name says what the phase does in any kind of work" }
  - { id: S10, kind: decision, said: "a project declares every phase: its folder, or none with a reason in the project's declaration. A phase neither present nor declared is refused at mount, naming it" }
  - { id: S11, kind: decision, said: "a piece, a workflow only ever called, is never asked for phases, and calling one brings no brief and no proof into its caller" }
  - { id: S12, kind: decision, said: "a project is one profile and one daemon; its phases are child records of the project's record, kept under the project's state, as a call's are" }
  - { id: S13, kind: decision, said: "a packaged workflow mounted on its own is a project too: it declares its phases in its declaration, and the shipped ones declare none for brief and prove, each with its reason" }
  - { id: S14, kind: decision, said: "amy update turns one project's phase profiles into that project's single profile, says so, and moves nothing the second time; what an old phase profile recorded stays on disk, unread" }
  - { id: S15, kind: reference, ref: "plans/grooming-reads-the-sections-its-workflow-declares.md", said: "the brief's sections are the ones its workflow declares, so what a brief settles is the brief workflow's to say" }
  - { id: S16, kind: reference, ref: "plans/a-phase-is-proven-not-asserted.md", said: "what proving a unit means, scenario by scenario; it is what a prove/ workflow runs" }
touches:
  - packages/cli/src/profiles.ts
  - packages/cli/src/slices.ts
  - packages/cli/src/index.ts
  - packages/cli/src/update.ts
  - packages/core/src/define-workflow.ts
  - packages/core/src/calls.ts
  - packages/core/src/mount.ts
  - packages/workflow-errand/src/plugin.ts
  - packages/workflow-note-to-plan/src/plugin.ts
  - packages/workflow-ticket-to-qa/src/plugin.ts
  - .software-factory/evidence/project-phases*
  - .software-factory/policy.yaml
criteria:
  - { id: A1, statement: "a project with brief/, workflow/ and prove/ mounts as one profile whose record walks BRIEF, WORK, PROVE and DONE, each phase a child record", proof: "deferred:assertion:project.the_three_phases_walk_as_one", sources: [S1, S2, S5, S7, S12] }
  - { id: A2, statement: "WORK never starts before BRIEF ends, DONE is never reached before PROVE holds, and PROVE refused returns to WORK naming what did not hold", proof: "deferred:test:packages/cli/tests/project.test.ts", sources: [S3, S4, S7] }
  - { id: A3, statement: "PROVE is handed exactly the criteria BRIEF returned, and a criterion BRIEF settled that PROVE never answers keeps the project from DONE", proof: "deferred:assertion:project.what_was_briefed_is_what_is_proven", sources: [S8, S15, S16] }
  - { id: A4, statement: "a project missing prove/ that does not declare it is refused at mount naming the phase; declared none with a reason, it mounts and amy status shows the reason", proof: "deferred:test:packages/cli/tests/project.test.ts", sources: [S10] }
  - { id: A5, statement: "a project folder named test/ is refused at mount, naming prove/", proof: "deferred:test:packages/cli/tests/project.test.ts", sources: [S9] }
  - { id: A6, statement: "a piece mounts without phases, and a project calling it gains no brief section and no proof criterion from it", proof: "deferred:test:packages/core/tests/calls.test.ts", sources: [S6, S11] }
  - { id: A7, statement: "the shipped errand, note-to-plan and ticket-to-qa declare their phases and walk as their gates prove", proof: "deferred:assertion:project.a_packaged_workflow_declares_its_phases", sources: [S13] }
  - { id: A8, statement: "amy update replaces one project's phase profiles with its single profile, names the change, and moves nothing the second time", proof: "deferred:assertion:update.the_phases_become_one_project", sources: [S14] }
crosses:
  - { mechanism: calls, answer: works, proof: "deferred:A1, A6" }
  - { mechanism: profiles-and-state, answer: works, proof: "deferred:A1, A8" }
  - { mechanism: install-and-update, answer: works, proof: "deferred:A8" }
  - { mechanism: mount-and-capabilities, answer: works, proof: "deferred:A4, A5" }
  - { mechanism: hooks, answer: n/a, why: "before, after and interrupt run around a phase's plan as around any call's; the project adds no hook" }
guarantee:
  - { holds: "no project reaches DONE with a phase that was neither run nor declared absent with a reason", not_against: "a reason that is wrong: a phase declared absent is the person's word, not a proof" }
failures:
  - { step: mount, when: "a project neither has a phase's folder nor declares it absent", goes_to: "refused, naming the phase" }
  - { step: mount, when: "a project folder is named test/", goes_to: "refused, naming prove/" }
  - { step: PROVE, when: "a criterion the brief settled does not hold", goes_to: "WORK, carrying what did not hold" }
cut:
  - "a third party's piece adding sections to its caller's brief or criteria to its proof: pieces bring nothing unasked (S11)"
  - "writing the project's diagram by hand: the folders are the diagram (S7)"
exit: "workflow-personal's shape, brief/, workflow/ and prove/ in one folder, mounts as one profile and walks a row from BRIEF through PROVE; without prove/ and no reason given it is refused at mount, naming the phase"
---
# A project is brief, work and proof

A project was meant to be three phases, and amy only arranges the folders.
Each phase is its own profile with its own daemon, nothing keeps work from starting unbriefed or ending unproven, and `test/` drives nothing.
So the phase people forget is the one amy forgets too.

This makes a project one workflow amy derives from its folders, where what the brief settles is what the proof is asked to show.
