---
"@amykit/cli": patch
---

The `amy-workflow` skill teaches the three pieces a workflow is, Mermaid, Act
and Decide: a `workflow.mmd`, a `decide` map with one pure decision per drawn
state, and `actions` written against the `scope` they are handed. Before, it
taught a `plan()` with a runtime beside it and a raw plugin registering states
by hand. Neither of those mounts any more, so a person following the skill
wrote a workflow amy refuses. The two opinions amy holds every workflow to,
MAD and BEP (Brief, Execute, Prove), are written down in *MAD and BEP* under
How it works.
