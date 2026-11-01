---
sources:
  - { id: S1, kind: reference, ref: "plans/the-window-is-served.md", said: "gives amy a server every client is generated from; its document is written by the build from the controllers and must read without the code. Local-only means served on the local socket only" }
  - { id: S2, kind: decision, said: "one routes file grows unreviewable; shared request/response types make one screen's field change four. The shape is decided before the first route and held by build-failing rules, as the core's ignorance of workflows is" }
  - { id: S3, kind: reference, said: "domain-driven, as a FastAPI service this operator runs: each domain a folder with everything it needs, each operation one controller declaring its request and response, each controller calling one service; here in TypeScript" }
  - { id: S4, kind: decision, ref: "packages/server", said: "@amykit/server depends on @amykit/core and @amykit/ui. src/core/ is all domains share: errors.ts (envelope, DomainError), auth.ts (token, request transport), stream.ts (typed event to session stream), app.ts (mounts routers, writes the document)" }
  - { id: S5, kind: decision, said: "a domain folder (e.g. work/) holds controllers/ (poke-work.ts: route, request, response), services/ (execute), repositories/ (only port access), constants/, exceptions.ts (its errors only), router.ts (mounts its controllers only)" }
  - { id: S6, kind: decision, said: "a controller is one operation: @hono/zod-openapi createRoute with method, path, operationId, summary, description, the domain as tag; request and response Zod schemas in the same file only; every response listed with its status" }
  - { id: S7, kind: decision, said: "its handler validates nothing by hand, calls one service and maps its domain errors to declared statuses. It exports only route; types are inferred, never exported: alike operations declare two schemas, so changing one never changes the other" }
  - { id: S8, kind: decision, said: "a service is one use case: a class with execute taking plain values, returning a domain object or throwing its domain's error; it never sees a request, a status code or a port" }
  - { id: S9, kind: decision, said: "a repository is the only door to a port, wrapping what the domain needs of store, queue, event log, conversation or tracker; nothing else in the domain imports a port" }
  - { id: S10, kind: decision, said: "a domain imports core/, @amykit/core and @amykit/ui and nothing of another domain; two domains needing one record each read it through their own repository, the price of changing one without reading the other" }
  - { id: S11, kind: decision, said: "no database: the server reads records, queue, briefs and config.yaml through their ports, history from the event log's JSON Lines, and writes as an amy command does, through the same ports onto the same files" }
  - { id: S12, kind: decision, said: "a repository is not an ORM over tables but the domain's narrow reading of the mounted file-backed ports (file-store, file-queue, file-log, the brief store), and the only place it reaches them" }
  - { id: S13, kind: reference, ref: "docs/design/the-event-log-can-be-watched.md", said: "the daemon writes the files any moment; a repository reads them when asked, the event log says when to ask again, and nothing in server memory is treated as more current than the disk" }
  - { id: S14, kind: decision, said: "the ports write by rename, so no reader sees half a record; a repository writes only through them, never with a path of its own" }
  - { id: S15, kind: reference, ref: "plans/a-conversation-before-the-work.md", said: "sessions and subscriptions live in memory and end with the process; a client reopens on 410 session.expired. An ask is one file under amy's home; nothing needs a migration; deleting the server's files loses no work" }
  - { id: S16, kind: decision, said: "every operation has an operationId, a one-line summary, a description of what it does and never does, and its domain tag; every schema property a description; every request and response an example" }
  - { id: S17, kind: decision, said: "every error is the envelope { code, message, details? }; every code an operation returns is declared on it as <domain>.<reason> (work.not_found, session.contract_mismatch); an undeclared domain error is a 500 and a failing test" }
  - { id: S18, kind: decision, said: "every operation states x-amy-local-only and x-amy-writes (which writes it makes) as extensions, so a reader and the gate see the same thing" }
  - { id: S19, kind: decision, said: "each gate is deterministic, lands with this row before the first domain, and has a mutation fixture sf verify shows tripping it" }
  - { id: S20, kind: decision, said: "the-server-keeps-its-domains (layer 0, command, script over the TS compiler's view of packages/server) refuses: a controller exporting anything but route; an exported request/response schema; anything but router.ts importing controllers" }
  - { id: S21, kind: decision, said: "it also refuses a domain importing another; a controller or service importing a port; a service importing a controller; a domain missing controllers/, services/, exceptions.ts or router.ts" }
  - { id: S22, kind: decision, said: "the-contract-documents-itself (layer 4, command over openapi.json) refuses missing operationId, summary, description or tag; undescribed properties; exampleless requests/responses; non-envelope errors; codes not <domain>.<reason>; missing x-amy-local-only or x-amy-writes" }
  - { id: S23, kind: decision, said: "every-documented-response-is-tested (layer 3, command) refuses a declared (operationId, status) no test produced; controller tests run every operation in-process through the app, recording each status seen" }
  - { id: S24, kind: decision, said: "the-contract-only-breaks-on-purpose (layer 2, command) refuses an openapi.json change oasdiff breaking reports at ERR against the base document, unless the commit raises apiMajor; oasdiff is pinned in the toolchain lock beside sf and gh" }
  - { id: S25, kind: decision, said: "the-server-keeps-no-database (layer 0, text_pattern) refuses better-sqlite3, sqlite3, pg, mysql2, prisma, drizzle-orm, typeorm, knex, level, lmdb under packages/server, and any node:fs call outside repositories/" }
  - { id: S26, kind: code, ref: ".software-factory/policy.yaml", said: "existing L2.GENERATED_FILES_ARE_LOCKED refuses openapi.json edited without sf lock" }
touches:
  - packages/server/**
  - .software-factory/policy.yaml
  - .software-factory/mutations/**
criteria:
  - { id: A1, statement: "a controller exporting its response schema fails the build, naming the file and the export", proof: "deferred:test:mutation fixture for the-server-keeps-its-domains", sources: [S2, S6, S7, S19, S20] }
  - { id: A2, statement: "a domain importing another domain fails the build, naming both", proof: "deferred:test:mutation fixture for the-server-keeps-its-domains", sources: [S3, S5, S10, S21] }
  - { id: A3, statement: "a service or controller importing a port fails the build", proof: "deferred:test:mutation fixture for the-server-keeps-its-domains", sources: [S8, S9, S21] }
  - { id: A4, statement: "an operation without a description, or a property without one, fails the build naming the operation and the property", proof: "deferred:test:mutation fixture for the-contract-documents-itself", sources: [S1, S16, S18, S22] }
  - { id: A5, statement: "a declared response no test produced fails the build, naming the operation and the status", proof: "deferred:test:mutation fixture for every-documented-response-is-tested", sources: [S23] }
  - { id: A6, statement: "a domain error no controller declared answers 500 and fails the controller's test", proof: "deferred:test:packages/server/tests/core/errors.test.ts", sources: [S7, S17] }
  - { id: A7, statement: "removing a response field without raising apiMajor fails the build, and raising it lets the change through", proof: "deferred:test:mutation fixture for the-contract-only-breaks-on-purpose", sources: [S24, S26] }
  - { id: A8, statement: "importing a database driver or an ORM under packages/server, or touching node:fs outside a repository, fails the build", proof: "deferred:test:mutation fixture for the-server-keeps-no-database", sources: [S11, S12, S25] }
  - { id: A9, statement: "a record the daemon rewrites on disk is what the server answers next, with no restart and no cache in between", proof: "deferred:test:packages/server/tests/core/files-are-the-truth.test.ts", sources: [S13, S14] }
  - { id: A10, statement: "restarting the server loses no work: every record, queue item, brief and ask is where it was", proof: "deferred:test:packages/server/tests/core/restart.test.ts", sources: [S15] }
  - { id: A11, statement: "the empty server, core/ and no domain, builds a valid OpenAPI 3.1 document", proof: "deferred:test:packages/server/tests/core/app.test.ts", sources: [S4] }
guarantee:
  - { holds: "nothing the server holds in memory is ever more current than the files on disk", not_against: "the daemon writing those files from another process at any moment" }
cut:
  - "a database: refused, a second copy of the machine's state shows an untrue window the first time they disagree; if ever needed, a plugin behind a port, argued here"
exit: "with core/ and one example domain in a mutation fixture, sf verify shows each of five rules tripping on its fixture; the clean tree builds a document every rule accepts, before the window is served adds a first real domain"
---
# The server speaks in domains

A server written as one file of routes, or with shared request and response types, grows into one nobody can review or change safely, so its shape is fixed before the first route.
