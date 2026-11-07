---
base: 93d59dea5bcd9a218a2e3f657bcfae8c26df5382
sources:
  - { id: S1, kind: decision, said: "one core, three doors: amy's rules live in one contract, and the API, the SDK and the command line are read from it, so whichever door calls, the same code runs. Decided 2026-11-04" }
  - { id: S2, kind: decision, said: "documentation lives in the contract: an operation's summary and description are what amy --help, the OpenAPI document and the SDK's editor hints all print, so no door documents itself by hand. Decided 2026-11-04" }
  - { id: S3, kind: decision, said: "the contract is amy's own, small enough to write here: no oRPC, tRPC or ts-rest underneath, so a plugin's operations depend on @amykit/core and nothing else. Decided 2026-11-04" }
  - { id: S4, kind: friction, ref: "packages/cli/src/index.ts", said: "the command line holds the rules today: 2844 lines of commander handlers doing the work inline, so a server would either call into a CLI or copy it" }
  - { id: S5, kind: decision, said: "defineOperation in @amykit/core declares one operation: id, domain, summary, description, input, output, declared errors, examples, localOnly, writes, mount, and an http binding (method, path, status) and an optional cli one" }
  - { id: S6, kind: decision, said: "input and output are typed against Standard Schema and Standard JSON Schema, interfaces copied into core with no runtime dependency, so core stays dependency-free and any library implementing them can declare an operation" }
  - { id: S7, kind: reference, ref: "https://standardschema.dev/json-schema", said: "Standard JSON Schema exposes ~standard.jsonSchema.input and output with a target such as draft-2020-12; Zod implements it from 4.2, ArkType and Valibot too" }
  - { id: S8, kind: decision, said: "an output is a value or a stream of named events: a stream is SSE over HTTP, an async iterator in the SDK, and one line per event on the command line (JSON Lines with --json)" }
  - { id: S9, kind: decision, said: "@amykit/services holds amy's own domains and depends on @amykit/core and @amykit/ui; it writes Zod 4.2+ schemas. Transports live elsewhere: packages/cli, packages/server, packages/sdk" }
  - { id: S10, kind: decision, said: "a domain folder (e.g. work/) holds operations/ (poke-work.ts: one defineOperation), services/ (execute), repositories/ (only port access), constants/, exceptions.ts (its errors only), index.ts (exports its operations only)" }
  - { id: S11, kind: decision, said: "an operation file declares its input and output schemas in the same file and exports only the operation; types are inferred, never exported: alike operations declare two schemas, so changing one never changes the other" }
  - { id: S12, kind: decision, said: "its handler validates nothing by hand, calls one service and maps its domain errors to the errors it declared; it never sees a request, a status code, argv or a terminal" }
  - { id: S13, kind: decision, said: "a service is one use case: a class with execute taking plain values, returning a domain object or throwing its domain's error; it never sees a transport or a port" }
  - { id: S14, kind: decision, said: "a repository is the only door to a port, wrapping what the domain needs of store, queue, event log, conversation or tracker; nothing else in the domain imports a port" }
  - { id: S15, kind: decision, said: "a domain imports @amykit/core and @amykit/ui and nothing of another domain; two domains needing one record each read it through their own repository, the price of changing one without reading the other" }
  - { id: S16, kind: decision, said: "no database ships: services read records, queue, briefs, config.yaml and the event log through their ports and write through them; state kept elsewhere is an adapter behind the same port, never a driver here. Amended 2026-11-05" }
  - { id: S17, kind: reference, ref: "docs/design/the-event-log-can-be-watched.md", said: "the daemon writes the files any moment; a repository reads them when asked, the event log says when to ask again, and nothing in memory is treated as more current than the disk" }
  - { id: S18, kind: decision, said: "the ports write by rename, so no reader sees half a record; a repository writes only through them, never with a path of its own" }
  - { id: S19, kind: decision, said: "every operation has an id, a one-line summary, a description of what it does and never does, and its domain; every schema property a description; every input and output an example" }
  - { id: S20, kind: decision, said: "every error is the envelope { code, message, details? }; every code an operation returns is declared on it as <domain>.<reason>; an undeclared domain error is an internal error and a failing test" }
  - { id: S21, kind: decision, said: "the contract is the sum of @amykit/services and every mounted plugin's operations; its document, packages/services/openapi.json, is generated from services alone by npm run build, extensions x-amy-local-only and x-amy-writes included" }
  - { id: S22, kind: decision, said: "invoke(contract, id, input, context) runs one operation in process, validating input and output against its own schemas: the one road every door takes. Not call, which workflow call states already export" }
  - { id: S23, kind: decision, said: "each gate is deterministic, lands with this row before the first domain, and has a mutation fixture sf verify shows tripping it" }
  - { id: S24, kind: decision, said: "the-services-keep-their-domains (layer 0, command over the TS compiler's view of packages/services) refuses an operation file exporting anything but its operation, and an exported input or output schema" }
  - { id: S25, kind: decision, said: "it also refuses a domain importing another; an operation or service importing a port; a service importing an operation; a domain missing operations/, services/, exceptions.ts or index.ts; any transport import under packages/services" }
  - { id: S26, kind: decision, said: "the-contract-documents-itself (layer 4, command over openapi.json) refuses missing id, summary, description or domain; undescribed properties; exampleless input or output; non-envelope errors; codes not <domain>.<reason>; missing x-amy-local-only or x-amy-writes" }
  - { id: S27, kind: decision, said: "every-declared-error-is-tested (layer 3, command) refuses a declared (operation, error code) no test produced; operation tests run every operation through invoke, recording each outcome seen" }
  - { id: S28, kind: decision, said: "the-contract-only-breaks-on-purpose (layer 2, command) refuses an openapi.json change oasdiff breaking reports at ERR against the base document, unless the commit raises apiMajor; oasdiff is pinned in the toolchain lock beside sf and gh" }
  - { id: S29, kind: decision, said: "the-services-keep-no-database (layer 0, text_pattern) refuses better-sqlite3, sqlite3, pg, mysql2, prisma, drizzle-orm, typeorm, knex, level, lmdb under packages/services, and any node:fs call outside repositories/" }
  - { id: S31, kind: decision, said: "no door is written by hand: the command line, the server's routes and the SDK are generated from the contract, so an operation is written once, in its domain, and nowhere else. Decided 2026-11-04" }
  - { id: S32, kind: decision, said: "a plugin changes the contract: installing one adds its operations to every door, removing one takes them away, with no door edited and nothing rebuilt by hand. Decided 2026-11-04" }
  - { id: S33, kind: decision, said: "what a port persists is the truth, files by default and wherever an adapter keeps it otherwise: nothing in memory is more current than it, and memory holds a value only when reading it is impossible. Decided 2026-11-05" }
  - { id: S34, kind: decision, said: "a repository awaits every port call, synchronous or not, so a store, queue or log answering over a network changes the port's signature and its adapters, never a domain. Decided 2026-11-05" }
  - { id: S35, kind: decision, said: "a domain names no file adapter: FileStore, FileQueue, FileEventLog and the PAUSED path are reached only through the interface a repository is handed, so amy running on several machines or in CI is a matter of adapters. Decided 2026-11-05" }
  - { id: S30, kind: code, ref: ".software-factory/policy.yaml", said: "existing L2.GENERATED_FILES_ARE_LOCKED refuses openapi.json edited without sf lock" }
touches:
  - packages/core/src/operation.ts
  - packages/core/src/standard-schema.ts
  - packages/core/src/index.ts
  - packages/core/tests/operation.test.ts
  - packages/services/**
  - package.json
  - package-lock.json
  - tsconfig.json
  - tsconfig.tests.json
  - vitest.config.ts
  - .github/workflows/software-factory.yml
  - scripts/check-toolchain.ts
  - scripts/setup-dev.sh
  - CONTRIBUTING.md
  - docs/**
  - .changeset/**
  - .software-factory/policy.yaml
  - .software-factory/rules/**
  - .software-factory/mutations/**
criteria:
  - { id: A1, statement: "an operation file exporting its output schema fails the build, naming the file and the export", proof: "deferred:test:mutation fixture for the-services-keep-their-domains", sources: [S10, S11, S23, S24] }
  - { id: A2, statement: "a domain importing another domain fails the build, naming both", proof: "deferred:test:mutation fixture for the-services-keep-their-domains", sources: [S10, S15, S25] }
  - { id: A3, statement: "a service or operation importing a port, or anything under packages/services importing commander, hono or node:http, fails the build", proof: "deferred:test:mutation fixture for the-services-keep-their-domains", sources: [S1, S4, S12, S13, S14, S25] }
  - { id: A4, statement: "an operation without a description, or a property without one, fails the build naming the operation and the property", proof: "deferred:test:mutation fixture for the-contract-documents-itself", sources: [S2, S19, S26] }
  - { id: A5, statement: "a declared error no test produced fails the build, naming the operation and the code", proof: "deferred:test:mutation fixture for every-declared-error-is-tested", sources: [S27] }
  - { id: A6, statement: "a domain error no operation declared comes back from invoke as an internal error and fails the operation's test", proof: "deferred:test:packages/services/tests/errors.test.ts", sources: [S12, S20] }
  - { id: A7, statement: "removing an output field without raising apiMajor fails the build, and raising it lets the change through", proof: "deferred:test:mutation fixture for the-contract-only-breaks-on-purpose", sources: [S28, S30] }
  - { id: A8, statement: "importing a database driver or an ORM under packages/services, or touching node:fs outside a repository, fails the build", proof: "deferred:test:mutation fixture for the-services-keep-no-database", sources: [S16, S29] }
  - { id: A9, statement: "a record the daemon rewrites on disk is what invoke answers next, with no restart and no cache in between", proof: "deferred:test:packages/services/tests/files-are-the-truth.test.ts", sources: [S17, S18] }
  - { id: A10, statement: "an operation declared with a Zod schema and one declared with an ArkType schema both run through invoke and both appear in the document, and @amykit/core still has no runtime dependency", proof: "deferred:test:packages/core/tests/operation.test.ts", sources: [S3, S5, S6, S7] }
  - { id: A11, statement: "invoke refuses an input its schema rejects and an output its schema rejects, naming the operation, before and after the handler", proof: "deferred:test:packages/core/tests/operation.test.ts", sources: [S22] }
  - { id: A14, statement: "a workflow call state and a call(callee, binding) in errand still run as before, beside invoke, with both exported from @amykit/core", proof: "deferred:test:packages/core/tests/operation.test.ts", sources: [S22] }
  - { id: A15, statement: "a repository that calls a port without awaiting it, or a domain that imports a file adapter by name, fails the build", proof: "deferred:test:mutation fixture for the-services-keep-no-database", sources: [S33, S34, S35] }
  - { id: A12, statement: "a streaming operation yields its named events through invoke in order, and each event schema is in the document", proof: "deferred:test:packages/core/tests/operation.test.ts", sources: [S8] }
  - { id: A13, statement: "services with no domain build a valid OpenAPI 3.1 document, and one example domain adds exactly its operations to it", proof: "deferred:test:packages/services/tests/contract.test.ts", sources: [S9, S21, S31, S32] }
crosses:
  - { mechanism: queue-and-store, answer: n/a, why: "a repository reaches file-store and file-queue only through their ports, whose claim, recovery and pruning are unchanged; this row ships no domain that writes" }
  - { mechanism: briefs, answer: n/a, why: "read only through the brief store's port; this row ships no domain that reads it" }
  - { mechanism: events-and-notifications, answer: n/a, why: "services read the event log to know when to ask again; they log and tell no one anything in this row" }
  - { mechanism: mount-and-capabilities, answer: n/a, why: "invoke is handed the mounted ports by its caller; how a door mounts them is a-plugin-brings-operations-not-commands's and the-window-is-served's" }
  - { mechanism: rendering, answer: n/a, why: "@amykit/ui is imported for its types; packages/ui is untouched" }
guarantee:
  - { holds: "nothing the services hold in memory is ever more current than what the ports persist, the files on disk by default", not_against: "the daemon writing that state from another process, or another machine, at any moment" }
cut:
  - "a database shipped with amy, or a second copy of the state beside the ports': refused, it shows an untrue window the first time they disagree; state kept in one is a plugin behind its port (S16, S33)"
  - "Store, Queue and EventLog made asynchronous in the core: the row that brings the first adapter kept off this machine; repositories already await them (S34)"
  - "oRPC, tRPC or ts-rest underneath: refused (S3); a plugin's operations would depend on a third party's API"
  - "a transport in this row: the command line, the server and the SDK each read the contract in their own row"
exit: "with one example domain in a mutation fixture, sf verify shows each of five rules tripping on its fixture; the clean tree builds a document every rule accepts, and invoke runs a Zod and an ArkType operation alike"
---
# amy speaks in domains

amy's rules live inside its command line, so a server or an SDK would either call into a CLI or copy it. One contract comes first: every operation declared once, with its documentation, and every door read from it.
