# The server speaks in domains

*The window is served* gives amy a server whose contract every client is
generated from. A server written as one file of routes grows into a file
nobody can review; a server whose routes share request and response types
grows into one where changing a field for one screen changes it for four. The
shape is decided before the first route, and held by rules that fail the
build, the way the core's ignorance of workflows is.

The shape is domain-driven, and it is the one an API this operator already
runs uses — a FastAPI service where each domain is a folder with everything it
needs, each operation is one controller file declaring its own request and
response, and each controller calls one service — written here in TypeScript.

## The layout

`packages/server` (`@amykit/server`, depending on `@amykit/core` and
`@amykit/ui`), one folder per domain:

```text
packages/server/src/
├── core/                      the only thing domains share
│   ├── errors.ts              the error envelope and DomainError
│   ├── auth.ts                the token and the loopback check
│   ├── stream.ts              writing a typed event to the session stream
│   └── app.ts                 mounts every domain's router, writes the document
└── work/                      one domain
    ├── controllers/
    │   └── poke-work.ts       one operation: its route, its request, its response
    ├── services/
    │   └── poke-work.ts       one use case, `execute(...)`
    ├── repositories/
    │   └── work-records.ts    the only place this domain reaches a port
    ├── constants/
    ├── exceptions.ts          this domain's errors, and nothing else's
    └── router.ts              mounts this domain's controllers, and only that
```

**A controller is one operation.** It declares one route with
`@hono/zod-openapi`'s `createRoute` — method, path, `operationId`, summary,
description, the domain as its tag — with its request and response as Zod
schemas **in the same file and nowhere else**, every response it can return
listed with its status, and a handler that validates nothing by hand, calls
one service, and maps that service's domain errors to its declared statuses.
It exports one binding, `route`. Its request and response types are inferred
in the file and never exported: two operations that look alike today declare
two schemas, so changing one never changes the other.

**A service is one use case.** A class with `execute`, taking plain values,
returning a domain object or throwing one of its domain's errors. It never
sees a request, a status code or a port.

**A repository is the only door to a port.** It wraps what the domain needs
of the store, the queue, the event log, the conversation or the tracker, and
nothing else in the domain imports a port.

**A domain is isolated.** It imports `core/`, `@amykit/core` and `@amykit/ui`,
and nothing of another domain. Two domains that need the same record each read
it through their own repository: the duplication is the price of being able
to change one without reading the other.

## There is no database

amy keeps everything on the machine it runs on, as files, and the server adds
no second place to keep it. What the server shows it reads from what amy
already writes: the records, the queue, the briefs and `config.yaml` through
the ports that own them, and what happened from the event log, the JSON Lines
files the machine appends to. What the server changes it writes the same way an
`amy` command does, through the same ports, onto the same files.

So a **repository is not an ORM over tables**. It is the domain's narrow
reading of the file-backed ports amy already mounts — `file-store`,
`file-queue`, `file-log`, the brief store — and the only place a domain
reaches them. Three consequences follow, and each is a decision:

- **The files are the truth, the server only remembers.** The daemon writes
  those files from another process at any moment. A repository reads them
  when asked, the event log says when to ask again (*the event log can be
  watched*), and nothing the server holds in memory is ever treated as more
  current than the disk.
- **Writes take the files' own discipline.** The ports already write by
  rename, so a reader never sees half a record; a repository writes only
  through them, never with a path of its own.
- **What the server owns is small and on disk too.** Sessions and
  subscriptions live in memory and end with the process — a client reopens,
  as `410 session.expired` tells it to. An ask (*a conversation before the
  work*) is one file under amy's home, like a task or a note. Nothing needs a
  migration, and deleting the server's own files loses no work.

A database would be a second copy of the machine's state, and the first time
the two disagreed a person would be looking at a window that is not telling
the truth. If one is ever needed, it is a plugin behind a port, like
everything else, and this section is where that would be argued.

## The contract documents itself

The document is written by the build from the controllers (*the window is
served*) and has to be readable without the code:

- every operation has an `operationId`, a one-line `summary`, a `description`
  that says what it does and what it never does, and its domain as its tag;
- every schema property has a `description`, and every request and response an
  `example`;
- every error is the shared envelope — `{ code, message, details? }` — and
  every `code` an operation can return is declared on it, named
  `<domain>.<reason>` (`work.not_found`, `session.contract_mismatch`); a domain
  error no controller declared is a 500 and a failing test, never a new code
  nobody documented;
- every operation says whether it is **loopback-only** and which **writes** it
  makes, as extensions on the operation (`x-amy-loopback-only`,
  `x-amy-writes`), so a reader and the gate see the same thing.

## The gates

Each is deterministic, lands with this row before the first domain, and has a
mutation fixture `sf verify` shows tripping it.

| Gate or rule | What it refuses |
| :-- | :-- |
| `the-server-keeps-its-domains` (layer 0, `kind: command`, a script over the TypeScript compiler's view of `packages/server`) | a controller exporting anything but `route`; a request or response schema exported; anything but a domain's `router.ts` importing its controllers; a domain importing another domain; a controller or service importing a port; a service importing a controller; a domain missing `controllers/`, `services/`, `exceptions.ts` or `router.ts` |
| `the-contract-documents-itself` (layer 4, `kind: command`, a script over `openapi.json`) | an operation without `operationId`, summary, description or tag; a property without a description; a request or response without an example; an error response that is not the envelope; a code not named `<domain>.<reason>`; an operation without `x-amy-loopback-only` and `x-amy-writes` |
| `every-documented-response-is-tested` (layer 3, `kind: command`) | an `(operationId, status)` pair the document declares and no test produced; the controller tests run every operation in-process through the app and record each status they saw |
| `the-contract-only-breaks-on-purpose` (layer 2, `kind: command`) | a change to `openapi.json` that `oasdiff breaking` against the base branch's document reports at `ERR`, unless the same commit raises `apiMajor`; `oasdiff` is pinned in the toolchain lock beside `sf` and `gh` |
| `the-server-keeps-no-database` (layer 0, `text_pattern`) | a database driver, an ORM or an embedded store imported anywhere under `packages/server` — `better-sqlite3`, `sqlite3`, `pg`, `mysql2`, `prisma`, `drizzle-orm`, `typeorm`, `knex`, `level`, `lmdb` — and any `node:fs` call outside `repositories/` |
| `L2.GENERATED_FILES_ARE_LOCKED` (existing) | `openapi.json` edited without `sf lock` |

## Acceptance criteria

- [ ] A controller exporting its response schema fails the build, naming the
      file and the export (proof: deferred:test:mutation fixture for the-server-keeps-its-domains)
- [ ] A domain importing another domain fails the build, naming both
      (proof: deferred:test:mutation fixture for the-server-keeps-its-domains)
- [ ] A service or controller importing a port fails the build
      (proof: deferred:test:mutation fixture for the-server-keeps-its-domains)
- [ ] An operation without a description, or a property without one, fails
      the build naming the operation and the property
      (proof: deferred:test:mutation fixture for the-contract-documents-itself)
- [ ] A declared response no test produced fails the build, naming the
      operation and the status (proof: deferred:test:mutation fixture for every-documented-response-is-tested)
- [ ] A domain error no controller declared answers 500 and fails the
      controller's test (proof: deferred:test:packages/server/tests/core/errors.test.ts)
- [ ] Removing a response field without raising `apiMajor` fails the build,
      and raising it lets the change through (proof: deferred:test:mutation fixture for the-contract-only-breaks-on-purpose)
- [ ] Importing a database driver or an ORM under `packages/server`, or
      touching `node:fs` outside a repository, fails the build
      (proof: deferred:test:mutation fixture for the-server-keeps-no-database)
- [ ] A record the daemon rewrites on disk is what the server answers next,
      with no restart and no cache in between
      (proof: deferred:test:packages/server/tests/core/files-are-the-truth.test.ts)
- [ ] Restarting the server loses no work: every record, queue item, brief and
      ask is where it was (proof: deferred:test:packages/server/tests/core/restart.test.ts)
- [ ] The empty server — `core/` and no domain — builds a valid OpenAPI 3.1
      document (proof: deferred:test:packages/server/tests/core/app.test.ts)

**Exit condition:** with `core/` and one example domain in a mutation
fixture, `sf verify` shows each of the five rules tripping on its fixture,
and the clean tree builds a document every rule accepts — before *the window
is served* adds its first real domain.
