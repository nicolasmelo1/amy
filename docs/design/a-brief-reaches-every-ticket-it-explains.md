# A brief reaches every ticket it explains

Delivered. A ticket reaches the agent with its own body
(`packages/workflow-ticket-to-qa/src/ticket.ts:30`) and its tracker
conversation; `HarnessAgent` independently builds triage, implementation and
review prompts from `Ticket` (`packages/agent-kit/src/HarnessAgent.ts:51`,
`:111`, `:173`); a workflow-owned half-step uses the generic `Harness.ask` and
its two-field `AskContext` (`packages/core/src/ports/Harness.ts:18`). A parent
ticket was a poor substitute: it was written before the grooming loop, was not
revised when a question was answered, and did not reach a generic self-review
unless every workflow rebuilt the workaround.

Issue #57 found the consequence on a real board: a grooming agent produced a
well-formed child ticket from a product ticket it could not read; the
implementation, tests and self-review all faithfully acted on a requirement
that had no source. The missing fact was not another ticket field — it was one
durable, revisable artifact that a grooming workflow owns and every later
ticket step receives. This plan supplied that channel, not a grooming policy:
a workflow decides which sections a brief has, what counts as a source, when
an unsupported requirement is cut, and whether to wait for a person. The core
never parses those sections or decides them.

## What changes

**A brief is opaque content with explicit work membership.** [The ports
belong to the core](the-ports-belong-to-the-core.md) made cross-workflow
contracts importable without depending on `workflow-ticket-to-qa`, and the
brief contract landed beside them: `BriefId`, `BriefRecord`, `BriefView` and
the `BriefStore` port in `packages/core/src/ports/Brief.ts`, with
`renderBrief` owned by the core so a workflow and a person read one document.
The file-backed adapter (`FileBriefStore`, in `plugin-file-store`) owns the
on-disk layout and an atomic write-then-rename, and is mounted unconditionally
beside the records — a port with nothing behind it is a boot refusal, and one
more directory costs nothing. Reads return the current version each time
rather than a copy folded into a ticket record, so a revision between ticks
cannot be hidden by old state.

The grooming workflow that creates a brief writes its declared sections
through that port. A later step may append a question, with its work id and
time, through the same port; no agent action appends an answer — an answer is
the owning workflow's next revision. The port exposes the current rendered
document and its revision, not an API that lets a ticket workflow infer or
modify a workflow's policy; in the machine the shipped workflow drives, the
brief id is the tracker parent, so the tracker names which brief a ticket
belongs to and no second config vocabulary is needed.

**The current brief travels as context, not as a longer ticket body.**
`Ticket` gained an optional `briefId` the tracker's parent supplies and an
optional rendered `brief`, separate from `body`, and agent-kit owns one
renderer for it (`briefLines` in `HarnessAgent`). `HarnessAgent` uses that
renderer in triage, implementation and review repair; `AskContext` carries
the same value through `HarnessRelay`, so workflow-declared half-steps —
including `self-review` — cannot silently lose it. A ticket with no
associated brief preserves today's prompts and relay calls exactly.

**The command is the public reader.** `amy brief <id>` (with the
workflow/profile selection conventions the CLI already uses) and `--json`
live in the CLI. Both renderings are produced from one snapshot, the way
`amy status` does, so the human document, revision and membership cannot
drift from the machine-readable form. The command resolves its port through
the ordinary assemble; callers do not need to know the adapter's directory.

**Retention follows the work, not the file.** The brief store's
`retired(...)` reports the ids whose every explained work is terminal and old
enough for the store's retention policy, and `amy queue prune` removes them
alongside finished queue items. One open child retains the whole brief. The
event log remains the durable history after the brief is pruned.

**Tracker writes are a declared capability.** The tracker contract moved to
the core with [the ports belong to the core](the-ports-belong-to-the-core.md)
and left split along the seam this plan needs: `TrackerReads` and
`TrackerWrites` are separate interfaces, and `TRACKER_WRITE_CAPABILITIES`
names the write each core action resolves to. Mount refuses a workflow that
claims no tracker-write capability yet declares an action resolving to a
mutator, naming the action and capability before any tick.
`ticket-to-qa` explicitly claims the writes it already makes; a grooming
workflow receives read-only tracker access and records questions in its
brief instead.

## The gate

`ticket-to-qa`, extended, proves the installed machine rather than one prompt
builder. Its world gives the ticket a tracker parent that names the durable
brief, captures triage, implementation and the declared `self-review` prompt,
revises the brief between looks, and appends the question the triage raised to
the brief the next look reads. The gate's design note —
[the lifecycle is proven end to end](the-lifecycle-is-proven-end-to-end.md) —
carries these criteria beside the lifecycle's own:

- `brief.parent_is_the_tracker_supplied_shared_id`
- `brief.triage_reads_the_operator_authored_constraint`
- `brief.question_is_appended_with_its_work_id`
- `brief.a_revision_between_ticks_reaches_self_review`
- `brief.self_review_is_a_declared_agent_step`
- `brief.show_reads_the_port_without_exposing_its_directory`

The tracker-write boundary took a different seam than this plan guessed: the
briefs the shipped workflow handles are identified by the tracker parent, a
grooming workflow keeps its policy above the runtime, and the sections a
workflow declares are its own config, not a schema the core parses. What the
plan asked for anyway is delivered as unit proof rather than gate assertion:
the CLI's ordinary tests prove the two renderings come from one snapshot and
that a missing brief is named (`packages/cli/tests/brief.test.ts`), the file
store's tests prove atomic persistence and retention independently
(`plugins/file-store/tests/FileBriefStore.test.ts`), and the core mount tests
prove the declaration/action mismatch without a tracker adapter
(`packages/core/tests/mount.test.ts`).

## Acceptance criteria

- [x] A current brief identified by the ticket's tracker parent reaches
      implementation, review repair and the declared self-review prompt
      (proof: assertion:brief.parent_is_the_tracker_supplied_shared_id)
- [x] Triage reads the operator-authored constraint the brief carries
      (proof: assertion:brief.triage_reads_the_operator_authored_constraint)
- [x] A question a later step appends lands in the brief with its work id and
      time, and no agent operation appends an answer
      (proof: assertion:brief.question_is_appended_with_its_work_id)
- [x] A brief revision between two looks is rendered in the second look rather
      than replayed from a record
      (proof: assertion:brief.a_revision_between_ticks_reaches_self_review)
- [x] `amy brief <id>` and its `--json` form render one current snapshot
      without exposing an adapter path
      (proof: test:packages/cli/tests/brief.test.ts)
- [x] A brief survives retention while any work it explains is open, and is
      retired only after all of it is terminal and old enough
      (proof: test:plugins/file-store/tests/FileBriefStore.test.ts)
- [x] A workflow declaring no tracker-write capability is refused at mount if
      it declares a tracker-mutating action, before any tick runs
      (proof: test:packages/core/tests/mount.test.ts)
- [x] A ticket with no brief is asked the same questions in the same words as
      before, and self-review runs without one
      (proof: test:packages/workflow-ticket-to-qa/tests/briefs.test.ts)

**Exit condition:** a grooming workflow can keep one revisable, policy-shaped
brief for a feature; every ticket step that needs it reads its current
version, later work can raise a question without deciding it, operators can
inspect it by command, and a workflow that promised not to edit the tracker
cannot begin a tracker write.
