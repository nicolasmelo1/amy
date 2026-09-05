# @amy/plugin-command

Any command line tool, reached by a name the config allows.

```yaml
plugins:
  "@amy/plugin-command":
    allow:
      datadog: pup monitors list --json
      notion: ntn page get
      k8s: kubectl get pods
    timeoutMs: 120000
```

A workflow emits `run-command` with a name and arguments:

```js
{ type: "run-command", name: "datadog", args: ["--since", "1h"] }
```

## Why one adapter and not one per tool

`pup` for the monitors, `ntn` for the pages, `kubectl` for the cluster,
whatever next year's is. A plugin each would mean a package, a port, a config
block and a test suite per tool, all of them the same shape: run a line, read
what came back. Two of those already exist here — `@amy/plugin-command-gate`
and `@amy/plugin-plan-check` — which is the evidence that made this general
rather than the guess that would have.

The machine learns nothing about any of them. It learns that a name in the
config maps to a line somebody wrote down.

## The split that is the security model

**The command line comes only from the config. The arguments may come from a
workflow.** Nothing else is allowed to contribute either.

A line assembled from a ticket's body, an agent's answer or a file somebody
dropped in a directory would be a machine that runs whatever a stranger can
type into an issue — and this machine reads issues for a living.

Arguments are passed as positional parameters rather than spliced in:

```sh
sh -c 'pup monitors list --json "$@"' sh --since 1h
```

So an argument carrying a quote, a semicolon or a backtick is an argument.
There is a test that says exactly this, with `; rm -rf /` as the argument.

A name that is not in `allow` is refused with the list of names that are,
before anything runs.

## What comes back

```ts
{ name, ok, exitCode, output, at }
```

Both streams, verbatim, in `output`. Whatever reads this next is usually an
agent being told what happened, and a summary is the part that loses the line
that mattered.
