---
"@amykit/cli": minor
---

A plugin is installed into a workflow, as a package or as a fork of its source.

`amy add <package> --fork` takes the package's source from the repository its
`package.json` names, at the tag its installed version was released under, into
a place the selected profile owns: under `forks/` in the project of a workflow of
your own, or under `~/.amy/profiles/<profile>/forks/` for one somebody else
published. A git URL naming a directory (`<url>#path:<dir>`) forks the same way
without the registry. The fork keeps the package's name, and a profile root of
its own, `~/.amy/plugins/profiles/<profile>`, maps that name to it — so two
profiles on one machine can answer one plugin two ways, an installed workflow
that imports the name reaches the fork, and no config or code names a path.

Before, one machine had one npm root, so a name resolved to one place for every
profile, and the only way to change how a port was answered for one workflow was
a second plugin shipped inside that workflow.

An edited fork is built by its own build script on the next boot, and a running
loop remounts it between ticks. `amy update` merges the plugin's next release
into the fork three ways and keeps every edit; a line both sides changed stops
the whole update before anything moves, with the marked merge written beside the
fork. `amy remove` of a forked name goes back to the published package and keeps
the fork's directory. `config.yaml` gains `add: fork | package` and `forks:`;
`--fork`, `--package` and `--to <dir>` override them for one command.

`amy workflow add --into` now copies a callee's source from its repository at the
installed version, rather than the compiled `dist` it was installed as. Every
published package also ships a shadcn registry item under `registry/`.
