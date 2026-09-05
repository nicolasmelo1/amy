# amy is a machine you leave running

A command you have to remember to type is not a machine, it is a chore with a
binary attached. Three things stood between amy and being left alone, and none
of them was the workflow engine.

**Its memory depended on where you were standing.** State lived in `./.amy`,
so `amy status` answered differently from a different directory — and the
wrong answer was "nothing tracked yet", which is a lie with a plausible
explanation. amy drives work in checkouts all over the disk and is reached
from whichever harness you happen to be in; the one thing it cannot be is
per-directory.

**Nothing kept it going.** `amy run` advanced until nothing was due and then
exited. Every waiting state — a review nobody has done, a question nobody has
answered — ended the process, and the work resumed when a human remembered.
That is the opposite of the promise.

**`amy start` meant the wrong thing.** It released the handbrake. The word
people reach for when they want a machine to begin is `start`, and it was
taken by the least important command in the set.

## What changes

`~/.amy`, once per machine, `AMY_HOME` overriding. State left in a working
directory is reported by `amy doctor` and never adopted: picking it up
silently would restore exactly the behaviour being removed.

`amy start` runs the loop in the background and `amy stop` ends it. The
handbrake becomes `amy pause` and `amy resume`, which is what it always was.
The two are different in a way worth keeping straight: pausing survives a
reboot because it is a file, and stopping does not because it is a process.

`amy workflow list` and `amy workflow rm` make a profile something you can see
and forget. `rm` deletes records, queue and the config entry, and says so
before it does it. **It does not touch the log** — the log is append-only
because the budget is measured off it, so deleting what a workflow spent would
move a ceiling rather than tidy a directory.

`amy skills` installs amy's skills into every harness on the machine. They
ship inside `@amy/cli` for the reason `sf` compiles its own in: a skill that
tells you to run a subcommand your install predates is worse than no skill.

## Why the skills are the shape they are

Six, and each one does something a command cannot. The three that were asked
for and are not here — start, stop, delete — became commands, because a skill
that wraps one command is worse than the command: it is a second thing to keep
in step, and one that silently fails to load looks exactly like one that
loaded and had nothing to say.

What is left is judgement. `/amy-init` interviews. `/amy-workflow`
interrogates a design one question at a time and redraws the machine after
every answer. `/amy-show-me` picks the smallest view that answers the
question. `/amy-status` reorganises the machine's state into the project's
terms, and admits it when the tracker could not be reached.

## Acceptance criteria

- [x] amy answers the same from any directory, and keeps nothing where you
      stand (proof: assertion:installed.keeps_nothing_where_you_stand)
- [x] Its state is one directory per machine, overridable
      (proof: test:packages/cli/tests/home.test.ts)
- [x] State left by the old layout is reported, never adopted
      (proof: test:packages/cli/tests/home.test.ts)
- [x] The loop survives the session that started it, and says so in `status`
      (proof: test:packages/cli/tests/daemon.test.ts)
- [x] A second `amy start` refuses rather than doubling up, and a record left
      by a reboot is not mistaken for a live one
      (proof: test:packages/cli/tests/daemon.test.ts)
- [x] Pausing and stopping are different, and pausing survives a restart
      (proof: assertion:installed.runs_without_a_checkout)
- [x] A hand-written plugin slice keeps the settings it did not mention
      (proof: test:packages/cli/tests/slices.test.ts)
- [x] Forgetting a workflow drops its entry, leaves every other profile
      drivable, and never touches the log
      (proof: test:packages/cli/tests/workflow-rm.test.ts)
- [x] The skills install into every harness found, and are read off disk
      rather than listed in code
      (proof: test:packages/cli/tests/harnesses.test.ts)
- [ ] The loop is proven to survive a machine restart
      (proof: deferred:nothing schedules it at boot yet)

**Exit condition:** `amy start` leaves a loop running that outlives the
terminal and the harness that started it, `amy status` answers the same from
any directory on the machine, `amy skills` puts the skills in front of every
harness installed, and the three commands that used to be skills are commands.
