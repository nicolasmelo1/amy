# Next steps

The execution order. One table, short on purpose: this is the file to reread
weekly, and the file an agent reads to know what is next.

A plan not listed here is written, valid, and off the critical path until its
precondition exists; unfinished work remains listed here until it is done.

Every row below is one pull request. If a row cannot be reviewed in one
sitting it is two rows, and each of them names the gate that proves it — a
plan whose proof is "the tests pass" is a plan that has not been thought about
yet.

Rows 11 to 16 come from one day of writing a workflow against this codebase
and breaking it eight times. They are ordered by what they cost to adopt
rather than by how wrong they are: 11, 12 and 15 are additive and help
somebody who already has a workflow, 13, 14 and 16 change what a workflow
package looks like and are worth doing together, once.

Rows 17 to 21 come from a day of a private workflow driving this machine
against real pull requests — five findings, filed as issues and converted
here. 17 is first because 20 adds six methods to one port and every one of
them should have to get past 17 on arrival.

| # | Work | Exit condition |
| --- | --- | --- |
| 1 | [An answer reaches the agent](an-answer-reaches-the-agent.md) | A ticket that did not say enough is answered by a person in a comment, and the work proceeds on that answer — `CLARIFYING` clears because it was answered rather than because it ran out of attempts |
| 2 | [A spec is a name, a URL or a path](a-spec-is-a-name-a-url-or-a-path.md) | One function turns any of the five forms into what npm installs and what the config names, and nothing else in the CLI parses a spec |
| 3 | [Plugins live where amy can see them](plugins-live-in-amy-home.md) | A machine adds one plugin and runs work with `npm prefix -g` holding nothing of amy's |
| 4 | [`amy add` and `amy remove`](amy-add-and-amy-remove.md) | One command with a URL, a name or a path in it, and the next `amy tick` moves work through the workflow that arrived |
| 5 | [`amy update`](amy-update.md) | A machine two versions behind runs one command, keeps its work, and its harness skills describe the CLI now installed |
| 6 | [A workflow is yours, not a package](a-workflow-is-yours-not-a-package.md) | Somebody who has never published anything ends with a workflow in `~/.amy/workflows` that amy is driving |
| 7 | [A skill ladder for your own steps](a-skill-ladder-for-your-own-steps.md) | A workflow somebody wrote gives one of its own steps a cheaper model and a skill, from `config.yaml` |
| 8 | [A checkout root per repository](a-checkout-root-per-repository.md) | An install drives work in two repositories under two unrelated parents, with no symlink anywhere |
| 9 | [A base branch per repository](a-base-branch-per-repository.md) | Two repositories with two base branch names, and no workflow package carrying a branch mapping of its own |
| 10 | [Compatibility is a capability, not a version](compatibility-is-a-capability-not-a-version.md) | A plugin built against an older core is told at boot which member it lost, and one copy of the core resolves anywhere in the install |
| 11 | [A testkit proves the machine](a-testkit-proves-the-machine.md) | Somebody who has written one workflow finds out from a failing test rather than from a ticket that a state cannot be left, an action has nothing behind it, or a wait is being counted as a try |
| 12 | [The guardrails ship with the workflow](the-guardrails-ship-with-the-workflow.md) | A workflow scaffolded by `amy workflow new` refuses the three defects that reached a real board, on its first commit, without its author having heard of any of them |
| 13 | [Declaring an action is implementing it](declaring-an-action-is-implementing-it.md) | An action cannot be declared without being implemented, and the check that says so happens at boot rather than at the first tick that reaches it |
| 14 | [The fold is told what moved](the-fold-is-told-what-moved.md) | A workflow can tell where a tick came from without reading the history, and reading `record.state` in a fold is refused by a rule rather than discovered by a ticket that went round its whole lifecycle on every reply |
| 15 | [Work that is over goes away](work-that-is-over-goes-away.md) | A machine that has driven work for a month lists what is happening and not what has happened, and one piece of work that will never finish on its own can be retired with a command rather than with `rm` |
| 16 | [The ports belong to the core](the-ports-belong-to-the-core.md) | A workflow nobody shipped declares every port it needs by importing `@amykit/core`, and no plugin in the install depends on a workflow package to know what a tracker is |
| 17 | [No port method ships unproven](no-port-method-ships-unproven.md) | The interface reads as five capabilities because five capabilities are proven, and a port method a plugin claims cannot reach a workflow as its first consumer |
| 18 | [A reply inside a thread reaches the agent](a-reply-inside-a-thread-reaches-the-agent.md) | A reply written inside a thread is read by the agent answering that thread, and a workflow can tell whose turn a thread is from the view alone |
| 19 | [The threads close when they are answered](the-threads-close-when-they-are-answered.md) | A state whose exit is "no automated thread unresolved" reaches that exit — the threads it answered are closed, and the ceiling is for work that is genuinely stuck |
| 20 | [The forge is asked, not run beside](the-forge-is-asked-not-run-beside.md) | A workflow that needs what the plugins know asks the mounted plugin, and no registry ever again says there are two code hosts because a workflow had to mount one of its own |
| 21 | [An escalation can be withdrawn](an-escalation-can-be-withdrawn.md) | A record that escalated on a defect comes back by a command — counter honest, history truthful, and the daemon never once raced the repair |
