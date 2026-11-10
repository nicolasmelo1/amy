---
base: 056aab596f296d6f797a417ae3ea1d660bc53e4a
sources:
  - { id: S1, kind: friction, said: "2026-11-10: pull request #189 took 23 commits and 76 review findings; its plan touched 16 paths and its delivered note lists 47, each missing one found while executing" }
  - { id: S2, kind: friction, said: "2026-11-10: three #189 findings were commands the work assumed wrongly: there is no amy plugin add, and amy workflow add requires --into" }
  - { id: S3, kind: friction, said: "2026-11-08: the delivered a-phase-is-proven-not-asserted carries 28 deviations, each a change to the plan made while executing it" }
  - { id: S4, kind: decision, said: "plans are groomed by models far more capable than the ones executing them, so execution sticks to the plan; decided 2026-11-10" }
  - { id: S5, kind: decision, said: "while a plan executes, its declaration changes only mechanically: moving to docs/design, a criterion marked done, deferred: dropped from a proof; anything else is groomed again; decided 2026-11-10" }
  - { id: S6, kind: decision, said: "a groomed plan is checked against the code it was read at: the commands it names exist, its touches are exact paths with no ** and no repeats, its proofs are there or touched; decided 2026-11-10" }
  - { id: S7, kind: decision, said: "these gates are local to amy, run by npm run check:plans, and software-factory is not changed for them; decided 2026-11-10" }
  - { id: S8, kind: code, ref: "scripts/check-plan-board.ts", said: "npm run check:plans already runs in the pre-commit hook, in CI and in npm run gate, so a check added to it runs everywhere a plan is judged" }
  - { id: S9, kind: code, ref: "scripts/docs/sources/cli.ts", symbol: "cliFacts", said: "every command the CLI declares, with its options, is already read out of packages/cli/src/index.ts, but only from the working tree" }
  - { id: S10, kind: reference, ref: "CONTRIBUTING.md", said: "once a plan's file is in the change it is in flight, and a file the change edits outside touches may be named under deviations" }
  - { id: S11, kind: decision, said: "a grooming commit touches only plans/ and the mechanism catalog, docs/mechanisms.yaml, which plans are read against; the first commit touching anything else starts execution; decided 2026-11-10" }
touches:
  - scripts/check-plan-board.ts
  - scripts/plans/held.ts
  - scripts/plans/authored.ts
  - scripts/plans/history.ts
  - scripts/plans/tests/held.test.ts
  - scripts/plans/tests/authored.test.ts
  - scripts/plans/tests/history.test.ts
  - scripts/docs/sources/cli.ts
  - CONTRIBUTING.md
criteria:
  - { id: A1, statement: "a commit that changes a plan's declaration and any path outside plans/ and docs/mechanisms.yaml is refused, naming the commit and the plan", proof: "test:scripts/plans/tests/held.test.ts", sources: [S4, S11], done: true }
  - { id: A2, statement: "after a change's first commit outside plans/ and docs/mechanisms.yaml, any later non-mechanical change to a plan's declaration is refused, even in a grooming commit, and the refusal says to groom it again", proof: "test:scripts/plans/tests/held.test.ts", sources: [S3, S4, S5], done: true }
  - { id: A3, statement: "moving a plan to docs/design, marking a criterion done, dropping deferred: from a proof, and pointing a source at the delivered note of a plan moved in that change pass", proof: "test:scripts/plans/tests/held.test.ts", sources: [S5], done: true }
  - { id: A4, statement: "uncommitted changes in the working tree are judged as one more commit after the last one", proof: "test:scripts/plans/tests/held.test.ts", sources: [S7, S8], done: true }
  - { id: A5, statement: "a plan groomed in the change is refused for a touches entry with **, an entry listed twice, or a path absent at the base whose directory neither exists there nor holds another entry", proof: "test:scripts/plans/tests/authored.test.ts", sources: [S1, S6], done: true }
  - { id: A6, statement: "a plan groomed in the change is refused for a criterion whose proof cites a file that neither exists at the base nor is in its touches", proof: "test:scripts/plans/tests/authored.test.ts", sources: [S6], done: true }
  - { id: A7, statement: "a plan groomed in the change is refused for an amy command, or an option of one, the CLI at the base does not declare, unless one of its criteria names it", proof: "test:scripts/plans/tests/authored.test.ts", sources: [S2, S6, S9], done: true }
  - { id: A8, statement: "the change is read against origin/main, else main: its commits, the paths each touched, each plan's declaration at each, and the CLI and file list at the base", proof: "test:scripts/plans/tests/history.test.ts", sources: [S7, S8, S10], done: true }
crosses:
  - { mechanism: status, answer: n/a, why: "the board's renderer, packages/cli/src/plan-board.ts, is unchanged; the new checks read plans beside it in scripts/" }
guarantee:
  - { holds: "a plan's declaration does not move non-mechanically once its change has touched anything outside what grooming touches", not_against: "history rewritten before it is pushed, which the gate cannot tell from grooming" }
  - { holds: "a groomed plan names only commands, options and paths that exist at its base or that it says it creates", not_against: "a command that exists but does something other than the plan assumes" }
failures:
  - { step: grooming, when: "a touches entry, proof or command does not hold at the base", goes_to: "check:plans refuses the change, naming the plan, the field and the entry" }
  - { step: executing, when: "the plan turns out to be wrong", goes_to: "check:plans refuses the declaration change; the plan is groomed again from main before execution resumes" }
  - { step: reading, when: "neither origin/main nor main resolves", goes_to: "check:plans fails saying which refs it tried" }
cut:
  - "rewriting software-factory's L4 rule or its deviations key: the gate is local to amy (S7)"
  - "judging plans the change does not groom: an existing plan is held to these rules the next time it is groomed"
  - "telling which model wrote a commit: the commit's paths are what is enforced, not its author"
exit: "a change that moves a plan's touches while editing code is refused by npm run check:plans, and a plan naming a command the CLI lacks cannot be committed"
---
# A plan is held to what it said

Grooming is done by the most capable model, so execution follows the plan
rather than editing it: a declaration moves only mechanically once code moves,
and a plan is checked against the code it was read at before anyone builds it.
