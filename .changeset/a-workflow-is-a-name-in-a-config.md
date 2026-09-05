---
"@amy/cli": minor
"@amy/core": minor
"@amy/plugin-file-log": patch
"@amy/plugin-file-notes": patch
---

A workflow is a name in a config, and a plugin is installed rather than
compiled in.

`--workflow` used to accept two literals, so an install could not drive a
workflow this repository had not shipped — while the engine underneath it
could drive anything. A profile is now an entry under `workflows:` in
`.amy/config.yaml`: a name, the package that drives it, and optionally the
plugins to mount under it. The two shipped ones are what a config with no
such block gets.

Each profile keeps its records and queue under `.amy/<name>/`, so a second
workflow no longer writes over the first's state. **State from an older
install stays where it was**: `amy doctor` names each directory it found and
the one `mv` that moves it.

The loader's table of literal imports is gone with the compiled binary. What
installs is packages, resolved by name at run time, so a machine carries the
plugins it uses and nothing else — `AMY_PACKAGES` takes the subset. A plugin
named and not installed is refused at boot with the list of what is, and
`amy plugin list` reports installed and mounted as the different questions
they are.

`@amy/cli` therefore stops depending on ten plugins it never imported, and
`amy init` prints the `npm install` line for whatever a configured workflow
needs and this machine does not have.
