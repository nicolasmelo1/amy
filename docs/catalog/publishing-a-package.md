---
title: Publishing a package
description: The two conventions that make a package findable, and what a listing should say.
group: Packages
order: 2
---

# Publishing a package

## The two conventions

```json
// package.json
{
  "keywords": ["amy", "amy-plugin", "jira"]
}
```

```sh
gh repo edit --add-topic amy-plugin
```

That is the whole listing mechanism. There is nothing to submit and nobody to
ask, because a directory that requires permission is a directory that is missing
the packages it most needs to have.

Use `amy-plugin` for both plugins and workflows. A workflow *is* a plugin — it
registers through the same `register(registry, ctx)` — and splitting the keyword
would mean somebody looking for "things I can mount" having to know the
distinction first.

## What a good listing says

The three things somebody needs before they will install anything:

**What port it fills, or what workflow it is.** `tracker`, `code-host`, `gate`,
or "a lifecycle for an on-call week". One line, at the top.

**What it needs told to it.** The settings table. amy generates its own package
READMEs from the declared schema, and the shape is worth copying:

```markdown
| Setting | Type | Required | Default | What it is |
| :-- | :-- | :-- | :-- | :-- |
| `site` | `string` | **yes** | | the Jira site, e.g. `acme.atlassian.net` |
```

**What it needs in the environment.** A credential discovered when a mount
refuses at three in the morning is the worst way to find out.

## What a listing should not do

**Do not claim compatibility you have not run.** `@amykit/core` is pre-1.0 and its
contracts still move. Say which version you built against.

**Do not vendor a workflow's types you do not need.** An adapter depends on a
workflow package only for the types that workflow declares — never for its
logic, and never at all if the port you fill is one the core owns.

## Private packages

The whole point of the plugin model is the packages that cannot be shared: a
process that names your employer's tooling, an adapter for something internal,
an on-call rota that is nobody else's business.

None of that needs npm. amy imports by name, and a name can be:

- a package on a private registry,
- a package in a private GitHub repository (`npm install github:acme/private-plugin`),
- **a path on disk** — `amy plugin add ./local-plugin` works, and so does a
  `file:` dependency.

The only thing that changes is where the package manager finds it. amy's side is
identical, and the `installed-plugins` gate proves exactly this: four packages
installed onto a machine with no checkout on it, driving a workflow this
repository never shipped.

## Keeping it working as amy moves

Two things will tell you before your users do:

**Run the artifact check in your CI.** Ten lines, and it catches the whole class
of failure unit tests structurally cannot — see
[Testing](../build/testing.md#artifact-tests-and-why-unit-tests-are-not-enough).

**Watch [the news](../changelog/index.md).** Contract changes are what a changeset is for,
and they are written for somebody reading it six months later: what changed, and
why it was wrong before.
