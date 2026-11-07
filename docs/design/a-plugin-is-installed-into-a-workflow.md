---
base: 2074c2a5172d17e61d3c22c62297dc9a00efd3c9
sources:
  - { id: S1, kind: friction, said: "a private workflow needs Linear to answer an outage with nothing and read labels in one request; today that means a second Linear reader inside the workflow, which then ships with it" }
  - { id: S2, kind: friction, said: "two workflows on one machine each need the tracker answered their own way: one the published plugin, the other a changed copy of it; the install holds one npm root, so one name resolves to one place for every profile" }
  - { id: S3, kind: code, ref: "packages/cli/src/workflow-add.ts", symbol: "addWorkflowInto", said: "amy workflow add --into already copies a workflow into one of your own the way shadcn/ui hands out a component, but copies what is installed under ~/.amy/plugins, which is the published dist, and nothing updates the copy afterwards" }
  - { id: S4, kind: reference, ref: "docs/design/plugins-live-in-amy-home.md", said: "~/.amy/plugins is an npm root amy writes its own package.json into, every mount resolves a name through createRequire(<root>/package.json), and the root travels with AMY_HOME" }
  - { id: S5, kind: reference, ref: "docs/design/amy-add-and-amy-remove.md", said: "amy add decides workflow or plugin by mounting it alone, appends a plugin to extraPlugins, and the private npm manifest is authoritative: amy remove rewrites it and prunes" }
  - { id: S6, kind: code, ref: "plugins/linear/package.json", said: "every public package declares repository { type, url, directory }, only the two private ones do not, and every release is tagged <name>@<version>: a version's source is a directory of a repository at a tag" }
  - { id: S7, kind: reference, ref: "https://docs.npmjs.com/cli/v11/configuring-npm/package-json#overrides", said: "overrides are read only from the root package.json, accept any dependency specifier including file:, replace a transitive dependency with a fork, and $name refers to the root's own spec for name" }
  - { id: S8, kind: reference, ref: "https://dev.to/wingo-ui/how-to-update-shadcn-components-without-losing-edits-o1b", said: "shadcn has no update command: add --diff shows a copy against the registry's current item and --overwrite replaces local edits; nothing records which version a copy was taken from" }
  - { id: S9, kind: decision, said: "a published workflow ships the ports it needs, never a plugin; the person running it installs each plugin into that workflow, as a package (a lib) or as a fork (source they own). Decided 2026-11-06" }
  - { id: S10, kind: decision, said: "a plugin belongs to the installation of one workflow: two profiles may each hold a different fork of one package, and each sees only its own. Decided 2026-11-06" }
  - { id: S11, kind: decision, said: "a fork keeps its package's name and code never names a path; one resolution root per profile, written by amy, maps the name to the fork under dependencies and $-refers to it under overrides. Decided 2026-11-06" }
  - { id: S12, kind: decision, said: "where a package's source lives is read from its package.json repository field (url and directory) at the tag <name>@<version>; no new field. A git URL of a repository directory forks the same way with nothing published to npm. Decided 2026-11-06" }
  - { id: S13, kind: decision, said: "config.yaml says whether add forks or installs a package by default (add: fork | package) and where forks go; --fork and --package override the mode and --to <dir> the place for one command. Decided 2026-11-06" }
  - { id: S14, kind: decision, said: "a fork for a workflow of your own (a directory or a symlink to a project) lives inside that project, outside what it publishes; one for an installed workflow lives under the profile in AMY_HOME. Decided 2026-11-06" }
  - { id: S15, kind: decision, said: "a fork records its base (package, version, commit); amy update merges three ways, the base, the fork and the new version, and stops on a conflict without touching the fork. Decided 2026-11-06" }
  - { id: S16, kind: decision, said: "every published package also ships a registry-item.json, generated, so npx shadcn add <url> is a second client for the same source; shadcn is not the update engine (S8). Decided 2026-11-06" }
  - { id: S17, kind: decision, said: "a fork or a workflow of your own whose source changed is built by its own build script before it mounts; the daemon remounts between ticks when either changes, from the config alone. Decided 2026-11-06" }
  - { id: S18, kind: reference, ref: "plans/compatibility-is-a-capability-not-a-version.md", said: "a second @amykit/core in an install disagrees with the host about every constant it exports, with nothing printed; that row moves the core to peerDependencies" }
  - { id: S19, kind: decision, said: "a resolution root per profile installs no core of its own: the core and the cli resolve from amy's own install in every root, so a profile root can never be the second copy S18 describes. Decided 2026-11-06" }
touches:
  - packages/cli/src/fork.ts
  - packages/cli/src/registry-item.ts
  - packages/cli/src/add.ts
  - packages/cli/src/remove.ts
  - packages/cli/src/update.ts
  - packages/cli/src/install.ts
  - packages/cli/src/loader.ts
  - packages/cli/src/spec.ts
  - packages/cli/src/workflow-add.ts
  - packages/cli/src/paths.ts
  - packages/cli/src/profiles.ts
  - packages/cli/src/daemon.ts
  - packages/cli/src/assemble.ts
  - packages/cli/src/config.ts
  - packages/cli/src/config-template.ts
  - packages/cli/src/index.ts
  - packages/cli/tests/**
  - packages/cli/skills/amy-workflow/SKILL.md
  - registry/**
  - scripts/registry-items.ts
  - package.json
  - docs/build/**
  - docs/reference/**
  - docs/start/**
  - .software-factory/policy.yaml
  - .software-factory/evidence/a-plugin-of-your-own-scenario.sh
untouched:
  - "plugins/**: every public plugin already says where its source is (S6); nothing in a plugin changes for it to be forked"
  - "packages/core/src/**: a fork is resolved before anything mounts; mount() sees one plugin per name as it does today"
criteria:
  - { id: A1, statement: "two profiles mount @amykit/plugin-linear, one as the published package and one as a fork, and each resolves its own; no source file in either names a path", proof: "test:packages/cli/tests/profile-root.test.ts", sources: [S2, S4, S10, S11], done: true }
  - { id: A2, statement: "a workflow installed from npm that imports @amykit/plugin-linear itself reaches the profile's fork, not its own copy", proof: "assertion:fork.an_installed_workflow_reaches_the_fork", sources: [S7, S9, S11], done: true }
  - { id: A3, statement: "amy add <package> --fork fetches the directory its repository field names at the tag <name>@<installed version>, writes it as a fork with its base recorded, and the profile mounts it", proof: "test:packages/cli/tests/fork.test.ts", sources: [S6, S12, S15], done: true }
  - { id: A4, statement: "a git URL naming a repository directory forks the same way, with no npm registry reached", proof: "test:packages/cli/tests/fork.test.ts", sources: [S12], done: true }
  - { id: A5, statement: "a package with no repository field, or a tag that does not exist, is refused before anything is written, naming the field or the tag and the URL that was asked", proof: "test:packages/cli/tests/fork.test.ts", sources: [S6, S12], done: true }
  - { id: A6, statement: "add follows config.yaml's add mode with no flag; --fork and --package override it, --to overrides the place, and an unknown mode is refused naming the key", proof: "test:packages/cli/tests/config.test.ts", sources: [S13], done: true }
  - { id: A7, statement: "a fork for a workflow of your own lands inside that workflow's project, a fork for an installed workflow under the profile's directory, and AMY_HOME moves the second", proof: "test:packages/cli/tests/paths.test.ts", sources: [S14], done: true }
  - { id: A8, statement: "npm pack of a workflow of your own that holds a fork lists none of the fork's files, and its manifest names no plugin as a dependency", proof: "test:packages/cli/tests/scaffold.test.ts", sources: [S1, S9, S14], done: true }
  - { id: A9, statement: "for every edit a person makes to a fork and every upstream change that touches other lines, amy update keeps the edit and takes the change", proof: "property:packages/cli/tests/fork-update.property.test.ts#take-upstream-whole", sources: [S15], done: true }
  - { id: A10, statement: "an upstream change on a line the person edited stops amy update for the install, names the files, leaves the fork byte for byte, and writes the marked merge to a path it names", proof: "test:packages/cli/tests/fork-update.test.ts", sources: [S8, S15], done: true }
  - { id: A11, statement: "a fork whose source digest changed is built before it mounts and one whose did not is not rebuilt; a failing build refuses the boot naming the fork and the build's output", proof: "test:packages/cli/tests/fork-build.test.ts", sources: [S17], done: true }
  - { id: A12, statement: "saving a file in a fork while the daemon runs remounts it after the tick in progress and never during one", proof: "test:packages/cli/tests/daemon.test.ts", sources: [S17], done: true }
  - { id: A13, statement: "a profile root holds no @amykit/core: the workflow and the fork it mounts see the host's core, one copy", proof: "test:packages/cli/tests/profile-root.test.ts", sources: [S18, S19], done: true }
  - { id: A14, statement: "amy workflow add --into copies the callee's source from its repository at the installed version, not its dist", proof: "test:packages/cli/tests/workflow-add.test.ts", sources: [S3, S12], done: true }
  - { id: A15, statement: "every public package has a generated registry-item.json under registry/ whose files are its source at its version, and a stale one turns the gate red naming it", proof: "test:packages/cli/tests/registry-item.test.ts", sources: [S16], done: true }
  - { id: A16, statement: "amy remove of a fork drops it from the profile root and never deletes the fork's directory", proof: "test:packages/cli/tests/fork.test.ts", sources: [S5, S9], done: true }
crosses:
  - { mechanism: install-and-update, answer: works, proof: "A9, assertion:fork.update_keeps_the_edit" }
  - { mechanism: profiles-and-state, answer: works, proof: "A1, assertion:fork.another_profile_keeps_the_published_package" }
  - { mechanism: config, answer: works, proof: "A6" }
  - { mechanism: mount-and-capabilities, answer: works, proof: "A13, assertion:fork.the_profile_root_holds_no_core" }
  - { mechanism: workflow-tooling, answer: n/a, why: "amy workflow check walks a workflow the same way whichever implementation of a port it mounts" }
guarantee:
  - { holds: "in one profile a package name resolves to one implementation, chosen by that profile's installation, and no source names a path", not_against: "a person editing a profile root's package.json or node_modules by hand" }
  - { holds: "amy update never loses a line a person wrote in a fork: it merges, or it stops and changes nothing", not_against: "a fork whose recorded base was edited or deleted by hand, or an upstream that moved a tag after it was released" }
  - { holds: "a remount happens between ticks, never inside one", not_against: "a file saved half-written at the moment the build reads it" }
failures:
  - { step: "fetching a fork's source", when: "the repository is unreachable, the field is absent or the tag does not exist", goes_to: "refused before anything is written, naming the URL and the tag" }
  - { step: "building a fork", when: "its build fails", goes_to: "the boot is refused naming the fork and the build output; a running daemon keeps the mount it had" }
  - { step: "merging a fork on update", when: "an upstream change overlaps a local edit", goes_to: "the update stops for the whole install, nothing moves, and the marked merge is written beside the fork" }
cut:
  - "two forks of one package in one profile: refused at mount, naming both directories"
  - "forking @amykit/core or @amykit/cli: refused, both resolve from amy's own install (S19)"
  - "a fork adding a port method a workflow calls: a fork changes how a port is answered; a missing method grows the port in the core, or stays a port the workflow declares itself. Decided 2026-11-06"
  - "shadcn's CLI as the update engine: refused, it records no base and only diffs or overwrites (S8)"
deviations:
  - ".software-factory/evidence/a-plugin-of-your-own/**: the scenario's published plugin and workflow, as fixtures beside the script the plan named"
  - ".allowed-root-files: declares registry/, the directory A15 writes at the repository root"
  - "plans/next-steps.md: the delivered row leaves the board"
  - "packages/test-fixtures/contracts/**: GitHub's REST description moved upstream and turned main red; refreshed so this change's CI can be green"
  - "packages/cli/src/plugin-commands.ts: each profile's commands, checks, files and setup come from the implementation it mounts, so a fork's are its own (review)"
  - "README.md and docs/development/the-gate.md: their generated gate tables gain the new gate"
  - "packages/cli/src/fork.ts holds the three-way merge, the profile root and the build: one module for what a fork is, rather than a file per step"
  - "the profile root nests in ~/.amy/plugins as plugins/profiles/<profile>, so a name it does not hold, the core included, walks up to the machine's root"
  - "S19's one core is the machine root's, the copy every installed workflow and plugin already resolved"
  - "a running daemon remounts by replacing itself between ticks, once a hidden `amy mount-check` boots the new source; a process keeps the modules it imported"
  - "a foreground `amy daemon` builds a changed fork and says to restart rather than replacing itself"
  - "a fork's first edit makes it build alone: a tsconfig extending outside the package is flattened and a missing build script added, after the base is recorded"
  - "a git URL names its directory the way pnpm reads one, <url>#path:<dir> or <url>#<ref>&path:<dir>"
  - "A9's property draws distinct base lines: among identical neighbours an edit's place is not in the text, and a line merge (git's too) may call it a conflict"
  - "a second property in the same file holds the guarantee over repeated lines, exact or stopped, against the same falsifier"
  - "two forks of one package in one profile are refused at `amy add --fork`, naming both directories: a profile root maps a name to one directory, so a mount never holds two"
exit: "Two workflows on one machine mount @amykit/plugin-linear, one published and one forked inside its project, each seeing its own; an edited fork rebuilds on restart, amy update keeps the edit, and the published workflow ships no plugin"
---
# A plugin is installed into a workflow

A workflow publishes the ports it needs and nothing else; the person running it installs each plugin into that workflow, as a package or as a fork of its source, and one machine can answer the same port differently for two workflows. The fork keeps the package's name, so no code ever names where it lives.
