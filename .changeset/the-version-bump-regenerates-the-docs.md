---
"@amykit/cli": patch
---

The version bump regenerates the documentation, so the release can pass its
own gate.

A release moves two things the generated documentation is derived from: every
package's version, which `docs/manifest.json` carries, and the pending
changesets, which `changeset version` consumes into changelogs.

So the "Version packages" pull request was the one pull request in this
repository that could never be green — the drift check would report
`docs/manifest.json` and `docs/changelog/index.md` as stale, correctly, and
there was no way to fix it by hand that the next bump would not undo.

`release:version` now ends in `npm run docs:generate`. Beyond the gate, it
means the news page ships *with* the release rather than after it: by the time
the version pull request is reviewed, "Coming next" is empty and the changelogs
it describes exist.

The released half still cannot write itself, because a GitHub release does not
exist until the publish has happened. `npm run docs:changelog` after a release
is what fills it, and until it runs the page says so rather than showing
nothing.
