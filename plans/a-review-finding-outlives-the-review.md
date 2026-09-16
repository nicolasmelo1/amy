# A review finding outlives the review

Issue #61 records what the machine currently throws away. A review thread has
source, location, body and conversation (`packages/core/src/ports/CodeHost.ts:13-30`),
and the ticket workflow folds only an operational verdict into its own record
(`packages/core/src/ports/Ticketing.ts:29-35`). That memory answers what this
piece of work should do next. It is not a corpus that can put the same reviewer's
claims from two pieces of work beside each other.

This is distinct from [the review is remembered across rounds](the-review-is-remembered-across-rounds.md).
That plan keeps a thread from being reworked inside one ticket and grows the
workflow's verdict vocabulary. This plan keeps findings after the ticket is
over, across workflows and sources, with the human truth fields deliberately
empty. Folding the corpus into `TicketRecord.judged` would make one workflow's
state the storage contract and would delete the evidence when retired work goes
away.

The timing seam is also missing. A workflow declares terminal states
(`packages/core/src/plugin.ts:18-43`), while the serial engine observes a
`settled` decision, completes the queue item and prunes
(`plugins/serial-engine/src/Worker.ts:148-172`). `WorkflowRuntime` exposes
observe, handlers and apply, but no terminal callback
(`packages/core/src/runtime.ts:43-78`). Collection therefore cannot be attached
to completion without either teaching the engine review vocabulary or adding a
generic completion contribution.

## What changes

**A finding is a core contract, not a review-thread copy.** Add a `Finding`
shape with stable id, source, source finding id, work id, location, body and
time. Machine-owned outcome fields say whether code changed after it, it was
answered, resolved, or contradicted. Human-owned `verdict` and `evidence` are
nullable and absent on append. The write port has no method that accepts those
two fields; the machine cannot forge adjudication through a cast or an action.

**Sources are named contributions.** Review adapters, self-review steps or
other plugins contribute `FindingSource` implementations to one collection.
A workflow declares source names in its own config. Readiness validates every
name after all plugins mount, the same live-contribution pattern used elsewhere
(`packages/core/src/plugin.ts:65-92`, `:109-116`). No source name enters core,
and an install declaring none keeps today's mount and terminal path.

**Completion enqueues collection; collection never holds completion open.**
Add an optional, generic completion hook to `WorkflowRuntime`. After a settled
item is durably completed, the engine asks the hook to enqueue one idempotent
collection job and returns the work result without waiting for remote reads.
The collector processes that durable job separately, reads every declared
source, derives machine-owned outcomes, appends to the corpus and records source
failures without reopening or failing completed work. A retry deduplicates by
source plus source finding id plus work id.

**The store is mounted unconditionally.** Grow the file-store plugin beside its
record and brief stores (`plugins/file-store/src/plugin.ts:7-22`) with one
profile-scoped corpus and collection queue. Reads return one snapshot; append
is atomic. Machine updates may change only machine-owned outcome fields. Human
adjudication remains an explicit file/API boundary outside every core action;
no `CORE_ACTIONS` entry writes verdict or evidence (`packages/core/src/actions.ts:21-73`).

**Contradiction is a flag, not a verdict.** Deterministic grouping uses source,
normalised repository path and symbol/location identity. Opposing claims in the
same group mark both findings `contradicted: true` and link their ids while
leaving verdict and evidence empty. Where a source supplies no symbol, the
collector does not invent one from prose; those findings remain ungrouped.

**One reader, two renderings.** Add `amy findings` and `amy findings --json`.
Both render one corpus snapshot, following the same single-snapshot rule as
`amy brief` and `amy status` (`packages/cli/src/index.ts:677-695`, `:724-785`).
The human form shows unadjudicated and contradictory findings first; JSON keeps
all provenance and ownership fields.

## The gate

`ticket-to-qa`, extended, proves installed completion and review collection;
a narrow workflow fixture proves the no-source compatibility path.

- `findings.two_declared_sources_join_one_corpus`
- `findings.self_review_is_a_source_not_a_special_case`
- `findings.collection_failure_does_not_reopen_finished_work`
- `findings.a_retry_does_not_duplicate_a_finding`
- `findings.opposing_claims_are_flagged_without_a_verdict`
- `findings.no_sources_keeps_the_existing_terminal_path`

## Acceptance criteria

- [ ] A workflow declaring two mounted finding sources collects both into one
      corpus with source, location, body, work id and time intact
      (proof: assertion:findings.two_declared_sources_join_one_corpus)
- [ ] A workflow's self-review contribution is collected through the same
      source contract, without a core action or source name dedicated to it
      (proof: assertion:findings.self_review_is_a_source_not_a_special_case)
- [ ] The machine-facing store and action surfaces cannot set `verdict` or
      `evidence`, and a machine append persists both as empty
      (proof: test:packages/core/tests/findings.test.ts)
- [ ] A source failure after work settles neither delays, fails nor reopens the
      work; retrying the durable job does not duplicate an existing finding
      (proof: assertion:findings.collection_failure_does_not_reopen_finished_work)
- [ ] Opposing claims with the same source, path and symbol are linked and
      flagged as contradictory while both human verdicts remain empty
      (proof: assertion:findings.opposing_claims_are_flagged_without_a_verdict)
- [ ] An install declaring no finding sources follows the existing terminal
      path and writes no corpus or collection job
      (proof: assertion:findings.no_sources_keeps_the_existing_terminal_path)
- [ ] `amy findings` and `amy findings --json` render one snapshot and preserve
      every provenance and ownership field
      (proof: test:packages/cli/tests/findings.test.ts)
- [ ] An unknown declared source is refused by name at boot, after all source
      plugins have had a chance to contribute
      (proof: test:packages/core/tests/mount.test.ts)

**Exit condition:** review and self-review findings survive finished work in one
queryable corpus with their mechanical outcomes, repeated collection is
idempotent, contradictions are visible, and no machine surface can fill the
human verdict or evidence that would turn an anecdote into a rule.
