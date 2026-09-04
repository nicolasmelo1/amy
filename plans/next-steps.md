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
| 6 | [Plugins are installed, not compiled in](plugins-are-installed-not-compiled-in.md) | A second machine runs a ticket with only the plugins it needs installed, and one it never installed is refused by name at boot |
| 7 | [What runs is a released version](what-runs-is-a-released-version.md) | A machine with no checkout installs `@amy/cli` from GitHub Packages, `amy --version` names a version changesets published, and a dirty tree only ever says `dev` |

## Parked

| Work | Waiting on |
| --- | --- |
| [The toolchain is bun](the-toolchain-is-bun.md) | A reason that survives node being the runtime. The plan argues the suite should run on what ships; what ships is now built JavaScript on node, which the suite already runs on |
