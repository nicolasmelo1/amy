# Grooming reads the code it is about

A grooming run produced fourteen tickets for one feature. Six were cancelled —
none in the backlog, every one after code had been written, three of them after
a human had reviewed a pull request. The reasons, in the closer's words: *"already
done by … on …"*, *"we really don't need to persist anything on our side"*,
*"descoped, reconciliation will use the separate backend totals only"*.

Two of those, possibly three, are answerable by reading the repository. None of
them is answerable by reading the tracker, the designs or the product ticket —
which is everything a grooming step can see today.

## Why the brief does not close this

The brief shipped the channel: opaque sections, revision, membership, delivery
into every later prompt. It closes the defect it was filed for, a requirement
with no source. It does not close this one, because every cancelled ticket
*had* a source and the source was correct. What was missing was never in the
text. It was in the repository.

A grooming step has no checkout. The path is resolved for a work item that
exists, and grooming runs *before* the work items exist — it is what produces
them. No item, no branch, no tree, nothing to read.

## The two preconditions have shipped

`checkouts:` is a map rather than a shared parent, and each repository names its
own base branch. Grooming needs both and invents neither: it resolves the
checkout the same way a work item does, and it reads the **base branch** rather
than whatever the working tree is on. A step that groomed against somebody's
half-finished branch would answer "does this already exist" with that branch's
private state, which is worse than not asking.

What is new is only that the resolution happens for something that is not a
work item.

## Read-only, and it matters here

Grooming receives one `BaseSourceSnapshot` per named repository. It is given no
checkout path, branch, commit or worktree: the narrow source port reads Git
objects at `origin/<configured-base>` and exposes only `read()`. It therefore
cannot repoint the standing checkout, create a branch, commit or acquire a
worktree; the proof reads a base-only file while the standing tree remains on a
private branch.

The tracker is also a capability rather than a ticket-to-QA detail:
`GroomingTracker` reads features and reconciles only work tagged with its own
`groomedBy` provenance. A rerun cannot retire a human-owned item merely because
it belongs to the same feature.

## Running it more than once is the point

Grooming is not a gate you pass once. In time order: a feature is groomed and a
ticket to add a column is correct on the day it is written; a week later
somebody ships that column under another ticket; the feature is groomed **again**
before anybody starts, the run reads the repository, and the ticket is cut
before a branch is.

The store is already built for it — a write replaces every section and bumps the
revision, while the question log is appended separately so a revision never
loses it. What this asks of the core is only that nothing assume a brief is
written once, and that a re-run can retire work it previously produced, which
the terminal-state verb already supplies. Deciding *what* to cut stays with the
workflow, which owns policy. The core parses no section.

## Acceptance criteria

- [ ] A grooming step receives one base-source snapshot per repository its
      feature names, resolved through the same checkout map a work item uses,
      and a repository with no explicit entry is refused at boot naming it
      (proof: test:packages/cli/tests/slices.test.ts)
- [ ] The source view handed to a grooming step reads that repository's
      configured base branch, whatever the standing working tree was on when
      the tick started
      (proof: assertion:groom.the_step_reads_the_base_branch)
- [ ] A grooming step is handed no checkout path, branch, commit or worktree;
      its source port can only read base-branch Git objects and cannot create a
      branch, commit or worktree
      (proof: test:packages/workflow-feature-grooming/tests/groom.test.ts)
- [ ] A second grooming run over the same feature rewrites the brief, bumps the
      revision, keeps every question already logged, and retires the work the
      first run produced that it no longer wants
      (proof: assertion:groom.a_second_run_retires_what_it_cut)
- [ ] An install whose workflow declares no grooming step behaves exactly as it
      does today, with no config change
      (proof: test:packages/cli/tests/slices.test.ts)

**Exit condition:** a grooming run over a feature whose column already exists in
the repository cuts that ticket before a branch is ever created, and the same
run against an install that never configured a checkout says which repository it
could not read rather than guessing from the tracker alone.
