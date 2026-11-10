---
title: Security
description: What amy can reach, what it refuses to do, and the parts that are your call.
group: Start here
order: 8
---

# Security

amy runs unattended, on a machine with your credentials, against repositories
your colleagues depend on. This page is what it does about that, and what it
leaves to you.

## The threat that matters most

**The agent's output, and anything the outside world wrote, must never become a
command line.**

A ticket body, a review comment and an agent's answer are written by someone or
something that is not you. A machine that builds a shell command out of any of
them runs whatever a stranger can type into an issue.

So the `commands` port takes a **name from an allowlist**, never a command line:

```yaml
plugins:
  "@amykit/plugin-command":
    allow:
      typecheck: "npm run typecheck"
      test: "npm test"
```

A workflow names the command and passes arguments. The config is the only place
that says what the name runs. A name that is not in the allowlist is refused,
and the refusal lists the names that are.

## Where amy reaches outside

Every process amy starts goes through the `CommandRunner` boundary in the core,
which is what makes each adapter testable against a scripted answer. The network
calls are few and each lives in one file of its plugin: Linear's GraphQL client,
the Slack and Telegram APIs, and the agent relay's model price list. That is the
list to audit.

## What a workflow may write

A workflow declares what it may change in the tracker and on the code host:
commenting, setting a status, opening a pull request, requesting review,
resolving a thread, merging. An action that would make a write the workflow did
not claim is refused. The shipped workflows claim no merge, so amy does not
merge your pull requests. Why: [a workflow that claims no writes cannot reach one](../design/a-workflow-that-claims-no-writes-cannot-reach-one.md).

## Credentials

- They live in `~/.amy/.env`, never in `config.yaml`.
- The environment beats the file, so exporting a key for one command works.
- The loader **returns the names it set, never the values**, so a command can
  report what happened without printing a secret.
- The event log records what a run cost, not what it was given.

## Your working directory is not a repository

amy works on tickets naming real colleagues and real customers. If it ran inside
a git repository, any file dropped in the working directory would be one
`git add -A` away from being published.

It keeps nothing where you are standing, and a gate proves it: the installed
command runs from a directory with no checkout in it, and the directory is
asserted untouched afterwards. The agent works in a worktree of its own per
piece of work ([the worktree is the workplace](../design/the-worktree-is-the-workplace.md)).

## The log is local

The event log may name the work it is about: a ticket, a repository, a login.
Anything leaving the machine is projected and scrubbed at *that* boundary, never
in the log, so the operator's own view is complete.

If you send amy's log anywhere, that projection is yours to write.

## What the machine refuses to do

- **Open a pull request when the gate is red.** The gate result is a state.
- **Assign a reviewer against a roster nobody confirmed today.** People go on
  leave without editing a file. This is the ticket-to-qa workflow's rule.
- **Start an expensive move past the budget ceiling.** It asks before the call;
  a ceiling checked afterwards would be a report.
- **Boot with a config it cannot honour.** A plugin that will not import, a
  setting it did not declare, a port claimed by more than one plugin, an action the
  workflow emits that nothing can run: each is refused at boot, by name.

## What is your call

**The agent has write access to your checkouts.** That is the job. The blast
radius is bounded by the branch, the gate, the pull request and the writes the
workflow claims, but the agent edits real files in a real clone.

**The allowlist is only as narrow as you make it.** `allow: { anything: "sh -c" }`
defeats the model. The templates ship narrow commands.

**Plugins are code you install.** A plugin resolves by name at run time and runs
in-process with everything else. Installing one is the same trust decision as
installing any npm package, and the [catalogue](../catalog/index.md) is a
directory, not an endorsement. See [Install a plugin](../guides/install-a-plugin.md).

## Supply chain, on amy's own side

The repository holds itself to checks that are proven to fire: dependency audit,
secret scanning, insecure-pattern linting, dead-code detection and workflow
scanning. Which tool covers which hazard, and which checks are off and why, is
in [The gate](../development/the-gate.md).

Found something? Open an issue. If it is sensitive, say so in the issue without a
working exploit and it will be picked up privately.
