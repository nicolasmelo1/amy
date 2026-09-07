# Next steps

The execution order. One table, short on purpose: this is the file to reread
weekly, and the file an agent reads to know what is next.

A plan not listed here is written, valid, and off the critical path until its
precondition exists. Park it in the second table rather than deleting it.

Every row below is one pull request. If a row cannot be reviewed in one
sitting it is two rows, and each of them names the gate that proves it — a
plan whose proof is "the tests pass" is a plan that has not been thought
about yet.

| # | Work | Exit condition |
| --- | --- | --- |
| 1 | [A gate outlives its plan](a-gate-outlives-its-plan.md) | Every `gates.*.plan` points at a document under `docs/design/`, and `plans/` holds only work nobody has done yet |
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
| 12 | [A ceiling that cannot be inert](a-ceiling-that-cannot-be-inert.md) | No install can hold a dollar ceiling that cannot stop anything |

## Delivered

These are done. Their criteria move into the design note their gate cites, and
these files go, as [phase 1](a-gate-outlives-its-plan.md) above.

O roadmap inteiro, com as treze fases e o estado de cada uma, está em
[the roadmap](the-roadmap.md).

| Work | What proves it |
| --- | --- |
| [Every plugin is proven end to end](every-plugin-is-proven-end-to-end.md) | gate `plugin-file-queue` |
| [What runs is not this repo](what-runs-is-not-this-repo.md) | gate `installed-binary` |
| [The relay is proven end to end](the-relay-is-proven-end-to-end.md) | gate `plugin-agent-relay` |
| [The engine fails out loud](the-engine-fails-out-loud.md) | gate `plugin-serial-engine` |
| [The lifecycle is proven end to end](the-lifecycle-is-proven-end-to-end.md) | gate `ticket-to-qa` |
| [The engine drives a workflow it does not know](the-engine-drives-a-workflow-it-does-not-know.md) | gate `installed-plugins` |
| [Friction becomes a plan](friction-becomes-a-plan.md) | gate `note-to-plan` |
| [What runs is a released version](what-runs-is-a-released-version.md) | changesets, and the release job |
| [Plugins are installed, not compiled in](plugins-are-installed-not-compiled-in.md) | gate `installed-plugins` |
| [amy is a machine you leave running](amy-is-a-machine-you-leave-running.md) | gate `installed-binary` |
| [Something said in passing becomes work](something-said-in-passing.md) | `packages/workflow-errand/tests/walkthrough.test.ts` |
| [The roadmap](the-roadmap.md) | the twelve rows above it |

## Parked

| Work | Waiting on |
| --- | --- |
| [The toolchain is bun](the-toolchain-is-bun.md) | A reason that survives node being the runtime. The plan argues the suite should run on what ships; what ships is now built JavaScript on node, which the suite already runs on |
