# The world the `installed-plugins` scenario runs in

One package, and it is the whole point: `workflow-oncall` is a workflow amy
has never heard of. No package in this repository imports it and no name in
the CLI mentions it. It is TypeScript exporting a `plugin` declared with
`defineWorkflow`, with its `workflow.mmd` beside it, and its only dependency
is the core it is declared with.

The scenario copies it out of here before installing it, compiled to the
JavaScript npm would ship, so the install has no path back into this checkout. That copy is what makes the claim honest:
what mounts is a package on a machine, not a directory in a workspace.

It is also the shortest complete example of the shape, a diagram and about
forty lines, which is why `skills/amy-workflow/SKILL.md` points at it.
