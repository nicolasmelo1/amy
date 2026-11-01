# The roster belongs to its workflow

Only `ticket-to-qa` read the roster, yet the host wrote, checked and typed it
on every install, because the host had nowhere else to put a command, a check
or a file. [A plugin brings its own commands](a-plugin-brings-its-own-commands.md)
gave the workflow that somewhere else. What was left for this plan was the
roster on machines that had updated in place: nothing moved an existing team's
list out of the root it had been read from, the workflow's README and `amy
add`'s printout said nothing about the reviewers whose work this is, the
quickstart still taught the old shape, and no gate asked for any of it.

## What shipped

**The move an existing install needed.** `migrateRootFiles` copies a file an
older install kept at the machine root into every profile that reads it now,
retires the old name as `roster.yaml.moved` rather than deleting it, and
changes nothing on the second run. The doctor's red check names the file that
was found there, so a profile without a roster of its own is told where the
original sits and what to run, and the machine never reads the root file
silently.

**The doctor asks the machine, and only the machine.** Running the errand
scenario's `amy doctor` for the first time showed that machine red on every
run — not for the roster, which it does not carry, but for a gate's commands
and the tracker's key that no part of it had mounted. A gate's commands are
now asked of the machines that mounted a gate, and each mounted plugin names,
on the `Plugin` interface, the environment variables it reads
(`plugin.environment`; plugin-linear declares `LINEAR_API_KEY`). A machine
that mounted none of them carries none of those checks — which is the
sentence this plan was written to make true, in the errand's own words.

**A rule and its fixture.** `L0.THE_HOST_NAMES_NO_ROSTER`, a repo-local rule
under `.software-factory/rules/`, keeps the vocabulary the roster moved with
— the file name, the type, the loader, the confirmation, the example, the
check, the command — out of `packages/cli/src` from here on, with
`rosterBackoffMs` named in the rule as the one ceiling the config plan
removes along with the host's whole Policy copy. Its mutation fixture is at
`.software-factory/mutations/L0.THE_HOST_NAMES_NO_ROSTER`, and `sf verify`
proves 50/50 enabled rules fire, the new one included.

**The surfaces that say whose work it is.** The generated READMEs gained a
"What it brings" section rendered from each package's own declarations, so
`@amykit/workflow-ticket-to-qa`'s README states `amy roster`, its check and
its file from the module — `amy add @amykit/workflow-ticket-to-qa` prints the
roster's file arriving beside the profile's records. The quickstart teaches
the machine that exists: init, add a workflow, doctor, start, with `tick` as
the way to watch one move and `stop --all` as the handbrake.

## What the run found

The errand machine's doctor had never been run by a gate before. Its redness
was not the roster's; it was the doctor believing it was a machine's job to
have a gate and a tracker key regardless of what was mounted. That belief
went the way the roster code went: the machine says what it needs, and the
host asks the machine.

The first version of the errand assertion read the whole state tree for any
file carrying the name, and the vendored `dist/roster.js` of every installed
tarball tripped it. What the machine writes is its state — the config, the
profiles, the queue — not what the packages it installed vend, so the claim
is scoped the way the distinction actually runs.

## Acceptance criteria

- [x] On a machine mounting only the errand, `amy init` writes no roster, the
      doctor is green, and no output names one
      (proof: assertion:errand.doctor_is_green_without_a_roster)
- [x] `amy roster` is the workflow's command: unknown on the machine that
      did not mount it
      (proof: assertion:errand.a_command_nothing_mounts_does_not_exist)
- [x] On a machine mounting ticket-to-qa, the roster the confirm stamped is
      the profile's file, and the tick that assigned read it there, without a
      restart between them
      (proof: assertion:lifecycle.the_roster_is_the_profiles)
- [x] `amy update` copies the root roster into every profile mounting
      ticket-to-qa, names the retirement in what it prints, and a second
      update changes nothing
      (proof: assertion:update.the_roster_moves_into_its_profile)
      (proof: assertion:update.the_update_names_the_roster_move)
- [x] `packages/cli/src` names the roster only where the config plan's Policy
      copy still carries `rosterBackoffMs`; the rule fires on its fixture
      (proof: test:.software-factory/mutations/L0.THE_HOST_NAMES_NO_ROSTER)

**Exit condition:** the errand's scenario, on the installed executable: a
fresh install reaches a green `amy doctor` with no roster in any output.
ticket-to-qa's: the roster is the profile's and assigns as before.
amy-update's: an install with a root roster updates into the profile's. Each
gate requires its assertion, and the rule's fixture fires.