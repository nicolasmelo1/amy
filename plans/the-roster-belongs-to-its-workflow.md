---
sources:
  - { id: S1, kind: code, ref: "packages/cli/src/index.ts:266", said: "amy init writes ~/.amy/roster.yaml on every install and ends with 'run amy roster confirm'; the quickstart (docs/start/quickstart.md:33) asks the same of everybody" }
  - { id: S2, kind: code, ref: "packages/cli/src/doctor.ts:195", said: "amy doctor is red until the roster is confirmed for the day, so an errand-only machine fails doctor every weekday morning over reviewers it never assigns" }
  - { id: S3, kind: code, ref: "packages/cli/src/config.ts:149", said: "the Roster type and loader (:435) live in the CLI, a second type copy in packages/workflow-ticket-to-qa/src/roster.ts; hostPlugin.ts hands the roster over as workflow-data because the workflow does not know the file" }
  - { id: S4, kind: reference, ref: "docs/design/nothing-is-installed-by-default.md", said: "config-template.ts:6 imports Roster from @amykit/workflow-ticket-to-qa, putting a workflow package in the CLI's dependencies, which this doc meant to rule out" }
  - { id: S5, kind: reference, ref: "plans/a-plugin-brings-its-own-commands.md", said: "gives the host's command, check and file somewhere else to live; tick discovers first once it folds discover into tick" }
  - { id: S6, kind: decision, said: "ticket-to-qa owns the roster's type, loader, confirmation, amy roster confirm and show, the confirmed-for-today doctor check and the template, as its commands, checks and files" }
  - { id: S7, kind: decision, said: "the workflow reads the roster from its own state directory when a tick needs it, so confirming takes effect without a restart" }
  - { id: S8, kind: decision, said: "the file moves to ~/.amy/<profile>/roster.yaml beside the profile's records and queue, so two ticket-to-qa profiles have two rosters: two teams do not share reviewers" }
  - { id: S9, kind: decision, said: "the CLI loses Roster, loadRoster, confirmRoster, EXAMPLE_ROSTER, paths().roster, the doctor check and hostPlugin's contribution, then hostPlugin itself; config-template.ts stops importing the workflow; a rule keeps packages/cli/src free of 'roster'" }
  - { id: S10, kind: decision, said: "amy update copies ~/.amy/roster.yaml into each profile mounting ticket-to-qa and renames the original roster.yaml.moved, never deleting it" }
  - { id: S11, kind: decision, said: "the quickstart becomes init, add <workflow>, doctor, start: a fresh install has no workflow until add names one, and start's loop discovers every pass; tick stays as a way to watch one move, not a step" }
  - { id: S12, kind: decision, said: "the roster appears in the ticket-to-qa README and in what amy add @amykit/workflow-ticket-to-qa prints when done, where somebody has chosen to work with reviewers" }
  - { id: S13, kind: reference, ref: "plans/the-config-is-written-by-what-is-mounted.md", said: "removing the CLI's imports of the other workflows' types is that plan's work" }
touches:
  - packages/cli/src/index.ts
  - packages/cli/src/config.ts
  - packages/cli/src/doctor.ts
  - packages/cli/src/hostPlugin.ts
  - packages/cli/src/config-template.ts
  - packages/cli/src/paths.ts
  - packages/cli/src/update.ts
  - packages/cli/package.json
  - packages/workflow-ticket-to-qa/src/roster.ts
  - packages/workflow-ticket-to-qa/src/plugin.ts
  - packages/workflow-ticket-to-qa/README.md
  - docs/start/quickstart.md
  - .software-factory/policy.yaml
criteria:
  - { id: A1, statement: "on a machine mounting only the errand, amy init writes no roster, amy doctor is green on a weekday with no roster anywhere, and amy roster does not exist", proof: "deferred:assertion:errand.doctor_is_green_without_a_roster", sources: [S1, S2, S6, S11, S12] }
  - { id: A2, statement: "on a machine mounting ticket-to-qa, amy roster confirm stamps the profile's roster, and the next tick assigns from it without a restart", proof: "deferred:assertion:lifecycle.the_roster_is_the_profiles", sources: [S6, S7, S8] }
  - { id: A3, statement: "amy update on an install with ~/.amy/roster.yaml copies it into every ticket-to-qa profile, keeps the original as roster.yaml.moved, and is a no-op the second time", proof: "deferred:assertion:update.the_roster_moves_into_its_profile", sources: [S10] }
  - { id: A4, statement: "the word roster appears nowhere under packages/cli/src, and the CLI does not depend on @amykit/workflow-ticket-to-qa; its imports of other workflows' types are the config plan's to remove", proof: "deferred:test:mutation fixture for the-host-names-no-roster", sources: [S3, S4, S5, S9, S13] }
crosses:
  - { mechanism: profiles-and-state, answer: works, proof: "deferred:A2, A3" }
  - { mechanism: install-and-update, answer: works, proof: "deferred:A3" }
  - { mechanism: config, answer: works, proof: "deferred:A4" }
failures:
  - { step: "amy doctor", when: "a roster is left at ~/.amy/roster.yaml with no copy in the profile", goes_to: "a red check naming the mv; it is never read silently from there" }
exit: "errand's scenario, installed executable: a fresh install reaches a green amy doctor with no 'roster' in any output. ticket-to-qa's: the roster is the profile's and assigns as before. update's: an old-roster install updates into it. Each gate requires its assertion"
---
# The roster belongs to its workflow

Only `ticket-to-qa` reads the roster, yet the host writes, checks and types it on every install, because the host had nowhere else to put a command, a check or a file.
