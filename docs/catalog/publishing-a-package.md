---
title: Publishing a package
description: The keyword and the topic that make a package findable, and what a listing should say.
group: Packages
order: 2
---

# Publishing a package

## A keyword and a topic

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
ask, because a directory that requires permission is a directory missing the
packages it most needs to have.

Use `amy-plugin` for plugins and workflows alike. A workflow *is* a plugin:
`defineWorkflow` returns one, mounted through the same registry, and `amy add`
installs either. Splitting the keyword would make somebody looking for "things
I can mount" learn the distinction first.

## What a good listing says

What somebody needs before they will install anything:

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

**Do not depend on a workflow you do not need.** An adapter depends on a
workflow package only for the port types that workflow declares, as
`@amykit/plugin-file-tasks` does on the errand's `tasks` port. Never for its
logic, and never at all if the port it fills is one the core owns. Which ports
those are, and why: [the ports belong to the core](../design/the-ports-belong-to-the-core.md).

## Private packages

The plugin model exists for the packages that cannot be shared: a process that
names your employer's tooling, an adapter for something internal, an on-call
rota that is nobody else's business.

None of that needs npm. `amy add` takes a spec, and a spec can be:

- a package on a private registry,
- a package in a private GitHub repository (`amy add github:acme/private-plugin`),
- a URL to a tarball,
- **a path on disk**: `amy add ./local-plugin`, or a `file:` spec.

How a spec is read: [a spec is a name, a URL or a path](../design/a-spec-is-a-name-a-url-or-a-path.md).

The only thing that changes is where the package manager finds it. amy's side is
identical, and the `installed-plugins` gate proves it: packages installed onto a
machine with no checkout on it, driving a workflow this repository never
shipped. The decision behind it:
[plugins are installed, not compiled in](../design/plugins-are-installed-not-compiled-in.md).

## Keeping it working as amy moves

What tells you before your users do:

**Run the artifact check in your CI.** It is a short script, and it catches the
whole class of failure unit tests cannot reach. See
[Testing](../build/testing.md#artifact-tests-and-why-unit-tests-are-not-enough).

**Watch [the news](../changelog/index.md).** Contract changes are what a changeset is for,
and each is written for somebody reading it long after: what changed, and why it
was wrong before.
