---
"@amykit/agent-kit": minor
---

A ladder per step, so the cheap step can reach a cheap model.

One ladder for the whole install was the right default and the wrong ceiling.
Reading a ticket to decide whether it is clear enough to start is not the same
job as writing the change, and putting both behind one list means paying the
expensive model to do the cheap step, or asking the cheap one to do the work.

```yaml
agent:
  ladder: [claude:sonnet, claude:opus]
  ladderByStep:
    triage: [claude:haiku]
    implement: [claude:opus]
```

Keyed by the workflow's action name, which the relay already had in hand for
choosing a skill — so this is a lookup where there was an array, not new
plumbing. A step that names no ladder uses the one above it, and so does an
install that sets none, which is every install today.

**Which is what makes routing by difficulty possible without anything here
learning the word.** A workflow that triages into easy and hard emits
different actions for each, and the config points them at different rungs. The
relay never finds out what "hard" means.

The two ladders stay separate concerns: a step picks one, and the failure
ladder is then climbed *inside* it. Falling back to the default when a rung
fails would mean an operator who asked for a cheap model got the expensive one
every time the cheap one wobbled.

A name inside `ladderByStep` mounts its harness and contributes its model tier
exactly as a name in `ladder` does. Reading only the default would have refused
that mount at boot — correctly, but for a reason nobody could see from the
config they wrote.
