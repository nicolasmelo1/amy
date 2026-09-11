---
title: News
description: What shipped, and what is about to.
group: News
order: 1
---

# News

Every release, and everything written down and not released yet.

The released half comes from the releases on GitHub, cached into this repository
so that building the documentation never needs a network. The unreleased half
comes from the changesets in the working tree, which is the only one of the two
that exists before a release does.

```sh
npm run docs:changelog     # refresh the cache from GitHub
```

## Coming next

<!-- amy:generated changelog-unreleased -->

### The ticket's description reaches the agent's prompt, instead of an instruction to go and read a page it cannot open.

`patch` · `@amykit/agent-kit`, `@amykit/plugin-linear`, `@amykit/workflow-ticket-to-qa`

`ISSUE_FIELDS` asked Linear for `id`, `identifier`, `title`, `url`,
`branchName`, `state` and `team` — not `description` — so `Ticket` had no body
and never could have one. `triage` and `implement` then built their prompts
from the title and the tracker URL, and told the agent to "read the ticket":
an instruction nothing under `claude -p` could obey, with no credential and no
browser. The visible failure was an honest refusal; the expensive one was a
ticket whose title sounded sufficient producing a full implementation that
never saw the description's acceptance criteria, its named file, or the
ownership boundary written in it — on an install where that duplicated an open
pull request, 8 files and +615 lines on a 2-point ticket.

Now the fetch asks for `description`, `toTicket` maps it to `body` (absent
stays absent — an empty description is a real state, not an error), and the
prompts carry the body where the work is judged by it. A ticket with no body
says `(this ticket has no description)` rather than looking truncated, which is
what lets the agent ask for one instead of inventing one. A tracker that
supplies no body is unaffected: the field is optional and the prompt names the
case it is in.

<!-- amy:end changelog-unreleased -->

## Released

<!-- amy:generated changelog-releases -->

No release has been cut yet. The release workflow is deliberately dormant until
somebody arms it, so this is the truth rather than a fetch that failed —
see [the release path](../development/releasing.md).

<!-- amy:end changelog-releases -->

## Per-package changelogs

Each package carries its own `CHANGELOG.md`, written by `changeset version`. The
news above is the whole workspace; a package's own file is the one to read when
you depend on exactly that package.

## How a change gets here

Every change a user would notice needs a changeset:

```sh
npm run changeset
```

Written for somebody reading it six months from now: **what changed, and why it
was wrong before.** A changelog entry that says what the diff says is one nobody
gains anything from reading.

See [Releasing](../development/releasing.md).
