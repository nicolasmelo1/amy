# @amykit/services

## 0.8.0

### Patch Changes

- Updated dependencies [a41a17f]
- Updated dependencies [9a9ac0a]
- Updated dependencies [3a8cc7a]
  - @amykit/core@0.8.0

## 0.7.1

### Patch Changes

- Updated dependencies [e79dea1]
  - @amykit/core@0.7.1

## 0.7.0

### Minor Changes

- bb67d1f: An operation is declared once, and every door will run it the same way.
  
  `defineOperation` in `@amykit/core` declares one operation: its id and domain,
  its summary and description, its input and output (or the named events it
  streams), the errors it can return, its examples, whether it is local-only,
  what it writes, and how HTTP and the command line reach it. Input, output and
  events are any schema implementing Standard Schema and Standard JSON Schema —
  Zod 4.2+, ArkType, Valibot — whose interfaces the core copies, so the core
  still installs no dependency. `invoke(contract, id, input, context)` is the one
  road every door takes: it validates the input before the handler and the
  output after it, answers a declared error as itself, and answers a throw, an
  undeclared code or an output the schema refuses as `amy.internal`, naming the
  operation. `contractDocument` writes the contract as OpenAPI 3.1.
  
  `@amykit/services` is the new home of amy's own domains. It ships none yet:
  `npm run build` writes its empty `openapi.json`, and five rules hold every
  domain to come — a domain keeps its layout and reads no other, only a
  repository reaches a port, no database or filesystem bypasses the ports, every
  operation and property is documented, every declared error is produced by a
  test, and the document only breaks when `API_MAJOR` is raised (checked with
  oasdiff, which `./scripts/setup-dev.sh` now installs).
  
  Before, amy's rules lived inside 2844 lines of command-line handlers, so a
  server or an SDK would have had to call into the CLI or copy it.

### Patch Changes

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
