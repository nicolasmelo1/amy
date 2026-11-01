---
base: 4cd497f6e598e44e03d7fe7e39ea3da1ed74e723
sources:
  - { id: S1, kind: code, ref: "packages/cli/src/plugin-commands.ts", symbol: [gather, writeFiles], said: "the host imports every package some profile mounts and writes what each brings into the profile's state directory, so init and add write no roster on a machine that mounted none: the file is the mounted workflow's now" }
  - { id: S2, kind: code, ref: "packages/workflow-ticket-to-qa/src/plugin.ts", symbol: [rosterCommand, rosterCheck], said: "amy roster confirm and show are the workflow's own commands and the roster's doctor check is the workflow's check, which amy doctor runs beside its own check, labelled with the package" }
  - { id: S3, kind: code, ref: "packages/cli/src/config.ts", symbol: [Policy, DEFAULT_POLICY], said: "the host still carries `rosterBackoffMs` among the lifecycle ceilings of its own Policy copy, and the template explains the name in the same breath; removing that copy is the config plan's work, named at its S3 and S11" }
  - { id: S4, kind: reference, ref: "docs/design/nothing-is-installed-by-default.md", said: "putting a workflow package in the CLI's dependencies for the sake of one type is what this doc rules out, and the template imports no workflow today; the CLI's manifest carries no ticket-to-qa dependency" }
  - { id: S5, kind: reference, ref: "docs/design/a-plugin-brings-its-own-commands.md", said: "delivered the mechanism the host lacked: a plugin's own commands, checks and files, with double ownership refused at load, and tick looking before it moves" }
  - { id: S6, kind: decision, said: "ticket-to-qa owns the roster's type, loader, confirmation, amy roster confirm and show, the confirmed-for-today doctor check and the template, as its commands, checks and files" }
  - { id: S7, kind: decision, said: "the workflow reads the roster from its own state directory when a tick needs it, so confirming takes effect without a restart" }
  - { id: S8, kind: decision, said: "the file moves to ~/.amy/<profile>/roster.yaml beside the profile's records and queue, so two ticket-to-qa profiles have two rosters: two teams do not share reviewers" }
  - { id: S9, kind: decision, said: "packages/cli/src holds none of the roster: no Roster type, loader, confirmation, example, doctor check, command or file path, and no dependency on the workflow that has them" }
  - { id: S10, kind: decision, said: "amy update copies ~/.amy/roster.yaml into every profile mounting ticket-to-qa, renames the original to roster.yaml.moved rather than deleting it, and does none of it a second time; a profile without its copy is told the original's name" }
  - { id: S11, kind: decision, said: "the quickstart becomes init, add <workflow>, doctor, start: a fresh install has no workflow until add names one, and start's loop discovers every pass; tick stays as a way to watch one move, not a step" }
  - { id: S12, kind: decision, said: "the roster appears in the ticket-to-qa README and in what amy add @amykit/workflow-ticket-to-qa prints when done, where somebody has chosen to work with reviewers" }
  - { id: S13, kind: reference, ref: "plans/the-config-is-written-by-what-is-mounted.md", said: "removing the CLI's imports of the other workflows' types is that plan's work, and the host's Policy copy with its `rosterBackoffMs` ceiling is inside it" }
  - { id: S14, kind: decision, said: "the CLI's comments that name the roster's old home are reworded away, and the surviving `rosterBackoffMs` ceiling is the config plan's to remove; a rule with its mutation fixture keeps the rest from ever coming back" }
touches:
  - packages/cli/src/plugin-commands.ts
  - packages/cli/src/index.ts
  - packages/cli/src/config-template.ts
  - packages/workflow-ticket-to-qa/src/roster.ts
  - packages/workflow-ticket-to-qa/tests/plugin.test.ts
  - packages/workflow-ticket-to-qa/README.md
  - packages/cli/tests/update.test.ts
  - .software-factory/rules/
  - .software-factory/mutations/
  - .software-factory/policy.yaml
  - .software-factory/evidence/errand/drive.ts
  - .software-factory/evidence/ticket-to-qa/drive.ts
  - .software-factory/evidence/amy-update-scenario.sh
  - .software-factory/evidence/amy-update/machine.ts
  - docs/start/quickstart.md
  - docs/design/the-errand-is-proven-end-to-end.md
  - docs/design/the-lifecycle-is-proven-end-to-end.md
  - docs/design/amy-update.md
  - scripts/docs/
criteria:
  - { id: A1, statement: "on a machine mounting only the errand, amy init writes no roster, amy doctor is green on a weekday with no roster anywhere, and amy roster does not exist", proof: "deferred:assertion:errand.doctor_is_green_without_a_roster", sources: [S1, S2, S6, S11, S12] }
  - { id: A2, statement: "on a machine mounting ticket-to-qa, amy roster confirm stamps the profile's roster, and the next tick assigns from it without a restart", proof: "deferred:assertion:lifecycle.the_roster_is_the_profiles", sources: [S6, S7, S8] }
  - { id: A3, statement: "amy update on an install with ~/.amy/roster.yaml copies it into every ticket-to-qa profile, keeps the original as roster.yaml.moved, and is a no-op the second time", proof: "deferred:assertion:update.the_roster_moves_into_its_profile", sources: [S10] }
  - { id: A4, statement: "the word roster appears nowhere under packages/cli/src except the one ceiling its Policy copy carries, `rosterBackoffMs`, which the config plan removes; and the CLI does not depend on @amykit/workflow-ticket-to-qa", proof: "deferred:test:mutation fixture for the-host-names-no-roster", sources: [S3, S4, S5, S9, S13, S14] }
crosses:
  - { mechanism: profiles-and-state, answer: works, proof: "deferred:A2, A3" }
  - { mechanism: install-and-update, answer: works, proof: "deferred:A3" }
  - { mechanism: config, answer: works, proof: "deferred:A4" }
failures:
  - { step: "amy doctor", when: "a roster is left at ~/.amy/roster.yaml with no copy in the profile", goes_to: "a red check naming the mv; it is never read silently from there" }
exit: "errand's scenario, installed executable: a fresh install reaches a green amy doctor with no 'roster' in any output. ticket-to-qa's: the roster is the profile's and assigns as before. update's: an old-roster install updates into it. Each gate requires its assertion"
---
# The roster belongs to its workflow

Only `ticket-to-qa` reads the roster, yet the host wrote, checked and typed it on every install, because the host had nowhere else to put a command, a check or a file. That somewhere else now exists: [a plugin brings its own commands](../docs/design/a-plugin-brings-its-own-commands.md) gave a workflow its own commands, checks and files, and the host's roster code went with it — what is left is the old rosters on machines that updated in place, the roster's absence of a home in the README, and the quickstart still teaching the old shape.