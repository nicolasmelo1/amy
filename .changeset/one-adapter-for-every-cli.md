---
"@amy/core": minor
---

One adapter for every command line tool, instead of one plugin each.

`@amy/plugin-command` mounts a `commands` port and a `run-command` action. A
workflow asks for a command *by name*; the config is the only place that says
what that name runs:

```yaml
plugins:
  "@amy/plugin-command":
    allow:
      datadog: pup monitors list --json
      notion: ntn page get
```

That split is the security model. A command line assembled from a ticket body,
an agent's answer or a file somebody dropped in a directory would be a machine
that runs whatever a stranger can type into an issue — and this one reads
issues for a living. Arguments are passed as positional parameters
(`sh -c 'pup "$@"' sh --since 1h`), so an argument carrying a semicolon is an
argument.

It was made general by evidence rather than guess: `@amy/plugin-command-gate`
and `@amy/plugin-plan-check` were already the same shape twice.
