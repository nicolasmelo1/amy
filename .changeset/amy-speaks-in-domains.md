---
"@amykit/core": minor
"@amykit/services": minor
---

An operation is declared once, and every door will run it the same way.

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
