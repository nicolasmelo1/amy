# Changesets

A change that reaches a published package carries a file in here saying which
bump it is and why. `npm run changeset` writes one.

Three things about this repository's setup are decisions rather than defaults:

**`fixed` holds every `@amy/*` package.** They are one system with one
changelog, and a machine reading `amy --version` beside a plugin version
should not have to work out whether the two are compatible. One number moves,
all of them move.

**`test-fixtures` is ignored, because it is never published.** It is
`private`, and naming it here as well means `changeset version` does not stop
to ask about a package nothing installs.

**`commit` is false.** The version bump arrives as a pull request, so it is
reviewed like anything else, and CI proves it green before the publish that
follows it.
