# Next steps

The execution order. One table, short on purpose: this is the file to reread
weekly, and the file an agent reads to know what is next.

A plan not listed here is written, valid, and off the critical path until its
precondition exists; unfinished work remains listed here until it is done.

Every row below is one pull request. If a row cannot be reviewed in one
sitting it is two rows, and each of them names the gate that proves it — a
plan whose proof is "the tests pass" is a plan that has not been thought about
yet.

Rows 12 to 17 come from one day of writing a workflow against this codebase
and breaking it eight times. They are ordered by what they cost to adopt
rather than by how wrong they are: 12, 13 and 16 are additive and help
somebody who already has a workflow, 14, 15 and 17 change what a workflow
package looks like and are worth doing together, once.

| # | Work | Exit condition |
| --- | --- | --- |
| 1 | [The ticket body reaches the agent](the-ticket-body-reaches-the-agent.md) | A ticket whose description carries an instruction its title does not is implemented in accordance with it, and a ticket with no description is asked about rather than guessed at |
| 2 | [An answer reaches the agent](an-answer-reaches-the-agent.md) | A ticket that did not say enough is answered by a person in a comment, and the work proceeds on that answer — `CLARIFYING` clears because it was answered rather than because it ran out of attempts |
| 3 | [A spec is a name, a URL or a path](a-spec-is-a-name-a-url-or-a-path.md) | One function turns any of the five forms into what npm installs and what the config names, and nothing else in the CLI parses a spec |
| 4 | [Plugins live where amy can see them](plugins-live-in-amy-home.md) | A machine adds one plugin and runs work with `npm prefix -g` holding nothing of amy's |
| 5 | [`amy add` and `amy remove`](amy-add-and-amy-remove.md) | One command with a URL, a name or a path in it, and the next `amy tick` moves work through the workflow that arrived |
| 6 | [`amy update`](amy-update.md) | A machine two versions behind runs one command, keeps its work, and its harness skills describe the CLI now installed |
| 7 | [A workflow is yours, not a package](a-workflow-is-yours-not-a-package.md) | Somebody who has never published anything ends with a workflow in `~/.amy/workflows` that amy is driving |
| 8 | [A skill ladder for your own steps](a-skill-ladder-for-your-own-steps.md) | A workflow somebody wrote gives one of its own steps a cheaper model and a skill, from `config.yaml` |
| 9 | [A checkout root per repository](a-checkout-root-per-repository.md) | An install drives work in two repositories under two unrelated parents, with no symlink anywhere |
| 10 | [A base branch per repository](a-base-branch-per-repository.md) | Two repositories with two base branch names, and no workflow package carrying a branch mapping of its own |
| 11 | [Compatibility is a capability, not a version](compatibility-is-a-capability-not-a-version.md) | A plugin built against an older core is told at boot which member it lost, and one copy of the core resolves anywhere in the install |
| 12 | [A testkit proves the machine](a-testkit-proves-the-machine.md) | Somebody who has written one workflow finds out from a failing test rather than from a ticket that a state cannot be left, an action has nothing behind it, or a wait is being counted as a try |
| 13 | [The guardrails ship with the workflow](the-guardrails-ship-with-the-workflow.md) | A workflow scaffolded by `amy workflow new` refuses the three defects that reached a real board, on its first commit, without its author having heard of any of them |
| 14 | [Declaring an action is implementing it](declaring-an-action-is-implementing-it.md) | An action cannot be declared without being implemented, and the check that says so happens at boot rather than at the first tick that reaches it |
| 15 | [The fold is told what moved](the-fold-is-told-what-moved.md) | A workflow can tell where a tick came from without reading the history, and reading `record.state` in a fold is refused by a rule rather than discovered by a ticket that went round its whole lifecycle on every reply |
| 16 | [Work that is over goes away](work-that-is-over-goes-away.md) | A machine that has driven work for a month lists what is happening and not what has happened, and one piece of work that will never finish on its own can be retired with a command rather than with `rm` |
| 17 | [The ports belong to the core](the-ports-belong-to-the-core.md) | A workflow nobody shipped declares every port it needs by importing `@amykit/core`, and no plugin in the install depends on a workflow package to know what a tracker is |
