---
sources:
  - { id: S1, kind: friction, ref: "packages/cli/src/index.ts", said: "every built-in command does its work inside its commander handler, so the server, the SDK and an agent driving the command line would each reach a different copy of the same rule" }
  - { id: S2, kind: reference, ref: "plans/amy-speaks-in-domains.md", said: "no door is written by hand: the command line, the server's routes and the SDK are generated from the contract, so an operation is written once, in its domain" }
  - { id: S3, kind: decision, said: "every built-in that reads or changes amy's state moves into a domain of @amykit/services as operations, keeping its words: status, look, tick, run, brief, budget, add, remove, list, explain, skills, workflow, doctor, prune, recover, and init, update, serve and ui" }
  - { id: S4, kind: decision, said: "what stays in packages/cli is the host: the generator, and only what is critical or could leak if any other door reached it: daemon and after-daemon. Decided 2026-11-04" }
  - { id: S10, kind: decision, said: "init and update are operations so the window can onboard a person and update the install; serve and ui so a window can start a server or another renderer. Decided 2026-11-04" }
  - { id: S11, kind: decision, said: "init, update, serve, ui, start and stop are local-only: they write the install or start a process, so they are never routed over TCP and never offered to a paired device" }
  - { id: S12, kind: decision, said: "init's questions become its input fields: an agent passes them as flags, and a window draws them as its onboarding, both through the same operation" }
  - { id: S5, kind: decision, said: "start and stop are operations too, like serve and ui: start releases the handbrake and starts the daemon, stop --all ends it and holds the next run, each in its operation" }
  - { id: S6, kind: decision, said: "the-command-line-holds-no-rule (layer 0, command over the TS compiler's view of packages/cli) refuses a commander command outside the host list, and any import of a port or a store outside the host commands" }
  - { id: S7, kind: decision, said: "it also refuses a string literal under packages/cli equal to an operation id the contract declares: a door that names one operation is a door written for it by hand" }
  - { id: S8, kind: reference, ref: "plans/an-escalation-brings-its-evidence.md", said: "amy show and amy ask arrive before this row as hand-written commands; they move here with the rest" }
  - { id: S13, kind: reference, ref: "plans/every-endpoint-is-named-before-it-is-built.md", said: "the registry lands before this row and lists every built-in it moves as planned; this row flips them to delivered" }
  - { id: S14, kind: decision, said: "the handbrake is read and set through the StopSwitch the host hands invoke, never PAUSED by path, so a loop elsewhere pauses by the same operation once its switch is an adapter; pid and signal stay the host's. Decided 2026-11-05" }
  - { id: S15, kind: reference, ref: "plans/every-endpoint-is-named-before-it-is-built.md", said: "a plugin's operation input is accepted only as a root object of string, number, integer, boolean, enum or array-of-those fields, a #/$defs ref followed once; everything else is refused at mount, and the command line reads this one rule" }
  - { id: S16, kind: code, ref: "packages/cli/src/index.ts", said: "built-in spellings the generator cannot produce: supply's y/N before installing absent plugins (index.ts:375, 410), confirmDeletion's [y/N] that answers no without a terminal (index.ts:1739), and the skills ask choosing harnesses (index.ts:2543)" }
  - { id: S17, kind: decision, said: "every built-in's input is inside the shared accepted set; each spelling in S16 and S19 the generator cannot produce is named here and decided in this plan before its command moves, and none moves with it open. Decided 2026-11-08" }
  - { id: S18, kind: decision, said: "init's operation takes only fields amy defines; a plugin's settings are reached through amy setup <plugin>, never as init's input. Decided 2026-11-08" }
  - { id: S19, kind: code, ref: "packages/cli/src/index.ts", said: "workflow list is the default subcommand (isDefault, index.ts:2654), which the generator cannot produce; an optional positional such as update [package] it already spells as [name] (argv.ts:89)" }
  - { id: S9, kind: decision, said: "each command's gate assertions keep passing on the installed executable with no change to their scripts, so the move is proven to change nothing a person or agent types" }
touches:
  - packages/cli/src/**
  - packages/cli/tests/**
  - packages/services/src/**
  - packages/services/tests/**
  - packages/services/openapi.json
  - packages/services/surface.yaml
  - .software-factory/policy.yaml
  - .software-factory/rules/the-command-line-holds-no-rule.yaml
  - .software-factory/mutations/**
criteria:
  - { id: A1, statement: "a commander command added under packages/cli outside the host list fails the build, naming the command", proof: "deferred:test:mutation fixture for the-command-line-holds-no-rule", sources: [S2, S4, S6] }
  - { id: A2, statement: "a port imported by anything under packages/cli but a host command fails the build, naming the file", proof: "deferred:test:mutation fixture for the-command-line-holds-no-rule", sources: [S1, S6] }
  - { id: A3, statement: "an operation id written as a literal under packages/cli fails the build, naming the id and the file", proof: "deferred:test:mutation fixture for the-command-line-holds-no-rule", sources: [S2, S7] }
  - { id: A4, statement: "every built-in in the list is an operation in packages/services/openapi.json, with its words in its cli binding", proof: "deferred:test:packages/services/tests/contract.test.ts", sources: [S3, S8, S10] }
  - { id: A8, statement: "every operation this row moves is delivered in surface.yaml, and the surface gate is green", proof: "deferred:test:packages/services/tests/surface.test.ts", sources: [S3, S13] }
  - { id: A9, statement: "getHandbrake and setHandbrake reach the stop switch only through the StopSwitch they are handed, and a path to PAUSED under packages/services fails the build", proof: "deferred:test:mutation fixture for the-command-line-holds-no-rule", sources: [S14] }
  - { id: A7, statement: "init, update, serve, ui, start and stop are local-only in the contract, and init run with every answer as a flag writes the same install the questions did", proof: "deferred:test:packages/services/tests/contract.test.ts", sources: [S5, S10, S11, S12] }
  - { id: A5, statement: "amy stop --all ends the running daemon and holds the next amy run, and amy start releases it and starts the daemon, both through their operations", proof: "deferred:assertion:lifecycle.stop_all_holds_until_start", sources: [S5] }
  - { id: A6, statement: "the ticket-to-qa and errand gates pass on the installed executable with their scripts unchanged", proof: "deferred:assertion:errand.help_lists_only_the_machines_commands", sources: [S9] }
  - { id: A10, statement: "every built-in moved into the contract has an input inside the shared accepted set, and none is refused at mount by it", proof: "deferred:test:packages/services/tests/contract.test.ts", sources: [S15, S17] }
  - { id: A11, statement: "each spelling S16 and S19 name carries a decision in this plan before its command moves: the default subcommand under workflow, and the three terminal questions in supply, confirmDeletion and the skills ask", proof: "deferred:open — decided in this plan before the move, not yet decided", sources: [S16, S17, S19] }
  - { id: A12, statement: "init's input lists only fields amy defines, and no plugin's configSchema field is one of them", proof: "deferred:test:packages/services/tests/contract.test.ts", sources: [S12, S18] }
crosses:
  - { mechanism: status, answer: works, proof: "deferred:A4" }
  - { mechanism: install-and-update, answer: works, proof: "deferred:A6" }
  - { mechanism: workflow-tooling, answer: works, proof: "deferred:A6" }
  - { mechanism: profiles-and-state, answer: works, proof: "deferred:A5" }
  - { mechanism: mount-and-capabilities, answer: n/a, why: "the host still assembles the machine as it does today and hands the mounted ports to invoke; nothing about what mounts changes" }
  - { mechanism: queue-and-store, answer: n/a, why: "poke and tick move into domains whose repositories reach the queue and store through the same ports, with claim and recovery unchanged" }
  - { mechanism: config, answer: n/a, why: "config.yaml is read and its template written exactly as today; only which package holds the code changes" }
guarantee:
  - { holds: "every rule the command line runs is the one the server and the SDK run", not_against: "daemon and after-daemon, the two host commands, which run the machine itself and hold no rule a client could call" }
  - { holds: "a built-in's input is spelled by the same generator and the same accepted set as a plugin's", not_against: "a spelling S16 or S19 names while its decision is still open" }
cut:
  - "a plugin's settings as init's input: they belong to amy setup <plugin> (S18)"
  - "renaming a command while it moves: refused, the move is proven by nothing typed changing (S9)"
exit: "packages/cli holds the generator, daemon and after-daemon; every other built-in is an operation in the contract, and both lifecycle gates pass with their scripts unchanged"
---
# The command line holds no rule

The built-in commands do their work inside the command line, so every other door would need its own copy. They move into domains, and the command line keeps only the generator and the commands that start a process.
