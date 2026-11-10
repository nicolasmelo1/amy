---
"@amykit/cli": minor
"@amykit/workflow-setup": minor
"@amykit/plugin-terminal-conversation": minor
---

**Setup is a workflow.**

`amy init` wrote a template and left the person to it. `amy setup` asks, one
question at a time, and is itself an amy workflow drawn in Mermaid: which
harness should do the work (the ones detected on this machine offered first),
which workflow it should drive, which channels should reach you — installing
only what was chosen, asking each chosen plugin's settings one field at a
time with the value the machine already holds offered as the default, and
checking what it configured before it says it is done. `amy setup <plugin>`
goes straight to configuring that one plugin. With no terminal to answer an
ask, the walk stops on the question and prints the flag that answers it, so a
pipeline can say it all at once. `amy init` stays as an alias running the same
walk, and the terminal it asks in ships as
`@amykit/plugin-terminal-conversation`, so the window can draw the same asks
later with no change to the workflow.
