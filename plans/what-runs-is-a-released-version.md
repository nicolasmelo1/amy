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

**The packages are published, not made private.** Every `@amykit/*` package
except `test-fixtures` is something a second machine installs, so publishing
is the point rather than the accident to be prevented. They go to npmjs under
the `@amy` scope, and `publishConfig.registry` on each one is what stops an
ambient configuration from redirecting a publish somewhere nobody meant.

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

### The scope, decided

`@amykit/*` stays, and that decision is what chose the registry rather than the
other way round.

GitHub Packages was the obvious answer and it cannot have this scope: its npm
registry requires the scope to be the account that owns the repository, and
`amy` is taken on GitHub. The scope would have had to become the owner's own,
or an organization that happens to be free, and either way twenty package
names move for a reason that has nothing to do with the packages.

On npmjs the scope was unclaimed, so nothing is renamed. What that costs is
privacy: a public package is a public tarball. So the repository became
public too, which is a bigger decision than a release path and was taken on
its own terms — and it was taken by *starting a new repository*, because the
old history held a different application and two credentials committed in the
clear. Rewriting a history does not remove it; the commits stay reachable
through the pull requests that carried them.

What remains of the original worry is real and stays handled: the templates
and fixtures name nobody, and `L6.FIXTURES_NAME_NOBODY_REAL` is what keeps it
that way.

### Two things about changesets that this has to be built around

**A tag pushed with the default `GITHUB_TOKEN` does not start a workflow.**
GitHub refuses to chain workflow runs off its own token, so a job waiting for
a tag that a changesets job pushed waits forever. Chosen: the version and the
publish live in one workflow, `release.yml`, so the tag is pushed by the same
run that publishes. The failure mode of the other arrangement is silence,
which is why it is written down here rather than discovered.

**Changesets versions `package.json` and publishes packages, and does nothing
else.** Anything a release needs beyond that — a checksum, a changelog
somewhere a human reads, a notification — is our workflow's job.

### Installing on the second machine

An `.npmrc` pointing the scope at `https://npm.pkg.github.com` and a token
with `read:packages`. Then `@amykit/cli` plus only the plugins that machine
needs. Going back to an earlier release is installing an earlier version,
which is the rollback the old arrangement never had.

### What survives from the original shape

The build stamp still has to tell a release from a checkout. A tree with
uncommitted changes, or a commit changesets never tagged, is `dev` — refused
rather than stamped. `stampFrom` in `packages/core/src/build.ts` already
draws that line and only needs it drawn one notch further along than "was it
built".

## Acceptance criteria

- [x] A change that reaches a published package is refused without a
      changeset, so a version cannot stand still through a release
      (proof: test:.github/workflows/software-factory.yml)
- [x] Every publishable package carries what a publish needs, and one that
      stops carrying it turns the gate red
      (proof: test:scripts/check-release-config.mjs)
- [x] Every published package moves to the same number, through one `fixed`
      group (proof: test:scripts/check-release-config.mjs)
- [x] A publish cannot be redirected to another registry by whatever
      configuration happens to be ambient
      (proof: test:scripts/check-release-config.mjs)
- [x] `test-fixtures` is never published, because nothing installs it
      (proof: test:scripts/check-release-config.mjs)
- [x] The version and the publish happen in one workflow, so nothing waits on
      a tag that cannot start a run
      (proof: test:.github/workflows/release.yml)
- [x] An installed package names the version and the commit it was built
      from, in `--version` and on every log line it writes
      (proof: test:packages/cli/tests/stamp.test.ts)
- [x] A build from a tree with uncommitted changes reports `dev` rather than
      a version (proof: test:packages/cli/tests/stamp.test.ts)
- [ ] A machine with no checkout installs `@amykit/cli` from the registry and
      runs (proof: deferred:the npm organization and its token are the
      operator's to create, and nothing is published yet)
- [ ] Installing an earlier version replaces a later one, so a bad release
      has somewhere to go back to
      (proof: deferred:there is one version so far)
- [ ] Two consecutive releases produce log lines that differ in the version
      half of the stamp, so a window can be attributed to a release
      (proof: deferred:there is one version so far)
- [ ] The changelog names what moved between two versions, so a stamp in the
      log can be read back to a reason
      (proof: deferred:the first `changeset version` has not run yet)

### What this does not prove, and is worth knowing

The stamp is written into `dist/` at pack time. In a published tarball that is
the only way it can get there, and a checkout never has one — which is what
tells a release from a working tree. Locally, a `npm pack` leaves the file
behind in `dist/`, so a build from a clean tree that is then edited keeps a
stamp that names the commit before the edit until something packs again. That
is a nuisance in a checkout and cannot happen in a release, because a publish
always packs.

**Exit condition:** a second machine installs `@amykit/cli` from npmjs with no
checkout anywhere on it, `amy --version` names a version changesets published
and tagged, the changelog says what that release changed, and a build from a
dirty tree refuses to call itself anything but `dev`.
