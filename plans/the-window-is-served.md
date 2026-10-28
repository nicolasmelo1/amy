# The window is served

*A view is data* made a view a tree that survives a socket. Nothing yet sends
one over a socket. As planned so far, each renderer would assemble the
profiles itself and read the store, the queue and the event log from amy's
home — so a window works only on the machine amy runs on, every renderer
carries the host inside it, and a phone, which has no amy home, could never be
one.

The split OpenCode settled on is the right one here too: one headless server
that owns the state and speaks a documented protocol, and any number of
clients that speak only that protocol — `opencode serve` and
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

**The protocol is a contract, locked like the event log's.**
`packages/ui/protocol.json` declares the messages — the handshake, a
subscription to a surface, a patch, an intent and its outcome, an error — and
sits in `L2.GENERATED_FILES_ARE_LOCKED`'s scope beside `events.json`. A client
opens with its protocol version, its renderer name, the surfaces it draws and
the primitives it knows. The server answers with what it can serve that client
and refuses, by name, a client missing a primitive a mounted view uses —
compatibility asked as a capability, not guessed from a version.

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
- What only makes sense on the machine itself is refused to any connection
  that did not arrive over loopback: a shell (*the workplace opens where you
  work*), and starting an editor on the host. A remote client sees those
  actions absent, not failing.

**`amy ui` finds a server or starts one.** It connects to `ui.server` from the
config or `--server <url>` when given; otherwise it uses the local server,
starting one if none is running. Several clients may be connected at once,
each with its own subscriptions, and all of them see the same patch for the
same change.

## The gates

- **`ui-server`**, new, activated by `packages/ui/**` and the server's source.
  Its scenario starts `amy serve` on the conformance world under one amy home
  and connects a client from **a second home that holds no amy state at
  all** — a remote client in every way that matters — and drives the frame's
  script through the protocol alone.
- **`a-client-reads-only-the-server`**, a local layer-0 rule with a mutation
  fixture: a renderer importing a store, the event log or `node:fs` is refused.
- From here on, `ui-frame`'s script reaches every renderer through a server.

## Acceptance criteria

- [ ] A client in a home with no amy state draws the conformance world, and
      moves when the daemon advances a record
      (proof: deferred:assertion:server.a_client_needs_nothing_but_the_server)
- [ ] Two clients connected at once receive the same patch for the same change
      (proof: deferred:assertion:server.every_client_sees_the_same_change)
- [ ] A connection without the token is refused, over loopback as over the
      network (proof: deferred:assertion:server.nothing_answers_without_the_token)
- [ ] The server listens on loopback unless told otherwise
      (proof: deferred:assertion:server.it_listens_on_loopback_by_default)
- [ ] A non-loopback client is offered no shell and no host-only action
      (proof: deferred:assertion:server.a_remote_client_gets_no_shell)
- [ ] A client missing a primitive a mounted view uses is refused at the
      handshake, naming the primitive (proof: deferred:test:packages/ui/tests/handshake.test.ts)
- [ ] Editing `protocol.json` without `sf lock` fails the build
      (proof: deferred:test:a mutation fixture for L2.GENERATED_FILES_ARE_LOCKED)
- [ ] A renderer importing a store or `node:fs` fails the build, and the rule
      trips on its fixture (proof: deferred:test:mutation fixture for a-client-reads-only-the-server)
- [ ] An intent leaves the same record, queue and log its command leaves
      (proof: deferred:assertion:server.an_intent_is_its_command)

**Exit condition:** `amy serve` runs on one machine; on a second, with no amy
state and only the server's URL and token, `amy ui text --server <url>` shows
the first machine's work moving, and a `poke` from it moves the record there —
while a shell, asked for from the second machine, is not on offer.
