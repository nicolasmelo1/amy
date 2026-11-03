---
"@amykit/cli": minor
"@amykit/core": minor
"@amykit/plugin-linear": minor
"@amykit/plugin-serial-engine": minor
"@amykit/workflow-errand": minor
"@amykit/workflow-note-to-plan": minor
"@amykit/workflow-pull-request": minor
"@amykit/workflow-ticket-to-qa": minor
---

**The config is written by what is mounted.** Every workflow's own
vocabulary — the attempt ceilings its decisions read, the status a ticket
moves to, where plans go and what judges them — moved out of the config's top
level and into the profile that drives the workflow, checked at mount against
the workflow's own `configSchema`. `amy init` writes a config that carries
only the machine, and a commented example that teaches the shape;
`amy add <workflow>` writes the profile block from what the workflow's schema
asks for, with the settings that need an answer written as placeholders and
the rest taken from defaults. `amy config explain` lists every setting the
machine and each mounted thing carries, with its type, its default and the
reason it is there; `amy config explain <plugin>` narrows to one.

A key of the old shape left at the top level is refused at boot by name, with
the place it moved to in the message, so nothing is silently read from where
it lived. `amy update` moves a v1 config for you: each old key is rewritten
under the profile or the plugin that reads it, the original file is kept
beside the config as `config.yaml.moved`, and a second update changes
nothing. The engine learns to tune itself at the same time — the serial
engine's retry between failed items is its own setting now, no longer
borrowed from whichever workflow's poll happened to be at the top of the
config.