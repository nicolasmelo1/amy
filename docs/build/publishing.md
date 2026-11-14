---
title: Publishing
description: Getting your package installable, findable, and listed in the catalogue.
group: Build your own
order: 3
---

# Publishing

A plugin or a workflow is an ordinary npm package. There is no registry to apply
to and no review to pass: `amy add` installs it by name, and amy imports its
`plugin` export at boot like any other import.

## The package.json that works

```json
{
  "name": "@acme/plugin-jira",
  "version": "1.0.0",
  "description": "A tracker adapter for Jira.",
  "keywords": ["amy", "amy-plugin", "jira"],
  "license": "MIT",
  "type": "module",
  "main": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "exports": {
    ".": { "types": "./dist/index.d.ts", "import": "./dist/index.js" }
  },
  "files": ["dist"],
  "repository": { "type": "git", "url": "git+https://github.com/acme/amy-plugins.git", "directory": "plugins/jira" },
  "publishConfig": { "access": "public" }
}
```

and one dependency, on the core this release of amy ships:

<!-- amy:generated core-dependency -->

```json
"dependencies": { "@amykit/core": "^0.8.1" }
```

<!-- amy:end core-dependency -->

These are not optional:

- **`"type": "module"`**: amy loads a package with `import()`. A CommonJS
  package will not load.
- **A `plugin` export**: the loader reads `plugin` from the package and refuses
  one that exports none, naming it.
- **`exports`**: without it, resolution depends on `main` alone and breaks in
  ways that are hard to read.
- **`files`**: publish `dist`, never `src`. A package shipping its sources is
  one where a consumer can import past your surface by accident. A workflow
  also publishes `workflow.mmd`, its shape, which it cannot mount without; the
  `package.json` that `amy workflow new` writes already lists it.
- **`@amykit/core` as a dependency, not a peer**: it is types and a handful of
  small utilities, and a version mismatch is a compile error at your end rather
  than a runtime surprise at somebody else's.

## Versioning

Your plugin's version is yours. The one thing to be careful about is
`@amykit/core`: a caret range on its current minor, as above, is right while amy is pre-1.0, because
the contracts still move. When they stop moving, so can that.

Breaking changes that need a major, in order of how often they catch people:

- Removing a setting, or making an optional one required.
- Changing which port you mount.
- Changing which collection you contribute to, or under what name.

A setting *gaining* a default is not breaking. A setting *losing* one is.

## Being found

There is no central index to be added to. Discovery is a keyword and a topic:

| Where | What to do |
| :-- | :-- |
| **npm** | Add `amy-plugin` to `keywords` |
| **GitHub** | Add the `amy-plugin` topic to the repository |

That is the whole mechanism, and it is deliberate: a curated list in this
repository would be stale the day somebody publishes, and a package would have
to ask permission to exist.

See [Publishing a package](../catalog/publishing-a-package.md) for what a good
listing looks like, and [the catalogue](../catalog/index.md) for what is already there.

## A README people can act on

Somebody deciding whether to install it, and somebody configuring it, both want
to know at once what port it fills, what it needs told to it, and what it needs
in the environment.

amy generates its own package READMEs from exactly that: the schema, the ports,
the actions, operations and commands it brings, and the environment it reads,
all read out of the built package. The one paragraph written by hand, on when to
use it, is `amy.about` in its `package.json`. You do not have to generate yours,
but the shape is worth copying:

```markdown
# @acme/plugin-jira

A tracker adapter for Jira.

## What it extends
| Ports | `tracker` |
…
## Configuration
| Setting | Type | Required | Default | What it is |
…
## Environment
| `JIRA_API_TOKEN` | required at mount |
```

## Before you publish

```sh
npm run build
npm pack --dry-run          # is dist in there, and nothing else?
```

Then the check that matters, from a directory that is not your checkout:

```sh
work=$(mktemp -d) && npm pack --pack-destination "$work"
(cd "$work" && npm install ./*.tgz && node -e '
  import("@acme/plugin-jira").then(m => console.log(m.plugin.name))
')
```

Every unit test you have imports source from inside your workspace. This is the
first thing that does not. See [Testing](testing.md).

## Publishing

```sh
npm publish --access public
```

For a scoped package the `--access public` is required the first time, or it
publishes private and nobody can install it.
