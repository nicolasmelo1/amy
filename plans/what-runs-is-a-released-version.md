# What runs is a released version

The binary exists. The release does not.

`plans/what-runs-is-not-this-repo.md` moved execution out of the checkout and
stamped every log line with the build that wrote it. It stopped one step
short, and the step it stopped short of is the one that makes the stamp mean
anything.

`scripts/install.sh` calls `scripts/build-binary.sh`, which reads the version
from `packages/cli/package.json` and the commit from whatever `HEAD` happens
to be. The version has been `0.1.0` since the first commit and has never
moved. So every binary ever installed carries a stamp whose first half is a
constant and whose second half names an untagged working tree. Installing
today is running main, compiled.

## What the stamp was for, and why this breaks it

The argument for stamping was that "we improved the repo" and "what failed
yesterday" have to be comparable, and that a report silently aggregating
several builds into one number is worse than no report. A version that never
moves cannot group anything. An untagged commit cannot be gone back to.

There is no way back at all today. A build that turns out to be bad has no
previous release to return to, because there were never any releases — only
the sequence of working trees that happened to be on this machine when
`install.sh` ran.

## A compiled binary is not a released one

`stampFrom` in `packages/core/src/build.ts` sets `released: true` for any
binary that carries both defines. `build-binary.sh` appends `-dirty` to the
commit when the tree has uncommitted changes and then compiles it anyway, so
a binary built from work in progress reports `0.1.0+abc1234-dirty` and still
declares itself a release. The field says compiled and is read as released,
which is the kind of gap that only shows up in the number someone is trying
to trust.

The distinction the code already draws is the right one — it just has to be
drawn one notch further along. A checkout is `dev`. A dirty or untagged tree
is also `dev`, and refusing to pretend otherwise costs nothing, because
nobody needs a release built from a tree they have not committed.

## What changes

**Changesets owns the version.** It stops being a number somebody edits and
becomes a number that moves because a change said it should. A change carries
a `.changeset/*.md` naming its bump and its reason, `changeset version`
consumes those into the `package.json` files and a changelog, and
`changeset publish` pushes the packages and tags the commit.

The version still lives in `package.json`. What changes is that it moves, on
purpose, with a written reason attached — which is the property the build
stamp needed and never had.

**The packages are published, not made private.** Every `@amy/*` package
except `test-fixtures` is something a second machine installs, so publishing
is the point rather than the accident to be prevented. They go to GitHub
Packages, which keeps them private without making the repository public, and
`publishConfig.registry` on each one is what stops a stray `publish` from
reaching npmjs instead.

**One tag per package is the release, not noise.** Twenty installable things
release twenty versions, and `changeset tag` naming each one is the correct
behaviour rather than something to filter around. A machine installing three
plugins is installing three named versions.

**All of them share one number, through `fixed`.** They are one system with
one changelog, and a machine reading `amy --version` next to a plugin version
should not have to work out whether the two are compatible.

**There is no compiled artifact.** What ships is built JavaScript, run by
node, installed from the registry. See
[plugins are installed, not compiled in](plugins-are-installed-not-compiled-in.md)
for why, and for what happens to the loader.

### The scope has to be decided before anything is published

GitHub Packages only accepts scoped packages, and the scope must be the
GitHub user or an organization the publisher belongs to. `@amy` is not
available as a GitHub organization, and neither are the obvious variants. So
`@amy/*` cannot be published as it stands: either the scope becomes the
owning account's, or an organization that is actually free gets created and
the twenty packages are renamed to match it.

This is a rename of every package name in the repository, so it happens
before the first publish rather than after.

### Two things about changesets that this has to be built around

**A tag pushed with the default `GITHUB_TOKEN` does not start a workflow.**
GitHub refuses to chain workflow runs off its own token, so a job waiting for
a tag that a changesets job pushed waits forever. Either the push uses a
credential that is not `GITHUB_TOKEN`, or the version and publish steps live
in one workflow. Decide before writing it: the failure mode is silence.

**Changesets versions `package.json` and publishes packages, and does nothing
else.** Anything a release needs beyond that — a checksum, a changelog
somewhere a human reads, a notification — is our workflow's job.

### Installing on the second machine

An `.npmrc` pointing the scope at `https://npm.pkg.github.com` and a token
with `read:packages`. Then `@amy/cli` plus only the plugins that machine
needs. Going back to an earlier release is installing an earlier version,
which is the rollback the old arrangement never had.

### What survives from the original shape

The build stamp still has to tell a release from a checkout. A tree with
uncommitted changes, or a commit changesets never tagged, is `dev` — refused
rather than stamped. `stampFrom` in `packages/core/src/build.ts` already
draws that line and only needs it drawn one notch further along than "was it
built".

## Acceptance criteria

- [ ] Every package name is one GitHub Packages will accept, decided and
      applied before the first publish
      (proof: deferred:`@amy` is not an available organization)
- [ ] A change that reaches a published package is refused without a
      changeset, so a version cannot stand still through a release
      (proof: deferred:changesets is not installed yet)
- [ ] `changeset version` moves every published package to the same number
      (proof: deferred:the fixed group does not exist yet)
- [ ] A publish reaches GitHub Packages and cannot reach npmjs, whatever the
      ambient registry configuration says
      (proof: deferred:no package declares a publishConfig)
- [ ] `test-fixtures` is never published, because nothing installs it
      (proof: deferred:changesets is not installed yet)
- [ ] The publish workflow actually runs, rather than waiting on a tag pushed
      by a token that cannot start it
      (proof: deferred:no publish workflow exists yet)
- [ ] A machine with no checkout installs `@amy/cli` from the registry and
      runs (proof: deferred:nothing is published yet)
- [ ] Installing an earlier version replaces a later one, so a bad release
      has somewhere to go back to
      (proof: deferred:nothing is published yet)
- [ ] A build from a tree with uncommitted changes reports `dev` rather than
      a version (proof: test:packages/core/tests/build.test.ts)
- [ ] Two consecutive releases produce log lines that differ in the version
      half of the stamp, so a window can be attributed to a release
      (proof: deferred:there is only one version)
- [ ] The changelog names what moved between two versions, so a stamp in the
      log can be read back to a reason
      (proof: deferred:changesets is not installed yet)

**Exit condition:** a second machine installs `@amy/cli` from GitHub Packages
with no checkout anywhere on it, `amy --version` names a version changesets
published and tagged, the changelog says what that release changed, and a
build from an untagged or dirty tree refuses to call itself anything but
`dev`.
