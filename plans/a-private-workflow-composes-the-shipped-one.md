# A private workflow composes the shipped one

**Exit condition:** the private workflow that prompted this drives a ticket across two repositories with no checkout, code-host reader, queue or operator adapter of its own, and its execution phase imports `ticket-to-qa`'s `plan` and runtime instead of keeping its own — measured by its `workflow/` source shrinking to its policy, prompts and gate commands.

The promise in the README is that a workflow is *"a small directory you can
read in one sitting"*, and that a fourth one takes an afternoon. One private
workflow, driving a team's tickets across a backend and a frontend repository
for a month, went the other way: about 10,800 lines of source and 12,700 of
tests, five times `ticket-to-qa`'s 2,159. Almost none of that is the team's
process. It is the machine, written a second time because the shipped one did
not reach far enough:

| What it carries | Roughly | Why it could not use the shipped one |
| --- | --: | --- |
| Its own lifecycle, `plan` and runtime | 5,300 | `ticket-to-qa` writes on the tracker and the code host, and assumes one repository per ticket |
| Its own checkout | 520 | the core's `Git` has `commitAndPush` and nothing that commits without pushing |
| Its own code-host readers | 580 | no lookup by ticket id, no author-side "changes requested", no file on a review thread, and a commit status that never reads as passing |
| Its own queue, operator and pricing adapters | 300 | no priority order, and no shared "the thread if there is one, the notifier otherwise" |
| Brief checks, and the proving it did | 2,300 | these predate [a project is three phases](../docs/design/a-project-is-three-phases.md); they belong in `brief/` and `test/`, and moving them is that workflow's own work |

The last row is the private workflow's to fix. Every other row is a gap in this
repository, and each one below is a pull request that closes one.

## The rows

### A status reads the way the host writes it

`GitHubCodeHost.commitStatuses` reads `/repos/{repo}/commits/{sha}/status` and
maps each status through `toStatusState`, which matches `SUCCESS`, `FAILURE` and
`ERROR` (`plugins/github/src/GitHubCodeHost.ts`). That endpoint answers in lower
case: the `combined-commit-status` example in the bundled REST contract
(`packages/test-fixtures/contracts/github-rest.json.gz`) is `"success"`, twice.
Every real status therefore reads as `running`, and anything waiting on one
waits for ever. The unit test passes because its fixture is upper case.

The fix is case-insensitive matching, and the test reads the contract's own
example rather than a hand-written fixture.

### A commit is not a push

`Git` offers `commitAndPush` and nothing that commits alone. A workflow that
wants work never lost — a commit after every round — and the remote to see it
once per cycle, as a fast-forward or not at all, cannot get both from the core,
so it writes its own checkout. `commit` and `push` become two methods; `push`
refuses anything that is not a fast-forward of the remote branch, with an error
that says so; `commitAndPush` stays, built on the two.

### A thread knows its file

`ReviewThread` carries no path, so a workflow that counts a thread as answered
when its change touched that file has to ask the forge again for every thread.
GitHub's `reviewThreads` already returns `path`; the view carries it, optional,
for a host that has none.

### The code host finds work by its ticket

Three reads every ticket-shaped workflow ends up writing:

- **A pull request by ticket id.** `findPullRequest` takes a branch. A branch
  is derived from the ticket's title, so a renamed ticket divorces the two and
  its pull request reads as never opened. A lookup by the id in the title, open
  or merged, finds it.
- **Changes requested of you, as the author.** `changesRequestedOf` answers from
  the reviewer's side. A workflow driving its own tickets needs the other side:
  pull requests it authored that somebody asked to change, which have left the
  tracker's working status and so fall out of discovery.
- **Ancestry for a workflow that writes nothing.** `pullRequestAncestry` is not
  in the narrowed reader set (`CODE_HOST_READ_METHODS` in
  `packages/core/src/mount.ts`), so a workflow that claims no writes is handed a
  code host without it, and a stacked child cannot find its parent.

### The shipped ticket workflow can hand its writes to you

`ticket-to-qa` declares writes on the tracker and the code host. An operator who
wants the machine to write nowhere a team reads has had to fork the whole
lifecycle, because the writes are in the plan, not in configuration. With one
policy switch, every write becomes a turn: the operator is told once, in the
work's own thread when one is mounted and the notifier otherwise, and the
machine waits until it observes the effect — the pull request open, the status
moved — and carries on. The declaration then claims no writes, and [a workflow
that claims no writes cannot reach one](../docs/design/a-workflow-that-claims-no-writes-cannot-reach-one.md)
holds it to that. The "thread, else notifier" choice moves into the core as one
helper, because every workflow that talks to its operator writes it.

### A ticket can span repositories

`ticket-to-qa` has one `ticket.repo`. Most product tickets change two, and
holding both halves in one record — one state, two repositories — is what the
private workflow tried. It took one state, a pin of which half is being
written, a memory of which repository was written in, a separate memory of what
each review covered, and more than twenty review rounds finding the cases
between them.

The machine's own shape is the simpler answer: **one work item per (ticket,
repository)**, each walking the ordinary lifecycle in its own tree, and one
condition at the end — the ticket is handed to QA only when every work item it
has is merged. A repository groomed in late is a new work item, not a state the
first one has to return to. Discovery offers `TICKET@repo` ids from whatever
decides the repositories (labels, a brief's entries, a triage answer); the
handoff joins them.

### A queue can be ordered

`FileQueue` takes items in id order. Priority order — the tracker's urgency,
refreshed on discovery, first-in-first-out within a priority — is an option of
the queue, not a queue of its own.

## Acceptance criteria

- [ ] A commit status GitHub returns in lower case reads as passing or failing (proof: deferred:not built; plugins/github/tests/GitHubCodeHost.test.ts will read the bundled contract's own example)
- [ ] A workflow commits without pushing, and a push that is not a fast-forward is refused naming the branch (proof: deferred:not built; packages/core/tests/branch.test.ts against real git)
- [ ] A review thread carries the file it is on (proof: deferred:not built; plugins/github/tests/GitHubCodeHost.test.ts)
- [ ] A pull request is found by the ticket id in its title, changes requested are found from the author's side, and a workflow that claims no writes still reads ancestry (proof: deferred:not built; plugins/github/tests/GitHubCodeHost.test.ts and packages/core/tests/mount.test.ts)
- [ ] With writes handed to the operator, `ticket-to-qa` walks a ticket to QA with zero tracker or code-host writes, every one a turn said once and observed after (proof: deferred:not built; packages/workflow-ticket-to-qa/tests/walkthrough.test.ts)
- [ ] A ticket in two repositories is two work items, each walking the lifecycle alone, and QA receives it only when both are merged (proof: deferred:not built; packages/workflow-ticket-to-qa/tests/walkthrough.test.ts)
- [ ] The file queue can order by priority, first-in-first-out within one (proof: deferred:not built; plugins/file-queue/tests/FileQueue.test.ts)
- [ ] The private workflow that prompted this deletes its checkout, readers, queue and operator adapters and imports `ticket-to-qa` (proof: unspecified:it is private; its own plan holds the measurement)

## Not here

- **Moving brief checks into `brief/` and proving into `test/`.** That is the
  private workflow's own work, on the slot this repository already ships.
- **A gate catalogue.** The private workflow's gates are commands the
  `command-gate` plugin already runs.
