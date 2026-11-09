---
"@amykit/plugin-prove": minor
"@amykit/plugin-agent-browser": minor
"@amykit/plugin-agent-desktop": minor
"@amykit/plugin-terminal": minor
"@amykit/workflow-feature-grooming": minor
"@amykit/cli": minor
---

**A phase is proven, not asserted.**

A project's `prove/` phase used to have nothing to call: passing the tests a
branch can run was the only evidence that work held, and it isn't evidence.
`@amykit/plugin-prove` is that phase. Its one workflow walks the scenario the
brief settled against the real system, and every scenario walks the same
diagram, so one curl and two apps with a fixture and a person differ in data
alone. The scenario is a `Scenario` section of the brief, so `amy brief check`
refuses a brief without it, or with a step naming an operation no mounted plugin
offers, and grooming does not stop until it is there.

A step calls an operation by id. A step is deterministic unless it says
`agent`, `human` or `wait-until`. An agent step that passes is kept as the
calls it made and replayed with no model. A human step asks in the work's
thread and keeps its leases while it waits. An assertion the run cannot
evaluate is `unsupported`, which blocks completion and is never counted as a
pass. A resource is the commands its person configured, run through the
commands port, and is refused at mount without a `check`. Its seats are leased
for the whole machine under Amy home, by priority, so two tickets needing one
account take turns. A fixture reads the world, acts only on what differs, and
asks a person when it cannot.

Each run leaves a proof in the project's artifact root, which `amy prove show`
reads. The proof stops counting when the code digest or the brief revision
moves. `amy prove record` records a run a person did by hand the same way.

Three drivers ship as plugins of their own, each offering operations:
`@amykit/plugin-agent-browser` (open, snapshot, act on refs, diff, and a UI
check that settles on the accessibility tree, then pixels, then an agent),
`@amykit/plugin-agent-desktop` and `@amykit/plugin-terminal`.

`@amykit/workflow-feature-grooming` is now a workflow a project's `brief/`
calls. It waits while the brief is groomed, then returns the criteria the
brief settled. It no longer mounts the `grooming-source` and
`grooming-tracker` ports, which nothing read; `groomFeature` is unchanged.
`examples/a-whole-project` walks brief, work and proof with the three shipped
workflows.

A project whose later phase asks the brief something now waits in `GROOMED`
after BRIEF until every phase's brief check is green. Before, the brief phase's
own check was enough to start the work, so a brief with no scenario reached
WORK and was only caught once it got to PROVE.
