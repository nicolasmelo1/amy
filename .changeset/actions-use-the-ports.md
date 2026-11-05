---
"@amykit/workflow-errand": minor
"@amykit/workflow-note-to-plan": minor
"@amykit/workflow-ticket-to-qa": minor
---

**The actions use the ports.** The errand, note-to-plan and ticket-to-qa write
`discover`, `observe`, `remember` and every action as a function of the scope
`defineWorkflow` hands it: `scope.ports`, `scope.config`, `scope.policy`,
`scope.checkouts`, `scope.ctx` and `scope.announce`. `errandRuntime`,
`planRuntime` and `ticketRuntime` are gone, with their `…RuntimeDeps` and
`…RuntimeConfig` types; a test that built one mounts the declaration instead.

Before, each workflow kept the factory it had before `defineWorkflow`, and a
`WeakMap` adapter that assembled a deps object out of the scope to build it:
three copies of the same adapter. It cached nothing for an action, whose scope
is a new object every time, so every action rebuilt the whole runtime; and
ticket-to-qa carried its own `agent.run` and `notify.failed` lines behind an
`accountsAgentRuns: false` switch, beside the host's, when the framework
already hands every action an agent that accounts for each reply and an
`announce` that cannot cost a move. ticket-to-qa's progress policy is read
from `budget` through the declaration's `progress(scope)`, and its roster is
read from the profile when a look needs it, as before.
