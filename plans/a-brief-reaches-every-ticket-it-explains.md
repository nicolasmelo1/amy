# A brief reaches every ticket it explains

A ticket now reaches the agent with its own body (`packages/workflow-ticket-to-qa/src/ticket.ts:30`), its tracker conversation, and optionally its project and ancestors once [a child carries its roots](a-child-carries-its-roots.md) lands. None of those is the current statement of the feature a group of tickets implements. `HarnessAgent` independently builds triage, implementation and review prompts from `Ticket` (`packages/agent-kit/src/HarnessAgent.ts:51`, `:111`, `:173`); a workflow-owned half-step uses the generic `Harness.ask` and its two-field `AskContext` (`packages/core/src/ports/Harness.ts:18`). A parent ticket is a poor substitute: it was written before the grooming loop, is not revised when a question is answered, and does not reach a generic self-review unless every workflow rebuilds the workaround.

Issue #57 found the consequence on a real board: a grooming agent produced a well-formed child ticket from a product ticket it could not read; the implementation, tests and self-review all faithfully acted on a requirement that had no source. The missing fact is not another ticket field. It is one durable, revisable artifact that a grooming workflow owns but every later ticket step can receive.

This plan supplies that channel, not a grooming policy. A workflow decides which sections a brief has, what counts as a source, when an unsupported requirement is cut, and whether to wait for a person. The core never parses those sections or decides them.

## What changes

**A brief is opaque content with explicit work membership.** After [the ports belong to the core](../docs/design/the-ports-belong-to-the-core.md) makes cross-workflow contracts importable without depending on `workflow-ticket-to-qa`, add a core brief contract and a mounted persistence port. It stores a stable brief id, its current text, revision metadata, and the parent/work ids it explains; it does not model acceptance criteria, sources, or answers. The file-backed adapter owns the on-disk layout and an atomic replace/append operation. Reads return the current version each time rather than a copy folded into a ticket record, so a revision between ticks cannot be hidden by old state.

The grooming workflow that creates a brief writes its declared sections through that port. A later workflow may append a question, with its work id and time, through the same port; no agent action appends an answer. The port exposes the current rendered document and its revision, not an API that lets a ticket workflow infer or modify a workflow's policy. A workflow declares the sections it writes in its own config schema, validates them at boot, and names an unknown section in the refusal.

**The current brief travels as context, not as a longer ticket body.** `Ticket` gains an optional brief reference/content separate from `body`, and agent-kit owns one renderer for it. `HarnessAgent` uses that renderer in triage, implementation and review repair. `AskContext` carries the same value through `HarnessRelay`, so workflow-declared half-steps — including `self-review` — cannot silently lose it. A ticket with no associated brief preserves today's prompts and relay calls exactly.

**The command is the public reader.** Add `amy brief show <id>` (with the workflow/profile selection conventions the CLI already uses) and `--json`. Both renderings are produced from one snapshot, as `amy status` does (`packages/cli/src/index.ts:650`), so the human document, revision and membership cannot drift from the machine-readable form. The command resolves its port and profile paths itself; callers do not need to know the adapter's directory.

**Retention follows the work, not the file.** Extend the retirement work in [work that is over goes away](work-that-is-over-goes-away.md): a brief is eligible only when every work id it explains is terminal and old enough for the store's retention policy. One open child retains the whole brief. The event log remains the durable history after the brief is pruned; pruning must not make a live child rediscover or recreate one.

**Tracker writes are a declared capability.** The tracker contract currently lives in the ticket workflow and mixes reads with `comment`, `setStatus`, `assign`, and `createFollowUp` (`packages/workflow-ticket-to-qa/src/ports/Tracker.ts:27`). Move the shared contract to core as part of its port move, split the read and write surfaces, and make a workflow's declared actions/capabilities the only surface its runtime receives. Mount refuses a workflow that claims no tracker-write capability yet declares an action resolving to a mutator, naming the action and capability before any tick. `ticket-to-qa` explicitly claims the writes it already makes; a grooming workflow receives read-only tracker access and records questions in its brief instead.

## The gate

`ticket-to-qa`, extended, proves the installed machine rather than one prompt builder. Its world has a parent brief shared by sibling tickets, captures triage, implementation and a declared `self-review` prompt, revises the brief between ticks, and advances one sibling at a time. It also mounts a read-only workflow and proves the boot refusal before the tracker call log changes.

- `brief.the_same_current_brief_reaches_implementation_and_self_review`
- `brief.a_ticket_without_a_brief_keeps_its_existing_prompt`
- `brief.a_question_from_one_child_is_in_the_next_siblings_brief`
- `brief.a_revision_between_ticks_reaches_the_second_tick`
- `brief.a_read_only_workflow_is_refused_before_a_tracker_write`
- `brief.prune_keeps_a_brief_while_any_child_is_open`
- `brief.prune_removes_a_brief_when_all_its_work_is_over`

The CLI's ordinary tests prove the two `brief show` renderings are one snapshot and that a missing brief is named. The file-store tests prove atomic persistence and retention independently; the core mount tests prove the declaration/action mismatch without a tracker adapter.

## Acceptance criteria

- [ ] A current brief associated with a parent reaches every child ticket's implementation and declared self-review prompt, across the repositories those tickets name
      (proof: assertion:brief.the_same_current_brief_reaches_implementation_and_self_review)
- [ ] A ticket with no brief has the same agent prompt and relay invocation it has today
      (proof: assertion:brief.a_ticket_without_a_brief_keeps_its_existing_prompt)
- [ ] A question a later step appends is in the next observed brief for every sibling, while an agent has no operation that appends an answer
      (proof: assertion:brief.a_question_from_one_child_is_in_the_next_siblings_brief)
- [ ] A brief revision between two ticks is rendered in the second tick rather than replayed from a record
      (proof: assertion:brief.a_revision_between_ticks_reaches_the_second_tick)
- [ ] `amy brief show <id>` and its `--json` form render one current snapshot without exposing an adapter path
      (proof: test:packages/cli/tests/brief.test.ts)
- [ ] A brief survives pruning while any associated work is open, and is removed only after all associated work is terminal and retained long enough
      (proof: assertion:brief.prune_keeps_a_brief_while_any_child_is_open)
- [ ] A workflow declaring no tracker-write capability is refused at boot if it declares a tracker-mutating action, before the tracker call log records a write
      (proof: assertion:brief.a_read_only_workflow_is_refused_before_a_tracker_write)
- [ ] An unknown workflow-declared brief section is refused by name at boot
      (proof: test:packages/core/tests/mount.test.ts)

**Exit condition:** a grooming workflow can keep one revisable, policy-shaped brief for a feature; every ticket step that needs it reads its current version, later work can raise a question without deciding it, operators can inspect it by command, and a workflow that promised not to edit the tracker cannot begin a tracker write.
