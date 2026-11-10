# @amykit/workflow-setup

## 0.7.0

### Minor Changes

- 79a3fbd: **Setup is a workflow.**
  
  `amy init` wrote a template and left the person to it. `amy setup` asks, one
  question at a time, and is itself an amy workflow drawn in Mermaid: which
  harness should do the work (the ones detected on this machine offered first),
  which workflow it should drive, which channels should reach you — installing
  only what was chosen, asking each chosen plugin's settings one field at a
  time with the value the machine already holds offered as the default, and
  checking what it configured before it says it is done. `amy setup <plugin>`
  goes straight to configuring that one plugin. With no terminal to answer an
  ask, the walk stops on the question and prints the flag that answers it, so a
  pipeline can say it all at once. The old `amy init` is gone, alias included, and
  `amy setup <workflow>` writes the workflow's own files — the ticket workflow's
  roster — into the profiles that mount it. The terminal it asks in ships as
  `@amykit/plugin-terminal-conversation`, so the window can draw the same asks
  later with no change to the workflow.

### Patch Changes

- 09cb74f: The docs describe the contract that exists. Every README is rewritten against the code: a plugin's README lists the ports, actions, operations, commands, events and environment its package registers, and opens with `amy.about`, a new field in its package.json saying when to use it.
- Updated dependencies [b761f29]
- Updated dependencies [3b540fa]
- Updated dependencies [cea9b94]
- Updated dependencies [2c7324c]
- Updated dependencies [1ad01d3]
- Updated dependencies [4a55287]
- Updated dependencies [91f6caf]
- Updated dependencies [ac4faca]
- Updated dependencies [ebae48c]
- Updated dependencies [2b4deec]
- Updated dependencies [989f399]
- Updated dependencies [7d2dd00]
- Updated dependencies [da95fc7]
- Updated dependencies [b83a214]
- Updated dependencies [65ebf9f]
- Updated dependencies [8b21570]
- Updated dependencies [d85dacd]
- Updated dependencies [c7cd07a]
- Updated dependencies [bb67d1f]
- Updated dependencies [ec32d67]
- Updated dependencies [b266baf]
- Updated dependencies [f062bea]
- Updated dependencies [3649573]
- Updated dependencies [f4069bb]
- Updated dependencies [09cb74f]
- Updated dependencies [f9b65f6]
- Updated dependencies [37504c1]
- Updated dependencies [2363da5]
- Updated dependencies [0ef3ae3]
- Updated dependencies [0815efb]
  - @amykit/core@0.7.0
