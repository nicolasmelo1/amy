# Next steps

The execution order. One table, short on purpose: this is the file to reread
weekly, and the file an agent reads to know what is next.

A plan not listed here is written, valid, and off the critical path until its
precondition exists. Park it in the second table rather than deleting it.

O roadmap inteiro, com as treze fases e o estado de cada uma, está em
[the roadmap](the-roadmap.md). Este arquivo é a ordem de execução dele.

| # | Work | Exit condition |
| --- | --- | --- |
| 1 | [Every plugin is proven end to end](every-plugin-is-proven-end-to-end.md) | Changing a plugin's source turns the build red until its end-to-end run happens again |
| 2 | [What runs is not this repo](what-runs-is-not-this-repo.md) | `amy` resolves on `PATH`, runs from a directory that is not this repository, and every log line names the version and commit that produced it |
| 3 | [The relay is proven end to end](the-relay-is-proven-end-to-end.md) | A quota refusal, a killed child and a mistyped ladder are each proven against the built artifacts, with no credential involved |
| 4 | [The engine fails out loud](the-engine-fails-out-loud.md) | A dependency that goes down produces one warning on the way down, silence while it is down, and one warning when it comes back, and no broken notification channel ever costs a ticket a move |
| 5 | [The lifecycle is proven end to end](the-lifecycle-is-proven-end-to-end.md) | The installed executable walks one ticket from the working status to a QA handoff against a world of stand-ins, twice, with no credential and no network |
| 6 | [The engine drives a workflow it does not know](the-engine-drives-a-workflow-it-does-not-know.md) | `plugins/serial-engine/src/**` names no workflow package, and a second workflow runs on the same engine by contributing a plan and a runtime |
| 7 | [Friction becomes a plan, and the queue stops needing a ticket](friction-becomes-a-plan.md) | A friction note becomes a pull request adding a plan to the right repository, with no tracker involved and no change to the engine |
| 8 | [What runs is a released version](what-runs-is-a-released-version.md) | A machine with no checkout installs `@amykit/cli` from GitHub Packages, `amy --version` names a version changesets published, and a dirty tree only ever says `dev` |
| 9 | [Plugins are installed, not compiled in](plugins-are-installed-not-compiled-in.md) | A second machine runs work with only the plugins it needs installed, a workflow it wrote itself drives on the same engine, and one it never installed is refused by name at boot |

| 10 | [amy is a machine you leave running](amy-is-a-machine-you-leave-running.md) | `amy start` leaves a loop running that outlives the terminal, state is one directory per machine, and the skills reach every harness installed |

| 11 | [Something said in passing becomes work](something-said-in-passing.md) | `amy btw "<sentence>"` puts work on a queue that amy drives to a pull request or to an answer, and the ceiling keeps cheap capture from becoming an expensive pile |

## Parked

| Work | Waiting on |
| --- | --- |
| [The toolchain is bun](the-toolchain-is-bun.md) | A reason that survives node being the runtime. The plan argues the suite should run on what ships; what ships is now built JavaScript on node, which the suite already runs on |
