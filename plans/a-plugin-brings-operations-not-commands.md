---
sources:
  - { id: S1, kind: code, ref: "packages/core/src/commands.ts", said: "a PluginCommand takes args as strings and answers through out.line: it speaks to a terminal, with no typed input or output any other door could read" }
  - { id: S2, kind: decision, said: "a plugin declares operations, not commands: adding or removing a plugin adds or removes its route, its command and its SDK method at once. Decided 2026-11-04" }
  - { id: S3, kind: decision, said: "PluginCommand is removed, not deprecated: nobody but this repository's own plugins declares one, so the interface breaks once, here. Decided 2026-11-04" }
  - { id: S4, kind: reference, ref: "docs/design/a-plugin-brings-its-own-commands.md", said: "a command is read after the module is imported and before anything mounts, so it answers on a machine that will not boot; mount: true asks for the ports and is refused by name otherwise" }
  - { id: S5, kind: decision, said: "operations keep that: read before mount, and one declaring mount: true is refused by name when the machine will not assemble; checks, setups and files stay as they are" }
  - { id: S6, kind: decision, said: "the command line is built from the contract at start: each operation a command, its cli binding naming its words and positional fields, every other input field a flag, its description the help" }
  - { id: S7, kind: decision, said: "an input field's schema decides its parsing: a number is parsed, a boolean is a bare flag, an array repeats, an enum lists its values in the help; a refused input names the flag and why" }
  - { id: S8, kind: decision, said: "with --json a command prints its output as JSON, a stream as JSON Lines, and an error as the envelope on stderr; the command line is driven by agents more than people. Decided 2026-11-04" }
  - { id: S9, kind: decision, said: "without --json the command line draws the output from its JSON and its schema alone: objects as labelled fields, arrays of objects as tables, enums coloured, descriptions as labels. Decided 2026-11-04" }
  - { id: S10, kind: decision, said: "no operation brings its own terminal drawing: one renderer for every output keeps a plugin's command looking like amy's, and keeps a plugin from writing to the terminal at all" }
  - { id: S11, kind: decision, said: "the exit code is the outcome: 0 for an output, 1 for a declared error, 2 for an input the schema refused, 70 for an internal error" }
  - { id: S12, kind: reference, ref: "packages/cli/src/plugin-commands.ts", said: "a command name belongs to one owner, amy --help marks it with the package, and the built-ins are not on offer; the same ownership holds for operation ids and cli words" }
  - { id: S13, kind: decision, said: "a plugin's operation is local-only unless it says otherwise, so installing a plugin never opens a route over TCP by surprise" }
  - { id: S14, kind: decision, said: "amy btw (errand), amy note (note-to-plan), amy roster (ticket-to-qa), amy worktrees (file-worktree) and amy models (agent-relay) become operations in this row, keeping their words" }
  - { id: S16, kind: reference, ref: "plans/amy-speaks-in-domains.md", said: "no door is written by hand, and a plugin changes the contract: its operations reach every door when installed and leave every door when removed" }
  - { id: S15, kind: decision, said: "amy contract prints the install's whole contract, services and mounted plugins, as an OpenAPI document; amy contract --check refuses one that does not build" }
  - { id: S17, kind: decision, said: "a workflow is one more door: an action calls a mounted plugin's operation by id with input its schema validates, and gets the output or the declared error, as the command line does. Decided 2026-11-06" }
  - { id: S18, kind: reference, ref: "plans/a-phase-is-proven-not-asserted.md", said: "each step of a scenario calls an operation by name with its input; a driver is reached only through the operations it offers" }
touches:
  - packages/core/src/commands.ts
  - packages/core/src/plugin.ts
  - packages/core/src/define-workflow.ts
  - packages/core/src/index.ts
  - packages/core/src/action-ports.ts
  - packages/core/tests/action-ports.test.ts
  - packages/cli/src/index.ts
  - packages/cli/src/plugin-commands.ts
  - packages/cli/src/operations/**
  - packages/cli/tests/plugin-commands.test.ts
  - packages/cli/tests/operations/**
  - packages/workflow-errand/src/plugin.ts
  - packages/workflow-note-to-plan/src/plugin.ts
  - packages/workflow-ticket-to-qa/src/plugin.ts
  - packages/workflow-ticket-to-qa/src/roster.ts
  - plugins/file-worktree/src/plugin.ts
  - plugins/agent-relay/src/plugin.ts
  - docs/build/**
  - .software-factory/policy.yaml
criteria:
  - { id: A1, statement: "a plugin outside this repository declaring one operation, installed with amy add, appears in amy --help marked with its package and in amy contract, runs, and both disappear when it is removed", proof: "deferred:test:packages/cli/tests/plugin-commands.test.ts", sources: [S2, S6, S12, S15, S16] }
  - { id: A2, statement: "a plugin declaring commands is refused at load, naming the plugin and the removed member", proof: "deferred:test:packages/cli/tests/plugin-commands.test.ts", sources: [S1, S3] }
  - { id: A3, statement: "on a machine whose config will not mount, an operation without mount runs, and one with mount: true is refused naming why", proof: "deferred:test:packages/cli/tests/plugin-commands.test.ts", sources: [S4, S5] }
  - { id: A4, statement: "a number, a boolean, an array and an enum field each parse from argv as their schema says, and a bad value is refused with exit 2 naming the flag", proof: "deferred:test:packages/cli/tests/operations/argv.test.ts", sources: [S6, S7, S11] }
  - { id: A5, statement: "with --json, an output prints as JSON that validates against the document, a stream as JSON Lines, and a declared error as the envelope on stderr with exit 1", proof: "deferred:test:packages/cli/tests/operations/json.test.ts", sources: [S8, S11] }
  - { id: A6, statement: "without --json, the same output prints its object as labelled fields and its array of objects as a table, from the output and its schema alone", proof: "deferred:test:packages/cli/tests/operations/draw.test.ts", sources: [S9, S10] }
  - { id: A7, statement: "two plugins claiming one operation id or one cli word are refused at load, naming both packages", proof: "deferred:test:packages/cli/tests/plugin-commands.test.ts", sources: [S12] }
  - { id: A8, statement: "a plugin operation that does not declare localOnly: false is local-only in amy contract", proof: "deferred:test:packages/cli/tests/plugin-commands.test.ts", sources: [S13] }
  - { id: A9, statement: "amy btw, note, roster, worktrees and models keep their words and their gate assertions, now as operations", proof: "deferred:assertion:lifecycle.a_workflow_command_is_its_own", sources: [S14] }
  - { id: A10, statement: "an action calls another plugin's operation by id and receives its output; input the schema refuses, or an id no mounted plugin offers, is the declared error naming the id", proof: "deferred:test:packages/core/tests/action-ports.test.ts", sources: [S17, S18] }
crosses:
  - { mechanism: mount-and-capabilities, answer: works, proof: "deferred:A3, A10" }
  - { mechanism: install-and-update, answer: works, proof: "deferred:A1" }
  - { mechanism: workflow-tooling, answer: works, proof: "deferred:A9" }
  - { mechanism: calls, answer: n/a, why: "defineWorkflow gains operations beside its actions; how an action is called is unchanged" }
  - { mechanism: hooks, answer: n/a, why: "an operation is not a hook and runs outside the machine's transitions; hooks are unchanged" }
  - { mechanism: agent-replies, answer: n/a, why: "amy models becomes an operation over the same price table; how an agent's reply is read is unchanged" }
  - { mechanism: checkouts-and-leases, answer: n/a, why: "amy worktrees becomes an operation reading the same leases; how a checkout is leased or released is unchanged" }
  - { mechanism: config, answer: n/a, why: "an operation receives its plugin's settings slice exactly as a command did; the schema language is unchanged" }
guarantee:
  - { holds: "a command, a route and an SDK method a plugin brings are one declaration, appearing and disappearing together", not_against: "a plugin a person removes by hand from ~/.amy/plugins without amy remove" }
  - { holds: "an action reaches only the operations of plugins its profile mounts", not_against: "an operation writing to a service its own plugin reaches: a workflow's write claims cover the tracker and the code host, not every operation" }
cut:
  - "keeping PluginCommand beside operations: refused, two ways to declare one thing is the drift this removes (S3)"
  - "an operation drawing its own terminal output: refused (S10)"
exit: "a plugin written outside this repository declares one operation, and after amy add it is a command in amy --help, an entry in amy contract, and prints the same output as JSON and as a table"
---
# A plugin brings operations, not commands

A plugin's command speaks only to a terminal, so nothing a plugin adds could ever be a route or an SDK method. A plugin declares operations, and the command line is drawn from them like every other door.
