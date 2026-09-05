---
"@amy/cli": minor
"@amy/core": minor
---

`amy btw` — something said in passing becomes work.

```sh
amy btw "bump the stale deps in the api package"
```

The cheapest thing to lose is what somebody says while doing something else,
and a ticket is the wrong shape for it: a ticket has an owner, a date and a
conversation attached, and a sentence said in passing has none of those. amy
had two ways in and neither fit — a ticket is work a tracker already knows
about, a note is friction amy itself hit — so there was nowhere for *work
somebody wants done that nobody will open a ticket for*.

A third workflow, `@amy/workflow-errand`, picks the task up, works in a branch
of the repository it names, and either opens a pull request or comes back with
an answer. **An errand that changed nothing is finished, not failed** — half
of what people say in passing is "check whether X", which ends in a sentence.

**Past a few in flight it holds and says so once.** Capturing costs nothing,
and the failure that follows from that is thirty open pull requests nobody
asked to review.

`@amy/plugin-file-tasks` keeps the tasks as a directory of markdown files, so
an editor or a hook can add one too. `/amy-btw` is the skill: its job is
turning what was said into a task that survives losing the conversation.

It cost the core one action name — `run-errand`, the generic "ask the agent",
which is now wanted by two workflows under names of their own. Nothing else
changed: not the engine, not either other workflow.
