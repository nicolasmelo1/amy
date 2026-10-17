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
| Brief checks, and the proving it did | 2,300 | these predate [a project is three phases](a-project-is-three-phases.md); they belong in `brief/` and `test/`, and moving them is that workflow's own work |

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
that claims no writes cannot reach one](a-workflow-that-claims-no-writes-cannot-reach-one.md)
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

## The gate

`a-private-workflow-composes`, new, because none of the shipped gates names
this plan and `L3.GATE_COVERS_THE_PLAN` only joins a plan to the one gate
that names it. Its scenario proves each row where the row's claim lives:

- **Statuses, threads and lookups** against the built GitHub adapter, with
  `gh` answering in the shapes the bundled contract records — lower-case
  `success`, a `path` on every thread — not hand-written upper-case ones.
- **Commit and push** against real git: a bare origin, two clones, and the
  second clone moving the branch first so the push genuinely is not a
  fast-forward.
- **Handing the writes off and splitting by repository** through the
  installed executable, in `ticket-to-qa`'s stand-in world, with the
  tracker's and `gh`'s logs read afterwards for any write at all.
- **The queue** against the built file-queue, from another process.

The negative paths are the point of half of these: a refused push, a status
that fails, a mount that still hands no writer to a workflow that claims
none, a QA handoff that does not happen while one repository is open, a
machine that does not move before the operator's effect is there.

## Acceptance criteria

### A status reads the way the host writes it

- [x] A combined status of `success`, as the contract's example spells it,
      reads as passing
      (proof: assertion:compose.a_lower_case_success_reads_as_passing)
- [x] `failure` and `error` in lower case read as failing, not running
      (proof: assertion:compose.a_lower_case_failure_reads_as_failing)
- [x] Work waiting on a status moves on the look after it passes
      (proof: assertion:compose.work_waiting_on_a_status_moves_when_it_passes)

### A commit is not a push

- [x] A commit without a push leaves the remote branch where it was
      (proof: assertion:compose.a_commit_without_a_push_leaves_the_remote_where_it_was)
- [x] A push that is not a fast-forward is refused, and the error names the
      branch (proof: assertion:compose.a_push_that_is_not_a_fast_forward_is_refused_naming_the_branch)
- [x] The refused push leaves the local commit in place
      (proof: assertion:compose.a_refused_push_keeps_the_local_commit)
- [x] `commitAndPush` still delivers in one call, built on the two
      (proof: assertion:compose.commit_and_push_still_delivers_in_one_call)
- [x] Nothing amy runs forces a push
      (proof: test:.software-factory/rules/a-push-never-forces.yaml)

### A thread knows its file

- [x] A review thread carries the path the forge returned for it
      (proof: assertion:compose.a_review_thread_carries_the_file_it_is_on)

### The code host finds work by its ticket

- [x] A ticket renamed after its pull request opened still finds it, by the
      id in the title (proof: assertion:compose.a_renamed_ticket_still_finds_its_pull_request)
- [x] A merged pull request is found by its ticket id as well as an open one
      (proof: assertion:compose.a_merged_pull_request_is_found_by_its_ticket)
- [x] Pull requests the author opened and somebody asked to change are found
      from the author's side
      (proof: assertion:compose.changes_requested_are_found_from_the_authors_side)
- [x] A workflow that claims no writes is handed `pullRequestAncestry`
      (proof: assertion:compose.a_workflow_that_claims_no_writes_reads_ancestry)
- [x] The same workflow is still handed no writer
      (proof: assertion:compose.a_workflow_that_claims_no_writes_still_reaches_none)

### The shipped ticket workflow can hand its writes to you

- [x] With writes handed off, the tracker receives no write from a ticket's
      whole walk (proof: assertion:compose.handed_off_nothing_is_written_on_the_tracker)
- [x] With writes handed off, the code host receives no write either
      (proof: assertion:compose.handed_off_nothing_is_written_on_the_code_host)
- [x] The ticket still reaches QA
      (proof: assertion:compose.handed_off_the_ticket_still_reaches_qa)
- [x] Each handed-off write is said to the operator exactly once
      (proof: assertion:compose.a_handed_off_write_is_said_once)
- [x] It is said in the work's own thread when one is mounted
      (proof: assertion:compose.a_handed_off_write_is_said_in_the_works_thread)
- [x] It goes to the notifier when there is no thread
      (proof: assertion:compose.with_no_thread_a_handed_off_write_goes_to_the_notifier)
- [x] The machine makes no move past a handed-off write until it observes the
      effect (proof: assertion:compose.nothing_moves_until_the_handed_off_effect_is_observed)
- [x] With the switch on, the declaration claims no writes, so the mount hands
      it none (proof: assertion:compose.handed_off_the_declaration_claims_no_writes)

### A ticket can span repositories

- [x] A ticket in two repositories is discovered as two work items,
      `TICKET@repo` (proof: assertion:compose.a_ticket_in_two_repositories_is_two_work_items)
- [x] Each walks the lifecycle in its own tree
      (proof: assertion:compose.each_repository_walks_in_its_own_tree)
- [x] QA does not receive the ticket while one repository is unmerged
      (proof: assertion:compose.qa_waits_while_one_repository_is_unmerged)
- [x] QA receives it once, when every repository is merged
      (proof: assertion:compose.qa_receives_the_ticket_once_when_every_repository_is_merged)
- [x] A repository added after the first is under way is a new work item the
      handoff waits for
      (proof: assertion:compose.a_repository_added_late_is_a_new_work_item_qa_waits_for)

### A queue can be ordered

- [x] With priority order on, the most urgent item is claimed first
      (proof: assertion:compose.the_queue_takes_the_most_urgent_first)
- [x] Within one priority, first in is first out
      (proof: assertion:compose.within_one_priority_the_queue_is_first_in_first_out)
- [x] A priority refreshed on discovery reorders what is waiting
      (proof: assertion:compose.a_priority_refreshed_on_discovery_reorders_the_queue)
- [x] Without the option, the queue keeps id order
      (proof: assertion:compose.without_the_option_the_queue_keeps_id_order)

### What the first review found

Each of these shipped in the first pass of this work and was caught in
review. Each is now an assertion the gate requires, so it cannot come back
unnoticed.

- [x] A new branch cut at a commit another branch already pushed is published:
      whether a push moved anything is git's answer about the named branch
      (proof: assertion:compose.a_new_branch_at_a_pushed_commit_is_published)
- [x] Reprioritizing never brings back an item a worker claimed after it was
      listed: it takes the item by rename, the way a claim does
      (proof: assertion:compose.reprioritizing_never_recreates_a_claimed_item)
- [x] A review the operator was asked to request again is answered only by a
      request, or a review submitted after the turn was said
      (proof: assertion:compose.a_re_review_is_answered_only_after_it_was_asked)
- [x] A QA handoff handed to the operator is done only when both the status
      and the QA owner are seen
      (proof: assertion:compose.qa_is_done_only_when_status_and_owner_are_both_seen)
- [x] A work item that is not the first waits until it sees the handoff, so a
      reordering of labels can still hand it over
      (proof: assertion:compose.a_follower_waits_until_it_sees_the_handoff)
- [x] Review fixes go to the branch the pull request was opened from, however
      it was found
      (proof: assertion:compose.review_fixes_land_on_the_pull_requests_own_branch)
- [x] A ticket in several repositories is refused by name when the code host
      cannot read whether each one merged, instead of waiting for ever
      (proof: assertion:compose.a_host_that_cannot_read_merges_is_refused_by_name)
- [x] Labelling a running ticket into more repositories keeps its work item:
      the repository it started in keeps the ticket's own id
      (proof: assertion:compose.labelling_a_running_ticket_keeps_its_work_item)

### What the second review found

- [x] A review the operator requested is read after the forge's own checks,
      so red checks or a conflict still hand the work back instead of
      reaching a reviewer
      (proof: assertion:compose.a_requested_review_still_answers_to_the_forges_checks)
- [x] A reprioritization that fails puts the original back, and one whose
      process dies is put back by `recover`
      (proof: assertion:compose.an_interrupted_reprioritization_is_put_back)
- [x] A work item whose repository left the ticket is retired — settled where
      it stands — instead of handing the ticket over beside the ones that remain
      (proof: assertion:compose.a_repository_that_leaves_the_ticket_retires_its_work_item)
- [x] A requested review is recognised without regard to the login's case, and
      against the turn as an instant rather than as text
      (proof: assertion:compose.a_review_request_matches_logins_and_instants_as_the_forge_writes_them)
- [x] A QA handoff answers to the owner the turn named, and a roster that
      changes before it was made says the new one
      (proof: assertion:compose.a_qa_handoff_answers_to_the_owner_it_named)
- [x] With the writes handed over and no thread, the operator answers on the
      ticket with their own account, and the machine hears it
      (proof: assertion:compose.the_operator_answers_on_the_ticket_with_their_own_account)

### What the third review found

- [x] Recovery never takes a reprioritization that is still at work: a hold's
      age is the instant in its own name, never the item's, which may have
      waited for hours before it was taken
      (proof: assertion:compose.recovery_never_takes_a_live_reprioritization)
- [x] Discovery sees work a dead reprioritization still holds, so it does not
      queue it a second time before recovery puts it back
      (proof: assertion:compose.discovery_sees_work_a_reprioritization_holds)
- [x] A work item for a repository whose last label was taken off is retired,
      because the tracker's membership is read before the work id overrides
      the repository
      (proof: assertion:compose.a_repository_whose_last_label_went_retires_its_work_item)

### What the fourth review found

- [x] An item a hold is taken from, or released to, between the listing and
      the read is still pending: one listing, and each item read under either
      of its two names
      (proof: assertion:compose.an_item_between_its_two_names_is_still_pending)
- [x] Recovery reads a held item before it publishes it, so a worker claiming
      it the instant it is back does not abort the tick
      (proof: assertion:compose.recovery_survives_a_claim_racing_its_restore)
- [x] A retired work item settles where it stands rather than finishing, so
      the repository's label coming back resumes it
      (proof: assertion:compose.a_retired_work_item_resumes_when_its_repository_returns)

### What the fifth review found

- [x] A replacement that fails half-written is removed before the original
      goes back, and recovery drops one whose hold is already gone, so
      `ready/` holds nothing a reader cannot read
      (proof: assertion:compose.a_half_written_replacement_leaves_nothing_behind)

### The private workflow

- [ ] The private workflow that prompted this deletes its checkout, readers,
      queue and operator adapters and imports `ticket-to-qa`
      (proof: unspecified:it is private; its own plan holds the measurement)

## Not here

- **Moving brief checks into `brief/` and proving into `test/`.** That is the
  private workflow's own work, on the slot this repository already ships.
- **A gate catalogue.** The private workflow's gates are commands the
  `command-gate` plugin already runs.
