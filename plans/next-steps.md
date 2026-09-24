# Next steps

The execution order. One table, short on purpose: this is the file to reread
weekly, and the file an agent reads to know what is next.

A plan not listed here is written, valid, and off the critical path until its
precondition exists; unfinished work remains listed here until it is done.

Every row below is one pull request. If a row cannot be reviewed in one
sitting it is two rows, and each of them names the gate that proves it — a
plan whose proof is "the tests pass" is a plan that has not been thought about
yet.

Rows are numbered for reading order only. The paragraphs below name plans
rather than numbers, because a delivered row renumbers every row after it and
prose that cited numbers went stale silently every time — which it had, in four
places, before this was written down.

**From one day of writing a workflow against this codebase and breaking it
eight times.** *A testkit proves the machine*, *the guardrails ship with the
workflow* and *work that is over goes away* are additive and help somebody who
already has a workflow. *The workflow contract changes once* is the pair of
breaking changes that day produced, taken together in one release so no author
migrates twice.

**From a day of a private workflow driving this machine against real pull
requests.** *No port method ships unproven* comes before *an escalation can be
withdrawn*, because the second adds methods and a view to one port and every
one of them should have to get past the first on arrival.

**From that workflow's day on real tickets.** *No retry is free* is about
whether another run is worth anything, and it follows the worktree work that
shipped: a workflow should not learn to count no-evidence retries against a
tree two tickets can still contend for.

**From a third day, driving real reviews.** *A review thread can be replied to*
is the write the code host never had. *A strong model reads the review first*
orders after it because its verdicts land through that reply; *the review is
remembered across rounds* orders after that because the triage reads the memory
it keeps; *a picture is a comment too* is independent of the three and last
only because it ships beside them. *A review finding outlives the review*
follows all of them, because they produce and classify the outcomes it
preserves.

**Two configurable choices found after the thread-closing capability shipped.**
*A child carries its roots* makes the tracker's project and ancestor context
available before any review step consumes a partial ticket; *an answered thread
closes by policy* turns a hard-coded closing decision into policy. Separate
rows because one grows the tracker and agent context seam and the other changes
a workflow decision.

**From four issues filed against this repository itself.** *The performance
guard can fail* comes first and is small: a guard that cannot go red is the
gate every other row's proof rides on. *Grooming reads the code it is about*
was delivered as `docs/design/grooming-reads-the-code-it-is-about.md`: it reads
configured base-branch snapshots without changing standing checkouts, and only
reconciles work carrying its own provenance. *A project is three phases* is the
slot, and *a phase is proven, not asserted* is what goes in the third one, so
it follows.

**From auditing what the gates actually watch.** *The errand is proven end to
end* is the third shipped workflow's missing scenario: `amy btw` is the shortest
road into this machine and the only one of the three whose source cannot expire
a proof by changing. It sits beside *the performance guard can fail* because
both are the same defect seen twice — a gate that reads like protection and
cannot report the day it stops being any.

**The next release: the smallest workflow.** The first ten rows are chosen by
one question — what does a workflow somebody wrote themselves still have to
carry that the machine should — and by one operator's request that the machine
write nothing where anybody else reads. *A testkit proves the machine* and *the
guardrails ship with the workflow* take the fake world and the three rules every
private workflow ends up writing. *The workflow contract changes once* and *a
workflow that claims no writes cannot reach one* are both breaking changes to
what a workflow declares, so they ship in the same release and an author
migrates once. *No port method ships unproven* comes before the new port, so the
`conversation` port has to get past that guardrail on arrival. *No retry is
free* and *a stack knows its parent* take the retry counter and the stack
resolution out of the workflows that wrote their own. *An answer arrives where
the question was asked* and *a Slack thread per piece of work* give the operator
somewhere to be asked that is not the tracker. *A project is three phases*
closes the block: it is what moves a brief's checks out of the execution
workflow and into a phase of its own. Everything after it keeps the order it
had.

| # | Work | Exit condition |
| --- | --- | --- |
| 1 | [A testkit proves the machine](a-testkit-proves-the-machine.md) | Somebody who has written one workflow finds out from a failing test rather than from a ticket that a state cannot be left, an action has nothing behind it, or a wait is being counted as a try |
| 2 | [The guardrails ship with the workflow](the-guardrails-ship-with-the-workflow.md) | A workflow scaffolded by `amy workflow new` refuses the three defects that reached a real board, on its first commit, without its author having heard of any of them |
| 3 | [The workflow contract changes once](the-workflow-contract-changes-once.md) | An action cannot be declared without being implemented, a workflow can tell where a tick came from without reading the history, and both arrived in one release so no author migrated twice. |
| 4 | [A workflow that claims no writes cannot reach one](a-workflow-that-claims-no-writes-cannot-reach-one.md) | An install whose workflow claims no writes cannot write to the tracker or the code host by any path, and says so before its first tick |
| 5 | [No port method ships unproven](no-port-method-ships-unproven.md) | The interface reads as five capabilities because five capabilities are proven, and a port method a plugin claims cannot reach a workflow as its first consumer |
| 6 | [No retry is free](no-retry-is-free.md) | A retry that produces no new evidence is refused before the agent starts, by every workflow, with the reason a person can read — and no workflow had to write a counter of its own to get it |
| 7 | [A stack knows its parent](a-stack-knows-its-parent.md) | A workflow that stacks pull requests names one explicit parent per item, resolves the base from the remote code host on every observation, and never learns which forge answered |
| 8 | [An answer arrives where the question was asked](an-answer-arrives-where-the-question-was-asked.md) | A workflow can ask its operator a question and hear the answer, text and pictures, without the tracker being written to or read for it |
| 9 | [A Slack thread per piece of work](a-slack-thread-per-piece-of-work.md) | An operator answers amy inside a Slack thread that belongs to one piece of work, with text or a picture, and the plugin never opened a connection another process could lose events to |
| 10 | [A project is three phases](a-project-is-three-phases.md) | One project drives grooming on a planning cadence with an expensive model and execution continuously with a cheap one, the second reads what the first wrote without either naming a path belonging to the other, and an install that never heard of phases does not change. |
| 11 | [A skill ladder for your own steps](a-skill-ladder-for-your-own-steps.md) | A workflow somebody wrote gives one of its own steps a cheaper model and a skill, from `config.yaml` |
| 12 | [Compatibility is a capability, not a version](compatibility-is-a-capability-not-a-version.md) | A plugin built against an older core is told at boot which member it lost, and one copy of the core resolves anywhere in the install |
| 13 | [Work that is over goes away](work-that-is-over-goes-away.md) | A record that ended leaves the disk on its own, and one piece of work that will never finish on its own can be retired with a command rather than with `rm` |
| 14 | [An escalation can be withdrawn](an-escalation-can-be-withdrawn.md) | A record that escalated on a defect comes back by a command — counter honest, history truthful, and the daemon never once raced the repair |
| 15 | [A skill for the half-step](a-skill-for-the-half-step.md) | A workflow that phases one action into several steps can give each of them its own skill and its own model ladder, from `config.yaml`, with the typos refused at boot by name |
| 16 | [A review thread can be replied to](a-review-thread-can-be-replied-to.md) | A workflow that owes a reviewer an answer can write it inside the thread the reviewer opened, and the next look reads it back as part of the conversation |
| 17 | [A child carries its roots](a-child-carries-its-roots.md) | One leaf ticket can carry its project and every parent to all agent steps, including self-review, when configured; the same install can turn that context down or off |
| 18 | [An answered thread closes by policy](an-answered-thread-closes-by-policy.md) | An operator independently chooses whether answered automated and human threads close, changes that choice on remount, and the remote mutations match it exactly |
| 19 | [A strong model reads the review first](a-strong-model-reads-the-review-first.md) | A workflow that wants a strong model reading its reviews before the executor is spent can say so with one action, one ladder key and one state — and the review arrives with the whole ticket behind it |
| 20 | [The review is remembered across rounds](the-review-is-remembered-across-rounds.md) | What a review settled, deferred or answered is remembered with the evidence it was settled on, and a thread only becomes work again when somebody says something new in it |
| 21 | [A picture is a comment too](a-picture-is-a-comment-too.md) | A comment that arrives with a picture is a comment the agent can see, on Linear or GitHub alike, and no workflow has to know that pictures were ever missing |
| 22 | [A review finding outlives the review](a-review-finding-outlives-the-review.md) | Review and self-review findings survive finished work in one queryable corpus with their mechanical outcomes, repeated collection is idempotent, contradictions are visible, and no machine surface can fill the human verdict or evidence that would turn an anecdote into a rule |
| 23 | [The performance guard can fail](the-performance-guard-can-fail.md) | A commit that makes the budget ledger twenty times slower turns this repository's build red naming the benchmark, and the same gate goes red the day somebody replaces the comparison with a command that only reports. |
| 24 | [The errand is proven end to end](the-errand-is-proven-end-to-end.md) | Editing the errand workflow or the task store turns `sf check` red until the errand scenario is run again and resealed, the same way the other two shipped workflows already behave |
| 25 | [A phase is proven, not asserted](a-phase-is-proven-not-asserted.md) | A unit of work whose scenario names no example cannot leave planning, a phase whose run left one assertion unevaluated is refused with that assertion named, and a phase proven against code that has since changed goes red without anybody looking. |

**Delivered:** *A spec is a name, a URL or a path* now lives at `docs/design/a-spec-is-a-name-a-url-or-a-path.md`.

**Delivered:** *Plugins live where amy can see them* now lives at `docs/design/plugins-live-in-amy-home.md`.

**Delivered:** *Amy add and amy remove* now lives at `docs/design/amy-add-and-amy-remove.md`.

**Delivered:** *Amy update* now lives at `docs/design/amy-update.md`.

**Delivered:** *A workflow is yours, not a package* now lives at `docs/design/a-workflow-is-yours-not-a-package.md`.
