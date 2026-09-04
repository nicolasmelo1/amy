# @amy/plugin-serial-engine

Advances one work item by one move per tick, then chains the next look.

Mounts the `engine` role. It takes the workflow as a dependency rather than
importing one, which is what lets another workflow be mounted instead of
forked.

## One action, one handler

Actions are dispatched through a map keyed on the action name and exhaustive
over it, so a new action the workflow can emit will not compile until
something here runs it. That is the guarantee a `switch` gave, without putting
every action's argument shaping in one function.

`missingActions()` answers, before a ticket is touched, whether every action a
workflow declares it emits has both a handler and its port.

## The handbrake

Two mechanisms, because one is not enough:

- **at boundaries** it refuses to claim, and refuses to dispatch the next
  action of a plan already in flight
- **immediately** the run watches for the stop file and kills the children,
  because refusing the next thing is not stopping while an agent call runs for
  half an hour

## Settings

| Setting | Default | |
| :-- | :-- | :-- |
| `repos` | required | every repository review load is counted across |
| `qaStatusName` | required | the status a ticket moves to at handoff |
| `maxItemAttempts` | 5 | failures before the operator is told |
