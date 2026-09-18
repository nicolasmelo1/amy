# Next steps

The execution order. One table, short on purpose: this is the file to reread
weekly, and the file an agent reads to know what is next.

A plan not listed here is written, valid, and off the critical path until its
precondition exists; unfinished work remains listed here until it is done.

Every row below is one pull request. If a row cannot be reviewed in one
sitting it is two rows, and each of them names the gate that proves it — a
plan whose proof is "the tests pass" is a plan that has not been thought about
yet.

Rows 9 to 13 come from one day of writing a workflow against this codebase
and breaking it eight times. They are ordered by what they cost to adopt
rather than by how wrong they are: 9, 10 and 13 are additive and help
somebody who already has a workflow, 11 and 12 change what a workflow
package looks like and are worth doing together, once.

Rows 15 and 16 come from a day of a private workflow driving this machine
against real pull requests — five findings, filed as issues and converted
here. 15 is first because 16 adds seven methods and a view to one port and
every one of them should have to get past 15 on arrival.

Rows 17 and 18 come from two issues filed against that same private
workflow's day on real tickets (#46, #45), converted the way issues are:
grounded in the code first, one plan each. 17 is first because it changes
where work *runs* — every effect, gate and git action answers for one work
item's own tree — and 18's progress signals are about whether another run
in that tree is worth anything; a workflow should not learn to count
no-evidence retries against a tree two tickets can still contend for.

Rows 19 and 20 come from issue #48, another day of that private workflow
driving amy — two findings, filed together because they arrived together,
split the way they must be: 20 is about who answers a step the config
cannot even name, 19 is a port growing what a stacked pull request needs.
19 comes first because its sibling (row 6) already has an approved plan,
and the two must not disagree about which list a step is checked against;
21 ships a new gate with it, so what it adds to one port has to get past
the same boot that 20 tightens.

Rows 20 and 23 to 25 come from issue #50, a third day of that workflow
driving real reviews. 20 is the write the code host never had — answering
a review inside its own thread — and 23, the strong model that reads a
review before the executor is spent, orders after it because its `answer`
verdicts land through the reply 20 adds. 24 is the record remembering what
a review settled, deferred or answered, and orders after 23 because the
triage reads the memory it keeps. 25 is the picture in the comment —
attachments on Linear and GitHub reaching the agent — independent of the
other three and last only because it ships beside them.

Rows 21 and 22 come from issue #54, two configurable choices found after the
thread-closing capability shipped. 21 makes the Linear plugin's project and
ancestor context available before any review step consumes a partial ticket;
22 turns the workflow's hard-coded closing decision into policy before 23
adds another kind of answer. They are separate rows because one grows the
tracker and agent context seam while the other changes a workflow decision.

Row 26 came from issue #57, after a real grooming run produced work with no
source behind it. It followed the core-port work it depends on: the
policy-shaped brief belongs to a workflow, while its opaque storage, current
delivery to later steps and declared tracker-write boundary belong below that
workflow. It is delivered — the note lives at
`docs/design/a-brief-reaches-every-ticket-it-explains.md`.

One of the rows came from one day on a real install whose answer to two
checkout roots was a directory of symlinks: it followed the worktree work,
because a second root only matters once the trees are cut from the right
source, and it is delivered — the note lives at
`docs/design/a-checkout-root-per-repository.md`.

Row 26 comes from issue #61. It follows the review-reply, triage and across-round
memory rows because those produce and classify the review outcomes it preserves,
but it is not another ticket-record field: it adds a cross-work corpus, generic
source contributions and a non-blocking terminal collection seam. Human verdict
and evidence remain outside every machine action.

| # | Work | Exit condition |
| --- | --- | --- |
| 1 | [A spec is a name, a URL or a path](a-spec-is-a-name-a-url-or-a-path.md) | One function turns any of the five forms into what npm installs and what the config names, and nothing else in the CLI parses a spec |
| 2 | [Plugins live where amy can see them](plugins-live-in-amy-home.md) | A machine adds one plugin and runs work with `npm prefix -g` holding nothing of amy's |
| 3 | [`amy add` and `amy remove`](amy-add-and-amy-remove.md) | One command with a URL, a name or a path in it, and the next `amy tick` moves work through the workflow that arrived |
| 4 | [`amy update`](amy-update.md) | A machine two versions behind runs one command, keeps its work, and its harness skills describe the CLI now installed |
| 5 | [A workflow is yours, not a package](a-workflow-is-yours-not-a-package.md) | Somebody who has never published anything ends with a workflow in `~/.amy/workflows` that amy is driving |
| 6 | [A skill ladder for your own steps](a-skill-ladder-for-your-own-steps.md) | A workflow somebody wrote gives one of its own steps a cheaper model and a skill, from `config.yaml` |
| 7 | [Compatibility is a capability, not a version](compatibility-is-a-capability-not-a-version.md) | A plugin built against an older core is told at boot which member it lost, and one copy of the core resolves anywhere in the install |
| 8 | [A testkit proves the machine](a-testkit-proves-the-machine.md) | Somebody who has written one workflow finds out from a failing test rather than from a ticket that a state cannot be left, an action has nothing behind it, or a wait is being counted as a try |
| 9 | [The guardrails ship with the workflow](the-guardrails-ship-with-the-workflow.md) | A workflow scaffolded by `amy workflow new` refuses the three defects that reached a real board, on its first commit, without its author having heard of any of them |
| 10 | [Declaring an action is implementing it](declaring-an-action-is-implementing-it.md) | An action cannot be declared without being implemented, and the check that says so happens at boot rather than at the first tick that reaches it |
| 11 | [The fold is told what moved](the-fold-is-told-what-moved.md) | A workflow can tell where a tick came from without reading the history, and reading `record.state` in a fold is refused by a rule rather than discovered by a ticket that went round its whole lifecycle on every reply |
| 12 | [Work that is over goes away](work-that-is-over-goes-away.md) | A record that ended leaves the disk on its own, and one piece of work that will never finish on its own can be retired with a command rather than with `rm` |
| 13 | [No port method ships unproven](no-port-method-ships-unproven.md) | The interface reads as five capabilities because five capabilities are proven, and a port method a plugin claims cannot reach a workflow as its first consumer |
| 14 | [An escalation can be withdrawn](an-escalation-can-be-withdrawn.md) | A record that escalated on a defect comes back by a command — counter honest, history truthful, and the daemon never once raced the repair |
| 15 | [No retry is free](no-retry-is-free.md) | A retry that produces no new evidence is refused before the agent starts, by every workflow, with the reason a person can read — and no workflow had to write a counter of its own to get it |
| 16 | [A skill for the half-step](a-skill-for-the-half-step.md) | A workflow that phases one action into several steps can give each of them its own skill and its own model ladder, from `config.yaml`, with the typos refused at boot by name |
| 17 | [A stack knows its parent](a-stack-knows-its-parent.md) | A workflow that stacks pull requests names one explicit parent per item, resolves the base from the remote code host on every observation, and never learns which forge answered |
| 18 | [A review thread can be replied to](a-review-thread-can-be-replied-to.md) | A workflow that owes a reviewer an answer can write it inside the thread the reviewer opened, and the next look reads it back as part of the conversation |
| 19 | [A child carries its roots](a-child-carries-its-roots.md) | One leaf ticket can carry its project and every parent to all agent steps, including self-review, when configured; the same install can turn that context down or off |
| 20 | [An answered thread closes by policy](an-answered-thread-closes-by-policy.md) | An operator independently chooses whether answered automated and human threads close, changes that choice on remount, and the remote mutations match it exactly |
| 21 | [A strong model reads the review first](a-strong-model-reads-the-review-first.md) | A workflow that wants a strong model reading its reviews before the executor is spent can say so with one action, one ladder key and one state — and the review arrives with the whole ticket behind it |
| 22 | [The review is remembered across rounds](the-review-is-remembered-across-rounds.md) | What a review settled, deferred or answered is remembered with the evidence it was settled on, and a thread only becomes work again when somebody says something new in it |
| 23 | [A picture is a comment too](a-picture-is-a-comment-too.md) | A comment that arrives with a picture is a comment the agent can see, on Linear or GitHub alike, and no workflow has to know that pictures were ever missing |
| 24 | [A review finding outlives the review](a-review-finding-outlives-the-review.md) | Review and self-review findings survive finished work in one queryable corpus with their mechanical outcomes, repeated collection is idempotent, contradictions are visible, and no machine surface can fill the human verdict or evidence that would turn an anecdote into a rule |
