---
title: Publishing
description: Getting your package installable, findable, and listed in the catalogue.
group: Build your own
order: 4
---

# Publishing

A plugin or a workflow is an ordinary npm package. There is no registry to apply
to and no review to pass — amy resolves it by name at run time like any other
import.

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
  "publishConfig": { "access": "public" },
  "dependencies": { "@amy/core": "^0.1.0" }
}
```

Four of those are not optional:

- **`"type": "module"`** — amy imports with `import()`. A CommonJS package will
  not load, and the error you will read is "not installed".
- **`exports`** — without it, resolution depends on `main` alone and breaks in
  ways that are hard to read.
- **`files`** — publish `dist`, not `src`. A package shipping its sources is one
  where a consumer can accidentally import past your surface.
- **`@amy/core` as a dependency, not a peer** — it is types and a handful of
  small utilities, and a version mismatch is a compile error at your end rather
  than a runtime surprise at somebody else's.

## Versioning

Your plugin's version is yours. The one thing worth being careful about is
`@amy/core`: a caret range (`^0.1.0`) is right while amy is pre-1.0, because the
contracts still move. When they stop moving, so can that.

Breaking changes worth a major, in order of how often they catch people:

- Removing a setting, or making an optional one required.
- Changing which port you mount.
- Changing which collection you contribute to, or under what name.

A setting *gaining* a default is not breaking. A setting *losing* one is.

## Being found

There is no central index to be added to. Discovery is two conventions:

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

Yours will be read by two audiences, and both want the same three things
immediately: what port it fills, what it needs told to it, and what it needs in
the environment.

amy generates its own package READMEs from exactly that — the schema, the mounts
and the contributions, read out of the built package. You do not have to
generate yours, but the shape is worth copying:

```markdown
# @acme/plugin-jira

A tracker adapter for Jira.

It provides the `tracker` port.

## Install
…
## Configuration
| Setting | Type | Required | Default | What it is |
…
## Environment
| Variable | |
| `JIRA_API_TOKEN` | required at mount |
```

## Before you publish

```sh
npm run build
npm pack --dry-run          # is dist in there, and nothing else?
```

Then the one check that matters, from a directory that is not your checkout:

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
