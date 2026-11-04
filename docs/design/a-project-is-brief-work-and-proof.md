# A project is brief, work and proof

A project was meant to be three phases, and amy only arranged the folders:
each phase was its own profile with its own daemon, nothing kept work from
starting unbriefed or ending unproven, and `test/` drove nothing — so the
phase people forgot was the one amy forgot too. This plan makes a project
one workflow amy derives from the project's folders, where what the brief
settled is what the proof is asked to show.

## The delivery

**The folders are the diagram.** A project is the parent directory of a
`brief/`, a `workflow/` or a `prove/` folder: amy scans the sibling folders,
and the walk every project gets is BRIEF, WORK, PROVE, DONE — a `defineWorkflow`
declaration composed in `packages/cli/src/project.ts`, each phase a `call()`
to the workflow its folder exports, the child records the way any call's
are, one profile and one daemon for the whole walk. Nobody binds the calls
by hand and nobody writes the project's `workflow.mmd`: amy derives the
diagram from the folders and the phases' own ends, and the walk's edges are
mechanical — every end of BRIEF goes to the next walking phase, every end of
WORK goes to its next, an end of PROVE named `refused` goes back to the
phase before it, and every other end of PROVE is DONE.

**What BRIEF returned is what PROVE is asked to show.** The composition
folds every phase's return onto the project's record under the phase's own
name, and hands what BRIEF returned as the input of WORK and PROVE wherever
they declare one — the criteria the brief settled, exactly, with no
translation of shape in the middle. A prove whose input schema declares
`criteria` is asked to show the brief's criteria; `refused` folds what did
not hold back onto the record, and the row walks back to WORK carrying it.

**A project declares its phases.** The declaration is the workflow the
config names — the anchor's. Every phase folder present is a phase; a phase
that is gone must carry its reason in the declaration's `phases:` member
(`phases: { prove: "a person reviews this work" }`), which the mounted
workflow carries on itself for `amy status` and `amy doctor` to read. The
shipped `errand`, `note-to-plan` and `ticket-to-qa` declare theirs this way:
they are walks of their own, never projects of the folder kind, and their
phases' absence is a word in their declarations, not a missing folder.

**The refusals name the phase.** A phase neither present nor declared is
refused at the walk's mount, naming the folder. A project whose root carries
a `test/` folder is refused naming `prove/` — the old spelling is gone as
vocabulary, not tolerated beside the new one. A phase folder whose module
does not export a `defineWorkflow` declaration is refused: the walk calls
its phases, and a call needs the declaration a mount does not.

**The config did not change shape.** One entry names one project by any of
its phase folders; a project is one profile, so a config naming one project
as two entries is refused by name — and `amy update`'s migration folds such
a config down to the single entry naming the walk's folder, says every fold,
keeps the original file beside the config, and moves nothing the second
time. A project's state is `projects/<project>/<profile>` — records, queue,
tasks, threads, log, one pid — with the briefs at the project's artifact
root, which the config never names. What an old phase profile recorded stays
on disk, unread.

Core carries the phase vocabulary as a declaration member (`phases:`) and
the composition helpers; it learns no folder, reads no brief, and the
project's derivation is the CLI's. A piece called by a phase is unchanged:
a walk calls it, its ends move the caller only through the edges the caller
drew, and it brings no brief and no proof of its own into its caller.

## Acceptance

- [x] A project with brief/, workflow/ and prove/ mounts as one profile whose
      record walks BRIEF, WORK, PROVE and DONE, each phase a child record
      (proof: assertion:project.the_three_phases_walk_as_one)
      (proof: test:packages/cli/tests/project.test.ts)
- [x] WORK never starts before BRIEF ends, DONE is never reached before PROVE
      holds, and PROVE refused returns to WORK naming what did not hold
      (proof: test:packages/cli/tests/project.test.ts)
- [x] PROVE is handed exactly the criteria BRIEF returned, and a criterion
      BRIEF settled that PROVE never answers keeps the project from DONE
      (proof: assertion:project.what_was_briefed_is_what_is_proven)
      (proof: test:packages/cli/tests/project.test.ts)
- [x] A project missing prove/ that does not declare it is refused at mount
      naming the phase; declared none with a reason, it mounts and amy status
      shows the reason
      (proof: assertion:project.a_declared_absent_phase_says_why_at_the_status)
      (proof: test:packages/cli/tests/project.test.ts)
- [x] A project folder named test/ is refused at mount, naming prove/
      (proof: test:packages/cli/tests/project.test.ts)
- [x] A piece mounts without phases, and a project calling it gains no brief
      section and no proof criterion from it
      (proof: test:packages/core/tests/calls.test.ts)
- [x] The shipped errand, note-to-plan and ticket-to-qa declare the phases
      they do not have, each with its reason, and walk as their gates prove
      (proof: assertion:project.a_packaged_workflow_declares_its_phases)
- [x] A packaged workflow keeps the layout it always had
      (proof: assertion:project.a_packaged_workflow_is_unchanged)
- [x] A phase folder whose module exports no declared workflow is refused by
      its directory
      (proof: assertion:project.a_phase_without_a_workflow_is_refused_by_name)
- [x] The project's state stays the project's: the config names no shared
      directory, and no project state escapes Amy home
      (proof: assertion:project.no_config_names_a_shared_directory)
      (proof: assertion:project.no_phase_state_escapes_home)
- [x] A project never reads the records an old profile of the same name left
      (proof: assertion:project.a_phase_never_reads_an_old_profiles_records)
- [x] amy update replaces one project's phase profiles with its single
      profile, names the change, and moves nothing the second time
      (proof: test:packages/cli/tests/update.test.ts)

**Exit condition:** a project's folders — `brief/`, `workflow/`, `prove/` —
mount as the one profile whose workflow they compose, and a row walks from
BRIEF through PROVE; without `prove/` and no reason given it is refused at
the mount, naming the phase.