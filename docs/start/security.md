---
title: Security
description: What amy can reach, what it refuses to do, and the parts that are your call.
group: Start here
order: 8
---

# Security

amy runs unattended, on a machine with your credentials, against repositories
your colleagues depend on. This page is what it does about that, and what it
does not.

## The threat that actually matters

**The agent's output, and anything the outside world wrote, must never become a
command line.**

A ticket body, a review comment, an agent's answer — all of those are written by
someone or something that is not you, and a machine that assembles a shell
command out of any of them is a machine that runs whatever a stranger can type
into an issue.

So the `commands` port takes a **name from an allowlist**, never a command line:

```yaml
plugins:
  "@amy/plugin-command":
    allow:
      typecheck: "npm run typecheck"
      test: "npm test"
```

A workflow says *which named command* and with what arguments. The config is the
only place that says what that name runs. A name that is not in the allowlist is
a refusal that names the alternatives.

## Nothing reaches the outside world except through two ports

Every adapter goes through `CommandRunner` or `GraphQLClient`. There is no
`child_process` and no `fetch` scattered through the code. That is what makes
each adapter testable against a scripted answer, and it is also the complete
list of places to audit.

## Credentials

- They live in `~/.amy/.env`, never in `config.yaml`.
- The environment beats the file, so exporting a key for one command works.
- The loader **returns the names it set, never the values**, so a command can
  report what happened without printing a secret.
- The event log records what a run cost, not what it was given.

## Your working directory is not a repository

amy works on tickets naming real colleagues and real customers. If it ran inside
a git repository, every accident that drops a file in the working directory
would be one `git add -A` away from being published.

It keeps nothing where you are standing, and there is a gate that proves it: the
installed command runs from a directory with no checkout in it, and the
directory is asserted untouched afterwards.

## The log is local, and stays local

The event log may name the work it is about — a ticket, a repository, a login.
Anything leaving the machine is projected and scrubbed at *that* boundary, never
in the log, so the operator's own view is not crippled to protect a report.

If you send amy's log anywhere, that projection is yours to write.

## What the machine refuses to do

- **Open a pull request when the gate is red.** The gate result is a state, not
  a warning.
- **Assign a reviewer against a roster nobody confirmed today.** People go on
  leave without editing a config file.
- **Start an expensive move past the budget ceiling.** Asked before the call,
  not after — a ceiling checked afterwards is a report, not a brake.
- **Boot with a config it cannot honour.** A plugin that will not import, a
  setting that is not one it declared, two plugins claiming the same port, an
  action the workflow emits that nothing can run: all refusals, at boot, by
  name.

## What is your call

**The agent has write access to your checkouts.** That is the job. The blast
radius is bounded by branch, by the gate, and by the pull request — amy never
merges — but the agent does edit real files in a real clone.

**The allowlist is only as narrow as you make it.** `allow: { anything: "sh -c"
}` defeats the whole model. The default templates ship narrow commands on
purpose.

**Plugins are code you install.** A plugin resolves by name at run time and runs
in-process with everything else. Installing one is the same trust decision as
installing any npm package, and the [catalogue](../catalog/index.md) is a directory rather
than an endorsement.

## Supply chain, on amy's own side

The repository holds itself to a set of checks that are proven to fire, not just
configured — dependency audit, secret scanning, insecure-pattern linting,
dead-code detection, workflow scanning. Which tool covers which hazard, and
which checks are deliberately off and why, is in
[The gate](../development/the-gate.md).

Found something? Open an issue, or if it is sensitive, say so in the issue
without a working exploit and it will be picked up privately.
