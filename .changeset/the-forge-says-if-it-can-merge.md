---
"@amykit/core": minor
---

The forge says whether it can merge, whether its checks passed, and what is
waiting on you.

Three things the forge always knew and nothing here could ask it. Each one is
a `CodeHost` question, so any workflow gets them and none of them is the
ticket workflow's private vocabulary.

**`checks`** — what CI says about the head, and the commit it says it about.
Carried with the sha for the same reason a review carries one: a green rollup
from three pushes ago says nothing about what is there now. `none` is a
separate answer from `failing`, because a repository that runs no checks
reports exactly that, and a machine reading it as "not passing" would hold
every pull request for a verdict nobody is coming to give. Seen in the wild on
a release pull request whose workflows are all skipped.

**`mergeState`** — `conflicting`, `behind`, `mergeable` or `unknown`. Only the
states a workflow can act on itself, plus not-yet-known, because the forge
works a merge out asynchronously and guessing either way is how a branch gets
handed over as mergeable before anybody knows. Everything else a forge reports
here is already carried by `reviewDecision` and `checks`, and a second name for
it would be two fields free to disagree.

**`reviewsRequestedOf(login, repos)`** — the open pull requests waiting on one
person. `reviewLoad` counts; it does not say which, and the second cannot be
derived from the first. Scoped to the repositories given, and an empty list is
nothing to search rather than everything: a forge search runs across the
account, so an unscoped one returns work from every repository the credential
can see.

**Nothing is offered to a reviewer that the forge already says is broken.**
Red checks, a conflict, or a branch sitting on a base it has moved off now go
back to the ticket's owner instead of onto somebody's pile. Review time is the
one currency here nobody can top up — the reason the per-reviewer ceiling
exists — and a reading of a branch about to change is a reading done twice.
A verdict still running is waited for, bounded by the same ceiling the local
gate answers to, because a check that is configured and never reports would
otherwise be a ticket that stops with nobody told.
