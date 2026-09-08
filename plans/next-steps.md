# Next steps

The execution order. One table, short on purpose: this is the file to reread
weekly, and the file an agent reads to know what is next.

A plan not listed here is written, valid, and off the critical path until its
precondition exists; unfinished work remains listed here until it is done.

Every row below is one pull request. If a row cannot be reviewed in one
sitting it is two rows, and each of them names the gate that proves it — a
plan whose proof is "the tests pass" is a plan that has not been thought about
yet.

| # | Work | Exit condition |
| --- | --- | --- |
| 1 | [The ticket body reaches the agent](the-ticket-body-reaches-the-agent.md) | A ticket whose description carries an instruction its title does not is implemented in accordance with it, and a ticket with no description is asked about rather than guessed at |
| 2 | [The config `amy init` writes must boot](the-config-amy-writes-must-boot.md) | `amy init && amy doctor` is green with no line deleted from the file amy wrote |
| 3 | [A spec is a name, a URL or a path](a-spec-is-a-name-a-url-or-a-path.md) | One function turns any of the five forms into what npm installs and what the config names, and nothing else in the CLI parses a spec |
| 4 | [Plugins live where amy can see them](plugins-live-in-amy-home.md) | A machine adds one plugin and runs work with `npm prefix -g` holding nothing of amy's |
| 5 | [`amy add` and `amy remove`](amy-add-and-amy-remove.md) | One command with a URL, a name or a path in it, and the next `amy tick` moves work through the workflow that arrived |
| 6 | [`amy update`](amy-update.md) | A machine two versions behind runs one command, keeps its work, and its harness skills describe the CLI now installed |
| 7 | [A workflow is yours, not a package](a-workflow-is-yours-not-a-package.md) | Somebody who has never published anything ends with a workflow in `~/.amy/workflows` that amy is driving |
| 8 | [Nothing is installed by default](nothing-is-installed-by-default.md) | A fresh machine installs one package, and the only workflow on it is one the person there chose or wrote |
| 9 | [A skill ladder for your own steps](a-skill-ladder-for-your-own-steps.md) | A workflow somebody wrote gives one of its own steps a cheaper model and a skill, from `config.yaml` |
| 10 | [A checkout root per repository](a-checkout-root-per-repository.md) | An install drives work in two repositories under two unrelated parents, with no symlink anywhere |
| 11 | [A base branch per repository](a-base-branch-per-repository.md) | Two repositories with two base branch names, and no workflow package carrying a branch mapping of its own |
| 12 | [Compatibility is a capability, not a version](compatibility-is-a-capability-not-a-version.md) | A plugin built against an older core is told at boot which member it lost, and one copy of the core resolves anywhere in the install |
