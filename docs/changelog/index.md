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

### **Claude says its limit while it runs.** The harness spotted a quota only from a 429 in the final envelope, and never knew when it reset. It now reads Claude Code's stream: a rejected `rate_limit_event` makes the run `rate-limited` with the reset it reported, so the workflow waits for that reset instead of charging an attempt.

`minor` · `@amykit/plugin-claude`



### The examples in the docs, the tests and the prove plugin's help name tickets `PROJ-`, the placeholder the rest of the suite already used. A private term can now be denied as a whole word, so a three-letter key is caught in `XYZ-12` without also firing on every identifier that contains those letters.

`patch` · `@amykit/cli`, `@amykit/core`, `@amykit/plugin-prove`



### **A skill reaches every harness.**

`minor` · `@amykit/agent-kit`, `@amykit/core`, `@amykit/plugin-agent-relay`, `@amykit/plugin-codex`, `@amykit/plugin-hermes-agent`

A step's skill was lent only to Claude; Codex received `/name` with nothing
behind it and Hermes refused the turn. Codex now runs under a fresh `HOME` that
holds only the lent skill, and names it explicitly on `turn/start`; Hermes
passes `-s <name>` with amy's skill root named in the profile's
`skills.external_dirs`, and both declare `lendsSkill`. The relay never sends a
skill's name to a rung it did not hand the skill to, a ladder that could reach
such a harness is refused at boot, and the conformance suite fails a harness
that answers a skill turn without declaring it. Codex and Hermes are held to
their pinned CLI contracts, vendored beside the doubles.

### **A ticket reads the brief its project judged.**

`minor` · `@amykit/core`, `@amykit/workflow-ticket-to-qa`

`briefOf` resolves the brief a unit is worked against: the one stored under
the unit's own id first, the tracker's `briefId` after. Triage, self-review,
the question triage appends and a project's GROOMED gate read that one brief,
so a unit groomed for itself is worked against what the gate judged.

### **Claude's usage is read without its token.** The usage reader took Claude Code's OAuth token from the environment, `~/.claude/.credentials.json` or the macOS Keychain and called an undocumented endpoint. It now asks Claude Code itself for `get_usage` over a short-lived print-mode child: no model call, no credential of the operator's, and a runner without a managed spawn reads as unavailable.

`minor` · `@amykit/plugin-claude`



### **The gate notices code nothing reaches, and code written twice.** `tsc` now runs with `noUnusedLocals` and `noUnusedParameters`, and the gate reads both detectors through one step: `knip --production`, where a test no longer counts as a caller, and `jscpd` over packages, plugins and examples. What the tree already carried is frozen by name in a ratchet with a date it comes due, so the next unused export or copied block fails instead of joining the pile. The unused parameters and the one unread private field this change exposed are gone.

`patch` · `@amykit/cli`, `@amykit/core`, `@amykit/plugin-claude`, `@amykit/plugin-file-worktree`, `@amykit/workflow-setup`



### **Every claim and every path agrees.** A stale daemon update claim is taken through the one lock and recovered once. A worktree's meta is replaced whole, never edited in place. A long Slack post is split at 4,000 characters and arrives in order. `AMY_HOME` means the same to the Windows launcher and to `amy stop`. The doctor and the manager read one workspace parser, an empty `workspaceRoot` is refused at boot, and a child record speaks in its unit's thread.

`patch` · `@amykit/cli`, `@amykit/core`, `@amykit/plugin-file-worktree`, `@amykit/plugin-slack`



### **Nothing a process writes is lost to another, and no call waits forever.**

`patch` · `@amykit/cli`, `@amykit/core`, `@amykit/plugin-agent-relay`, `@amykit/plugin-file-brief-store`, `@amykit/plugin-file-store`, `@amykit/plugin-linear`, `@amykit/plugin-prove`, `@amykit/plugin-slack`, `@amykit/plugin-telegram`, `@amykit/workflow-errand`, `@amykit/workflow-note-to-plan`

`amy run` now discovers before it ticks, through the same pass `amy tick` and the
daemon use, so a ticket sitting in the world is picked up on the first pass. One
transport in core gives every request a deadline and counts the body as it
arrives; Slack, Linear, Telegram and the models.dev refresh go through it. One
atomic write stages under a name only its writer holds, and notes, tasks and
records use it: two writers at one instant both survive, and `amy look` changes
a record under its own lock instead of overwriting the engine's move. The
Telegram bot takes core's lock, so a stale one is buried through a tombstone
rather than renamed aside by two processes at once. `config explain`, `workflow
check` and `workflow export` build their resolver with the profile they act for,
so a fork is what they read. Three repo-local rules keep each class out: a bare
`fetch`, a hand-built `.tmp` name and a resolver without its profile.

### **The review and an in-flight question read the brief the unit was worked with.**

`patch` · `@amykit/workflow-ticket-to-qa`

The self-review lane resolves the brief under the unit's work id, not the
ticket's, so a ticket worked in one of several repositories reviews against
the same brief triage read and labels it as its own. A record triaged before
triage kept the brief it read appends its question to the brief the current
look resolved, instead of appending nowhere.

### **The review is handed the unit's work id.**

`patch` · `@amykit/workflow-ticket-to-qa`

A project's phase record is named for the call (`PROJ-1239/WORKFLOW#1`), and
the self-review lane was reading the brief under that id, which a brief store
refuses for its slash. The lane now receives the unit's work id and resolves
the brief there, so a project's review reads what triage read and labels it
the brief the ticket is worked against.

### **The work phase reads its project's brief.**

`patch` · `@amykit/cli`, `@amykit/core`, `@amykit/workflow-ticket-to-qa`

A project's phase folders now decide which phases run, so a workflow that
declares its own brief phase absent can still be the work phase of a project
that grooms one. Triage records the brief its prompt was built from and
appends its question there, a unit's brief is read under its work id even when
the ticket spans repositories, prompts name the brief as the one the ticket is
worked against, and `briefOf` names the id whose read failed.

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
