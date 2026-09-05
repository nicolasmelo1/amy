# The world the `installed-plugins` scenario runs in

One package, and it is the whole point: `workflow-oncall` is a workflow amy
has never heard of. No package in this repository imports it, no name in the
CLI mentions it, and it depends on nothing — it is plain JavaScript exporting
a `plugin` that registers a workflow and contributes a runtime.

The scenario copies it out of here before installing it, so the install has
no path back into this checkout. That copy is what makes the claim honest:
what mounts is a package on a machine, not a directory in a workspace.

It is also the shortest complete example of the shape, at about forty lines,
which is why `skills/amy-workflow/SKILL.md` points at it.
