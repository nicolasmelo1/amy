---
"@amy/core": minor
---

The engine drives a workflow it does not know.

`WorkflowRuntime` is new in the core: what a workflow contributes so that
something else can run it — how to find work, what the world looks like, one
handler per action, and the fold only the workflow can do. The serial engine
takes one and keeps the half that names nothing: the queue, the attempt
counts, the budget and the handbrake.

For anyone driving this from a config: `repos`, `qaStatusName` and `policy`
moved from the engine's settings slice to the workflow's, and the engine
gained `retryDelayMs` of its own. `amy` maps both for you; a hand-written
`plugins:` slice needs the two keys moved.
