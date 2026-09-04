# What runs is not this repo

Two problems with one cause, and the cause is that the working directory is a
checkout.

**The code under test is never the code that ships.** Every one of the 512
unit tests imports a source file from inside the workspace. A build that
carries no plugins at all passes all of them, and that is not a hypothetical:
the loader resolved plugins with `await import(spec)`, and a bundler cannot
follow a specifier it cannot read. The first compiled binary would have
mounted nothing.

**The machine's working directory must not be a repository.** amy works in
`~/workspaces/northwind/**` on tickets that name real colleagues and real
customers. If the program that does that work lives in a git repository of
mine, then every accident that writes a file into the working directory is one
`git add -A` away from being published.

## What changes

A single executable, built with `bun build --compile` and installed to a
directory on `PATH`. The repository becomes the source and stops being the
place anything runs.

Bun for the compiling, not for the speed. One file with the runtime inside it
is what makes "install it and forget where it came from" true, and `tsc` still
produces the `dist` that every workspace package's `exports` points at.

## The build has to say what it is

Every log line carries the build that wrote it, stamped by the log rather than
by callers, because a field each caller sets by hand is a field that goes
missing on the one path nobody tested.

Without it, "we improved the repo" and "what failed yesterday" stop being
comparable. A report that silently aggregates several builds into one number
is worse than no report, and this is a system whose whole argument is that its
numbers mean something.

The version and commit arrive through `bun build --define`, replacing
`process.env.AMY_BUILD_*` with literals at compile time, so the binary knows
its own identity with nothing to read from disk. Running from source leaves
them undefined and the stamp reads `dev`, which is the truth: it was not a
build. A tree with uncommitted changes gets `-dirty`, because a stamp naming a
commit that does not describe the code is worse than no stamp.

## Acceptance criteria

- [x] The installed executable runs from a directory containing no checkout,
      no `node_modules` and no `package.json`
      (proof: assertion:installed.runs_without_a_checkout)
- [x] Every built-in plugin is inside the binary, which a dynamic import
      would leave unresolvable
      (proof: assertion:installed.plugins_are_inside_the_binary)
- [x] Every plugin in the default set resolves, so a half-filled table is
      caught as well as an empty one
      (proof: assertion:installed.every_plugin_resolves)
- [x] State is written beside the caller and never into the source tree
      (proof: assertion:installed.does_not_write_into_the_source_tree)
- [x] Every log line names the build that wrote it, and that build is the one
      the binary reports
      (proof: assertion:installed.log_build_matches_the_binary)
- [x] A checkout is visibly not a build, so a dev line is never mistaken for
      a release line
      (proof: test:packages/core/tests/build.test.ts)

**Exit condition:** `amy` resolves on `PATH`, runs a ticket from a directory
that is not this repository, and every line it writes to the log names the
version and commit that produced it. Reverting the loader to a dynamic import
turns the gate red.
