# The window is served

*A view is data* made a view a tree that survives a socket. Nothing yet sends
one over a socket. As planned so far, each renderer would assemble the
profiles itself and read the store, the queue and the event log from amy's
home — so a window works only on the machine amy runs on, every renderer
carries the host inside it, and a phone, which has no amy home, could never be
one.

The split OpenCode settled on is the right one here too: one headless server
that owns the state and publishes its contract as OpenAPI, and any number of
clients that speak only that contract — `opencode serve` and
`opencode attach <url>`. A client that never reads a file works the same on
the machine amy runs on, on another machine through a tunnel, and on a phone.

## What changes

**`amy serve`** is the server. It assembles the profiles read-only, watches
the event log (*the event log can be watched*), computes every view a
connected client has asked for (*a view is data*), and streams patches. It
takes intents back and resolves each to the function its command already
calls — so a client is never a second road to a write the CLI cannot make. It
is not the daemon: the loop advances work, the server shows it and relays
intents, and either can restart without the other.

**The contract is OpenAPI, and the server writes it.** Nothing about the
protocol is written twice, and nothing about it is written by hand:

1. **The server declares each route and each message once**, in the
   controller that answers it (*the server speaks in domains*): a
   `@hono/zod-openapi` route whose request and response are Zod schemas in the
   same file. The request, the response, every event on the stream and every
   error are among them.
2. **The build writes the document.** `npm run build` generates
   `packages/ui/openapi.json` from those routes (`getOpenAPI31Document`), as
   OpenAPI 3.1. Patches stream as Server-Sent
   Events and intents go up as plain requests, so all of it is describable in
   OpenAPI: every stream event is a named schema in a `oneOf`, which every
   generator types. When the generator reads OpenAPI 3.2's `itemSchema` for
   event streams, the stream moves to it.
3. **The build writes the SDK.** `@amykit/ui-client` is generated from that
   document by `openapi-typescript`, with `openapi-fetch` as its only runtime,
   and adds by hand only what a generator cannot: reconnecting the stream and
   applying patches. It exports the contract's hash.
4. **A renderer speaks only through the SDK.** No renderer calls `fetch` or
   opens an `EventSource` itself, and a rule keeps it so.

So a change to a response on the server regenerates the document, which
regenerates the SDK's types, which breaks the type check of every renderer
that relied on the old shape — in the same `npm run build`, with nothing to
run by hand. Both generated files are committed, so a protocol change is a
diff a reviewer sees. Both are also in `L2.GENERATED_FILES_ARE_LOCKED`'s
scope beside `events.json`, and the gate regenerates them and fails on any
difference, the way `docs:check` does for the generated docs.

**The body is checked against the document, not against the code that wrote
it.** In tests, and in the gate's scenario, every response and every event the
server sends is validated against `openapi.json` — the generated document,
because validating against the Zod source would only prove the source agrees
with itself. Every route carries an example, and the examples are validated
too. A field the document requires and the server forgot is a red build, not a
blank in somebody's window.

**The handshake checks the contract and what the client can draw.** A client
opens with the contract hash its SDK was generated from, its renderer name,
the surfaces it draws and the primitives it knows. A different hash is refused
by name, telling the client to update — a built app on a phone cannot run
`npm run build`. A client missing a primitive a mounted view uses is refused
naming the primitive: compatibility asked as a capability, not guessed from a
version.

**A client reads nothing but the server.** No renderer imports a store, a
queue, the log or a path under amy's home, and a rule keeps it so.

**Reaching it is the operator's choice, and it is never open.**
- It listens on `127.0.0.1` by default, like `opencode serve`.
- Every connection presents a token, loopback included; the token is
  generated into amy's home, never into the config, and rotates with
  `amy serve --rotate-token`.
- Listening anywhere else is a flag — `amy serve --host 0.0.0.0` — and
  exposing it to the internet is a tunnel the operator runs in front of it,
  which is where TLS comes from.

**What only makes sense on the machine itself is a second door, not a peer
address.** A tunnel — ngrok, `ssh -L`, a reverse proxy — terminates on the
server's machine and reaches amy *from* `127.0.0.1`, so a remote client
holding the token looks exactly like a local one to anything that checks where
a connection came from. So the server serves two transports:

- **TCP**, on the host and port above: every operation except the
  **local-only** ones, which are not routed there at all — not refused, absent.
- **A Unix domain socket**, `serve.sock` under amy's home, created `0600` for
  the user who runs amy: every operation, local-only included. Nothing on the
  network can open it; a tunnel forwards a port, and a person who forwards
  the socket on purpose has handed out their shell on purpose.

The local clients — the desktop app and the terminal on the same machine —
connect over the socket; a client given `--server <url>` connects over TCP and
is a remote client whatever address it came from. Local-only means: a shell
(*the workplace opens where you work*), starting an editor on the host,
removing a workflow and reading or saving `config.yaml`. A remote client sees
those absent from its views, and the operations do not exist on its
transport.

**`amy ui` finds a server or starts one.** It connects to `ui.server` from the
config or `--server <url>` when given; otherwise it uses the local server,
starting one if none is running. Several clients may be connected at once,
each with its own subscriptions, and all of them see the same patch for the
same change.

## The gates

- **`ui-server`**, new, activated by `packages/ui/**`, `packages/server/src/**`
  and `packages/cli/src/ui/**`.
  Its scenario starts `amy serve` on the conformance world under one amy home
  and connects a client from **a second home that holds no amy state at
  all**, over TCP, through a TCP forward on `127.0.0.1` standing in for a
  tunnel — a remote client in every way that matters — and drives the frame's
  script through the generated SDK alone, validating every body it receives
  against `openapi.json`.
- **`a-client-reads-only-the-server`**, a local layer-0 rule with a mutation
  fixture: a renderer importing a store, the event log or `node:fs` is refused.
- **`a-client-speaks-only-through-the-sdk`**, the same kind: a renderer calling
  `fetch`, opening an `EventSource` or a socket itself is refused.
- **The generated files are checked like the docs are.** The gate regenerates
  `openapi.json` and the SDK and fails on any difference from what is
  committed.
- From here on, `ui-frame`'s script reaches every renderer through a server.

## What it delivers

The `session`, `views` and `work` domains of *every endpoint is named before
it is built* — `getCompatibility`, `openSession`, `closeSession`,
`streamSession`, `listViews`, `subscribeView`, `unsubscribeView` and
`pokeWork` — and the views `work.list` and `work.detail`, so a client of this
row alone shows live work, flipped to `delivered` in `surface.yaml` in the same pull
request, and no operation the registry does not list.

## Acceptance criteria

- [ ] The operations this row delivers are `delivered` in `surface.yaml`, and
      the surface gate is green (proof: deferred:test:packages/server/tests/surface.test.ts)
- [ ] A client in a home with no amy state draws the conformance world, and
      moves when the daemon advances a record
      (proof: deferred:assertion:server.a_client_needs_nothing_but_the_server)
- [ ] Two clients connected at once receive the same patch for the same change
      (proof: deferred:assertion:server.every_client_sees_the_same_change)
- [ ] A connection without the token is refused, on the socket as over TCP,
      on every route except the two webhook receivers *an event is a reason to
      look* adds, which refuse a bad signature instead
      (proof: deferred:assertion:server.nothing_answers_without_the_token)
- [ ] The server listens on loopback unless told otherwise, and its socket is
      `0600` (proof: deferred:assertion:server.it_listens_on_loopback_by_default)
- [ ] A client reaching the server through a TCP forward on `127.0.0.1` — a
      tunnel, in the scenario — with the right token gets no local-only
      operation: they are absent from its views and answer `404` on its
      transport (proof: deferred:assertion:server.a_tunnelled_client_gets_no_shell)
- [ ] A client on the socket gets the local-only operations
      (proof: deferred:assertion:server.the_socket_is_the_local_door)
- [ ] A client missing a primitive a mounted view uses is refused at the
      handshake, naming the primitive (proof: deferred:test:packages/ui/tests/handshake.test.ts)
- [ ] `npm run build` writes `openapi.json` and the SDK, and nothing else has
      to be run (proof: deferred:test:packages/ui/tests/contract.test.ts)
- [ ] Removing a field from a server response turns a renderer that reads it
      red in the type check, in the same build
      (proof: deferred:test:a mutation fixture that drops a response field)
- [ ] A committed `openapi.json` or SDK that differs from what the build
      generates fails the gate (proof: deferred:assertion:server.the_contract_is_what_the_code_says)
- [ ] Every response and every stream event in the scenario validates against
      `openapi.json`, and a server sending a body missing a required field
      fails it (proof: deferred:assertion:server.every_body_honours_the_contract)
- [ ] Every route's example validates against its own schema
      (proof: deferred:test:packages/ui/tests/contract.test.ts)
- [ ] A client whose SDK was generated from another contract is refused at the
      handshake, naming both hashes (proof: deferred:test:packages/ui/tests/handshake.test.ts)
- [ ] Editing `openapi.json` without `sf lock` fails the build
      (proof: deferred:test:a mutation fixture for L2.GENERATED_FILES_ARE_LOCKED)
- [ ] A renderer calling `fetch` or opening an `EventSource` itself fails the
      build, and the rule trips on its fixture
      (proof: deferred:test:mutation fixture for a-client-speaks-only-through-the-sdk)
- [ ] A renderer importing a store or `node:fs` fails the build, and the rule
      trips on its fixture (proof: deferred:test:mutation fixture for a-client-reads-only-the-server)
- [ ] An intent leaves the same record, queue and log its command leaves
      (proof: deferred:assertion:server.an_intent_is_its_command)

**Exit condition:** a field removed from a server response turns the build
red in the renderer that read it, before anything runs; and with it restored,
`amy serve` runs on one machine; on a second, with no amy
state and only the server's URL and token, `amy ui text --server <url>` shows
the first machine's work moving, and a `poke` from it moves the record there —
while a shell, asked for from the second machine through a tunnel, does not
exist on its transport.
