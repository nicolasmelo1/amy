# The roster belongs to its workflow

Only `ticket-to-qa` reads the roster: it assigns reviewers and hands work to
QA. Yet the roster belongs to the host:

- `amy init` writes `~/.amy/roster.yaml` on every install
  (`packages/cli/src/index.ts:266`) and ends with "run `amy roster confirm`".
  The quickstart asks the same of everybody (`docs/start/quickstart.md:33`).
- `amy doctor` is red until the roster is confirmed for the day
  (`packages/cli/src/doctor.ts:195`). A machine that drives only the errand
  therefore fails `doctor` every weekday morning over reviewers it will never
  assign.
- The `Roster` type and its loader live in the CLI
  (`packages/cli/src/config.ts:149`, `:435`), and a second copy of the type
  lives in the workflow (`packages/workflow-ticket-to-qa/src/roster.ts`). The
  host hands the roster over through a `workflow-data` contribution
  (`packages/cli/src/hostPlugin.ts`) because the workflow does not know where
  the file is.
- The boot check for the config template imports `Roster` from
  `@amykit/workflow-ticket-to-qa` (`packages/cli/src/config-template.ts:6`).
  That puts a workflow package in the CLI's dependencies, which
  [nothing is installed by default](../docs/design/nothing-is-installed-by-default.md)
  meant to rule out.

The host carries this because it had nowhere else to put a command, a check or
a file. [A plugin brings its own commands](a-plugin-brings-its-own-commands.md)
gives it that place.

## What changes

**`ticket-to-qa` owns all of it.** The roster's type, its loader, its
confirmation, `amy roster confirm` and `amy roster show`, the "confirmed for
today" doctor check and the template move into
`@amykit/workflow-ticket-to-qa`, as its `commands`, `checks` and `files`. The
workflow reads the roster from its own state directory when a tick needs it,
so confirming still takes effect without a restart.

**The roster file moves next to the workflow's state.** It is now
`~/.amy/<profile>/roster.yaml`, beside that profile's records and queue. Two
ticket-to-qa profiles can therefore have two rosters, which is correct: two
teams do not share reviewers.

**The host stops knowing the word.** The CLI loses `Roster`, `loadRoster`,
`confirmRoster`, `EXAMPLE_ROSTER`, `paths().roster`, the doctor check and
`hostPlugin`'s contribution. With nothing left to contribute, `hostPlugin`
goes too. `config-template.ts` stops importing the workflow. A grep for
`roster` under `packages/cli/src` comes back empty, and a rule keeps it that
way.

**`amy update` moves an existing roster, once.** An install that has
`~/.amy/roster.yaml` gets a copy in each profile that mounts ticket-to-qa, and
the original is renamed `roster.yaml.moved` rather than deleted. A roster left
at the old place, with no copy in the profile, is a red `doctor` check that
names the `mv`. It is never read silently from there.

**The quickstart loses a step.** It becomes `init`, `add <workflow>`,
`doctor`, `start`: a fresh install has no workflow until `add` names one, and
`start` is the normal path because its loop already discovers on every pass.
`tick` stays in the quickstart as the way to watch one move before trusting
the loop, not as a step it needs; it discovers first once
[a plugin brings its own commands](a-plugin-brings-its-own-commands.md) folds
`discover` into it. The roster appears in the ticket-to-qa README and in what
`amy add @amykit/workflow-ticket-to-qa` prints when it finishes, because that
is the point where somebody has chosen to work with reviewers.

## Acceptance criteria

- [ ] On a machine that mounts only the errand, `amy init` writes no roster,
      `amy doctor` is green on a weekday with no roster anywhere, and
      `amy roster` does not exist
      (proof: deferred:assertion:errand.doctor_is_green_without_a_roster)
- [ ] On a machine that mounts ticket-to-qa, `amy roster confirm` stamps the
      profile's roster, and the next tick assigns from it without a restart
      (proof: deferred:assertion:lifecycle.the_roster_is_the_profiles)
- [ ] `amy update` on an install with `~/.amy/roster.yaml` copies it into every
      ticket-to-qa profile, keeps the original as `roster.yaml.moved`, and is a
      no-op the second time
      (proof: deferred:assertion:update.the_roster_moves_into_its_profile)
- [ ] The word `roster` appears nowhere under `packages/cli/src`, and the CLI
      does not depend on `@amykit/workflow-ticket-to-qa`. Its imports of the
      other workflows' types are
      [the config is written by what is mounted](the-config-is-written-by-what-is-mounted.md)'s
      to remove
      (proof: deferred:test:mutation fixture for the-host-names-no-roster)

**Exit condition:** in the errand's scenario, through the installed
executable, a fresh install reaches a green `amy doctor` without the word
"roster" in any output. In the `ticket-to-qa` scenario, the roster is the
profile's and assigns reviewers as before, and in `amy update`'s scenario an
install with the old roster updates into that shape. Each of the three gates
requires its assertion.
