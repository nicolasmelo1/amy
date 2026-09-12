# Next steps

The execution order. One table, short on purpose: this is the file to reread
weekly, and the file an agent reads to know what is next.

A plan not listed here is written, valid, and off the critical path until its
precondition exists; unfinished work remains listed here until it is done.

Every row below is one pull request. If a row cannot be reviewed in one
sitting it is two rows, and each of them names the gate that proves it — a
plan whose proof is "the tests pass" is a plan that has not been thought about
yet.

Rows 10 to 15 come from one day of writing a workflow against this codebase
and breaking it eight times. They are ordered by what they cost to adopt
rather than by how wrong they are: 10, 11 and 14 are additive and help
somebody who already has a workflow, 12, 13 and 15 change what a workflow
package looks like and are worth doing together, once.

Rows 16 to 20 come from a day of a private workflow driving this machine
against real pull requests — five findings, filed as issues and converted
here. 16 is first because 19 adds six methods to one port and every one of
them should have to get past 16 on arrival.

Rows 21 and 22 come from two issues filed against that same private
workflow's day on real tickets (#46, #45), converted the way issues are:
grounded in the code first, one plan each. 21 is first because it changes
where work *runs* — every effect, gate and git action answers for one work
item's own tree — and 22's progress signals are about whether another run
in that tree is worth anything; a workflow should not learn to count
no-evidence retries against a tree two tickets can still contend for.

Rows 23 and 24 come from issue #48, another day of that private workflow
driving amy — two findings, filed together because they arrived together,
split the way they must be: 23 is about who answers a step the config
cannot even name, 24 is a port growing what a stacked pull request needs.
23 comes first because its sibling (row 6) already has an approved plan,
and the two must not disagree about which list a step is checked against;
24 ships a new gate with it, so what it adds to one port has to get past
the same boot that 23 tightens.

| # | Work | Exit condition |
| --- | --- | --- |
| 1 | [A spec is a name, a URL or a path](a-spec-is-a-name-a-url-or-a-path.md) | One function turns any of the five forms into what npm installs and what the config names, and nothing else in the CLI parses a spec |
| 2 | [Plugins live where amy can see them](plugins-live-in-amy-home.md) | A machine adds one plugin and runs work with `npm prefix -g` holding nothing of amy's |
| 3 | [`amy add` and `amy remove`](amy-add-and-amy-remove.md) | One command with a URL, a name or a path in it, and the next `amy tick` moves work through the workflow that arrived |
| 4 | [`amy update`](amy-update.md) | A machine two versions behind runs one command, keeps its work, and its harness skills describe the CLI now installed |
| 5 | [A workflow is yours, not a package](a-workflow-is-yours-not-a-package.md) | Somebody who has never published anything ends with a workflow in `~/.amy/workflows` that amy is driving |
| 6 | [A skill ladder for your own steps](a-skill-ladder-for-your-own-steps.md) | A workflow somebody wrote gives one of its own steps a cheaper model and a skill, from `config.yaml` |
| 7 | [A checkout root per repository](a-checkout-root-per-repository.md) | An install drives work in two repositories under two unrelated parents, with no symlink anywhere |
| 8 | [A base branch per repository](a-base-branch-per-repository.md) | Two repositories with two base branch names, and no workflow package carrying a branch mapping of its own |
| 9 | [Compatibility is a capability, not a version](compatibility-is-a-capability-not-a-version.md) | A plugin built against an older core is told at boot which member it lost, and one copy of the core resolves anywhere in the install |
| 10 | [A testkit proves the machine](a-testkit-proves-the-machine.md) | Somebody who has written one workflow finds out from a failing test rather than from a ticket that a state cannot be left, an action has nothing behind it, or a wait is being counted as a try |
| 11 | [The guardrails ship with the workflow](the-guardrails-ship-with-the-workflow.md) | A workflow scaffolded by `amy workflow new` refuses the three defects that reached a real board, on its first commit, without its author having heard of any of them |
| 12 | [Declaring an action is implementing it](declaring-an-action-is-implementing-it.md) | An action cannot be declared without being implemented, and the check that says so happens at boot rather than at the first tick that reaches it |
| 13 | [The fold is told what moved](the-fold-is-told-what-moved.md) | A workflow can tell where a tick came from without reading the history, and reading `record.state` in a fold is refused by a rule rather than discovered by a ticket that went round its whole lifecycle on every reply |
| 14 | [Work that is over goes away](work-that-is-over-goes-away.md) | A machine that has driven work for a month lists what is happening and not what has happened, and one piece of work that will never finish on its own can be retired with a command rather than with `rm` |
| 15 | [The ports belong to the core](the-ports-belong-to-the-core.md) | A workflow nobody shipped declares every port it needs by importing `@amykit/core`, and no plugin in the install depends on a workflow package to know what a tracker is |
| 16 | [No port method ships unproven](no-port-method-ships-unproven.md) | The interface reads as five capabilities because five capabilities are proven, and a port method a plugin claims cannot reach a workflow as its first consumer |
| 17 | [A reply inside a thread reaches the agent](a-reply-inside-a-thread-reaches-the-agent.md) | A reply written inside a thread is read by the agent answering that thread, and a workflow can tell whose turn a thread is from the view alone |
| 18 | [The threads close when they are answered](the-threads-close-when-they-are-answered.md) | A state whose exit is "no automated thread unresolved" reaches that exit — the threads it answered are closed, and the ceiling is for work that is genuinely stuck |
| 19 | [The forge is asked, not run beside](the-forge-is-asked-not-run-beside.md) | A workflow that needs what the plugins know asks the mounted plugin, and no registry ever again says there are two code hosts because a workflow had to mount one of its own |
| 20 | [An escalation can be withdrawn](an-escalation-can-be-withdrawn.md) | A record that escalated on a defect comes back by a command — counter honest, history truthful, and the daemon never once raced the repair |
| 21 | [The worktree is the workplace](the-worktree-is-the-workplace.md) | Two work items in the same repository drive their whole lifecycle concurrently, each in its own worktree, and no workflow had to invent isolation, cleanup, discovery or recovery to get it |
| 22 | [No retry is free](no-retry-is-free.md) | A retry that produces no new evidence is refused before the agent starts, by every workflow, with the reason a person can read — and no workflow had to write a counter of its own to get it |
| 23 | [A skill for the half-step](a-skill-for-the-half-step.md) | A workflow that phases one action into several steps can give each of them its own skill and its own model ladder, from `config.yaml`, with the typos refused at boot by name |
| 24 | [A stack knows its parent](a-stack-knows-its-parent.md) | A workflow that stacks pull requests names one explicit parent per item, resolves the base from the remote code host on every observation, and never learns which forge answered |