---
base: 330ec3de00869241d24025edbd3b6a6eb5184f53
sources:
  - { id: S1, kind: decision, said: "a nightly release of every package beside the stable one, as t3code ships them, so work on main can be tried while it is built; the update picks its track. Decided 2026-11-05" }
  - { id: S2, kind: reference, ref: "https://github.com/pingdotgg/t3code/blob/main/.github/workflows/release.yml", said: "a cron publishes a nightly only with new commits and 6 hours since the last; version <next patch>-nightly.<date>.<run>, prerelease, npm tag nightly; stable on a tag with npm latest" }
  - { id: S3, kind: decision, said: "a nightly at most every 6 hours, only when main moved since the last one, not on every push. Decided 2026-11-05" }
  - { id: S4, kind: code, ref: ".github/workflows/release.yml", said: "one job on push to main, behind vars.AMY_RELEASE, versions and publishes with changesets/action, provenance on" }
  - { id: S5, kind: reference, ref: "https://changesets.dev/guide/snapshot-releases", said: "changeset version --snapshot then publish --tag, never committed; without --tag a snapshot becomes latest" }
  - { id: S6, kind: decision, ref: ".changeset/config.json", said: "snapshot useCalculatedVersion with template {tag}.{datetime}.{commit}: 0.7.0-nightly.… sorts above 0.6.0 and below 0.7.0, where 0.0.0-nightly would never be taken" }
  - { id: S7, kind: decision, said: "with no pending changeset the nightly job writes a throwaway patch for @amykit/cli; the fixed group carries every public package" }
  - { id: S8, kind: decision, said: "each nightly is a GitHub prerelease, never latest, on its own concurrency group, and skips a push the stable release publishes" }
  - { id: S9, kind: code, ref: "packages/cli/src/update.ts", symbol: "cliIntent", said: "with no pin the intent is latest; releaseFor resolves it with npm view; the update never moves backwards" }
  - { id: S10, kind: decision, said: "autoUpdate.channel: stable | nightly, default stable; nightly resolves both the nightly and latest tags and takes the newer. Decided 2026-11-05" }
  - { id: S11, kind: decision, said: "leaving nightly never downgrades: the machine holds its nightly until a stable passes it; an explicit pin is the only way back sooner" }
  - { id: S12, kind: decision, said: "amy update --channel stable|nightly writes the setting and updates on it" }
touches:
  - .github/workflows/nightly.yml
  - .changeset/config.json
  - scripts/release/nightly-due.ts
  - scripts/check-release-config.ts
  - scripts/release/tests/nightly-due.test.ts
  - packages/cli/src/update.ts
  - packages/cli/src/index.ts
  - packages/cli/src/config.ts
  - packages/cli/src/auto-update.ts
  - packages/cli/tests/update.test.ts
  - packages/cli/tests/auto-update.test.ts
  - packages/cli/tests/update.property.test.ts
  - docs/reference/cli.md
  - docs/start/installation.md
criteria:
  - { id: A1, statement: "the nightly job publishes only when main has commits past the last nightly's and six hours have passed", proof: "deferred:test:scripts/release/tests/nightly-due.test.ts", sources: [S1, S2, S3] }
  - { id: A2, statement: "a nightly dry run versions every public package 0.7.0-nightly.<datetime>.<commit> on the nightly tag, commits nothing, and makes a prerelease not latest", proof: "deferred:test:scripts/release/tests/nightly-due.test.ts", sources: [S4, S5, S6, S7, S8] }
  - { id: A3, statement: "on channel nightly the update takes the newer of the nightly and latest tags; on stable only latest", proof: "deferred:test:packages/cli/tests/update.test.ts", sources: [S9, S10] }
  - { id: A4, statement: "for any installed version and any pair of tags, switching to stable never installs a lower version than the one held", proof: "deferred:property:packages/cli/tests/update.property.test.ts#leaving_nightly_downgrades", sources: [S11] }
  - { id: A5, statement: "amy update --channel nightly writes autoUpdate.channel and the next auto-update follows it", proof: "deferred:test:packages/cli/tests/auto-update.test.ts", sources: [S12] }
crosses:
  - { mechanism: install-and-update, answer: works, proof: "deferred:A3, A4, A5" }
  - { mechanism: config, answer: works, proof: "deferred:A5; channel is a typed key of autoUpdate, refused when it is neither value" }
guarantee:
  - { holds: "a stable install never receives a nightly", not_against: "an operator who pins a nightly version by hand" }
  - { holds: "no nightly is ever tagged latest on npm or on GitHub", not_against: "a person running changeset publish by hand without --tag" }
failures:
  - { step: nightly, when: "the build or tests fail", goes_to: "nothing is published; the next window tries again" }
  - { step: update, when: "the nightly tag does not exist yet", goes_to: "the nightly channel takes latest" }
cut:
  - "unpublishing old nightlies: npm allows it for 72 hours only; they stay"
  - "a nightly on every push: refused (S3)"
exit: "within six hours of a merge to main a nightly of every package is published, a machine on channel nightly installs it at its next due update, and switching it to stable keeps it there until 0.7.0 ships"
---
# A release has a nightly

Trying work on `main` means waiting for a stable release. A nightly every six hours
when `main` moved, on its own npm tag, lets an install follow it by choice.
