# Every endpoint is named before it is built

Eight rows of this block each add something to the server, and each of them
will be built on a different day by somebody reading only that row. Without
one list of every operation, what it does and which row brings it, the second
row invents a path the first would have named differently, two rows build the
same operation, and the document grows in the order things were needed rather
than the shape they belong in.

So the whole surface is named here, before any of it is built, and kept as a
file the build checks.

## The registry

`packages/server/surface.yaml` lists every operation — its `operationId`,
domain, method and path, whether it is local-only, what it writes — and every
fixed view — its `viewId`, params schema, slot, surface and whether it is
local-only — each with the
plan that delivers it and its status, `planned` or `delivered`. It is locked like
`openapi.json`, so changing the surface is a reviewed diff. A gate,
`the-surface-is-the-registry`, compares it with the generated document on
every build:

- every `delivered` operation is in the document, with the method, path,
  local-only flag and writes the registry says;
- no operation is in the document that the registry does not list;
- no `planned` operation is in the document yet;
- every `delivered` view is answered by `listViews` on a server with no plugin
  mounted, with the slot, surface and params schema the registry says, and a
  subscription to it with the registry's example params yields a snapshot;
  `listViews` answers no fixed view the registry does not list, and no
  `planned` one; a local-only view is answered on the socket and never over
  TCP;
- a `planned` entry names a row of `next-steps.md`; a `delivered` one names
  the design note under `docs/design/` its plan became, because a delivered
  plan leaves the table.

A row that delivers an operation flips it to `delivered` in the same pull
request. A row that needs one the registry does not have adds it here first.

## Conventions every operation follows

- Nothing is read from or written to a database: there is none
  (*the server speaks in domains*). Every read comes from the files amy
  already keeps — through the ports, and the event log for what happened —
  and every write lands on them the way the matching `amy` command's would.
- Paths are versioned, `/v1/…`, and owned by one domain each.
- Every request carries `Authorization: Bearer <token>`; `401 session.unauthorized`
  is declared on every operation and not repeated below.
- Every request after `openSession` carries `X-Amy-Session: <sessionId>`, so
  the server knows which client asked and which stream an operation's later
  events go to — an ask's answer, a shell's output. A session belongs to the
  token that opened it; another token's session answers
  `404 session.not_found`, declared on every operation and not repeated below.
  `getCompatibility` and `openSession` are the two that carry none.
- Work is addressed as `{profile}/{workId}`, because records are kept per
  profile and two profiles may hold the same id.
- **Local-only** operations are served on the local socket only
  (*the window is served*). Over TCP they are not routed — a `404`, and absent
  from that client's views — whatever address the connection came from, so a
  tunnel ending on `127.0.0.1` gains nothing.
- **Writes** name what the operation changes beyond the server's own memory.
  None of them writes to a tracker or a forge; every write is one an `amy`
  command can make.
- Long work answers `202` and finishes on the session stream, so no request is
  held open for an agent run.

## The domains

### `session` — who is connected, and what they get · *the window is served*

| Operation | Method and path | What it does |
| :-- | :-- | :-- |
| `getCompatibility` | `GET /v1/compatibility` | `{ apiMajor, contractDigest, build, capabilities[] }` — what a client checks before it opens a session. |
| `openSession` | `POST /v1/sessions` | Request `{ contractDigest, renderer, surfaces[], primitives[] }`. `201 { sessionId, local, capabilities[], keymap, theme }` — `local` saying whether it arrived on the socket — the resolved keymap from `ui.keys` and the theme in force. `409 session.contract_mismatch { expected, got }`; `422 session.primitive_unknown { primitive, viewId }`; `422 session.surface_not_in_frame { surface }`. |
| `closeSession` | `DELETE /v1/sessions/{sessionId}` | Ends the session and every subscription in it. `204`; `404 session.not_found`. |
| `streamSession` | `GET /v1/sessions/{sessionId}/stream` | The one Server-Sent Events stream a client holds, so a client never needs more connections than a browser allows one origin. Resumes from `Last-Event-ID`. `404 session.not_found`; `410 session.expired`. Its events are listed below. |

### `views` — what a client draws · *the window is served*

| Operation | Method and path | What it does |
| :-- | :-- | :-- |
| `listViews` | `GET /v1/views?surface=` | Every view the client may subscribe to on a surface — the fixed ones below and every plugin contribution — as `{ viewId, slot, title, surface, paramsSchema, contributedBy }`. This is how nav 1's sections, the canvas tabs, the panels and the menu bar's lines are found. |
| `subscribeView` | `POST /v1/views/{viewId}/subscriptions` | Request `{ params }`; the session is the header's. `201 { subscriptionId }`; the first `view.snapshot` follows on the stream. `404 views.not_found`; `422 views.params_invalid { errors }`. |
| `unsubscribeView` | `DELETE /v1/views/subscriptions/{subscriptionId}` | `204`; `404 views.subscription_not_found`. |

The fixed views, by the row that brings them:

| `viewId` | Params | Slot | Row |
| :-- | :-- | :-- | :-- |
| `work.list` | `{ query? }` | `nav2` under Work | *the window is served* |
| `workflows.list` | — | `nav2` under Workflows | *amy has a window* |
| `workflows.handbrake` | — | canvas under Workflows | *amy has a window* |
| `workflows.detail` | `{ profile }` | canvas under Workflows: the workflow's diagram, drawn and as text, and its last check; **the text is editable only on the socket** | *amy has a window* |
| `settings.config` | — | canvas under Settings; **local-only** | *amy has a window* |
| `work.detail` | `{ profile, workId }` | canvas: header, machine strip — the workflow's diagram with the record's state marked — `timeline` tab | *the window is served* |
| `work.log` | `{ profile?, workId? }` | `panel` | *amy has a window* |
| `menubar.title`, `menubar.menu` | — | `menubar` surface | *amy lives in the menu bar* |
| `work.thread` | `{ profile, workId }` | `panel` | *a conversation before the work* |
| `asks.recent` | — | `palette` | *a conversation before the work* |
| `grooming.detail` | `{ groomingId }` | canvas under Work | *grooming happens in the window* |
| `work.diff` | `{ profile, workId }` | `diff` tab | *the workplace opens where you work* |

A `Button` or an `Input` in any view carries an intent in the envelope the
vocabulary already ships and validates — `{ action, args }`
(`isIntent` in `packages/ui/src/vocabulary.ts`) — with `action` the
`operationId` to call and `args` its path parameters and body fields by name;
an `Input`'s own value arrives under its `name`. The SDK calls that operation,
typed. The vocabulary does not change. A view whose intent's `action` is not
an `operationId` the registry lists is a failing build.

### `work` — one piece of work · *the window is served*

The work itself is read through the views `work.list` and `work.detail`,
which this row delivers with the operation below, so a client of this row
alone already shows live work.

| Operation | Method and path | What it does |
| :-- | :-- | :-- |
| `pokeWork` | `POST /v1/work/{profile}/{workId}/pokes` | What `amy poke` does: `200 { outcome: running \| brought-forward \| already-due \| queued, moved? }`. `404 work.profile_not_found`. Writes: the profile's queue. |

### `machine` — the handbrake · *amy has a window*

| Operation | Method and path | What it does |
| :-- | :-- | :-- |
| `getHandbrake` | `GET /v1/machine/handbrake` | `{ paused, reason?, since? }`. |
| `setHandbrake` | `PUT /v1/machine/handbrake` | Request `{ paused, reason? }` — what `amy pause` and `amy resume` do, every workflow at once. `200 { paused, reason?, since? }`. Writes: the stop switch and the event log. |

### `workflows` — the profiles · *amy has a window*

| Operation | Method and path | What it does |
| :-- | :-- | :-- |
| `getWorkflowDiagram` | `GET /v1/workflows/{profile}/diagram` | `{ text, revision, editable }` — the profile's `workflow.mmd` (*a workflow is a Mermaid diagram*), the revision its digest, `editable` true only for a workflow under `~/.amy/workflows`. What `amy workflow export` prints. `404 workflows.not_found`; `404 workflows.no_diagram` for a workflow written without one. |
| `saveWorkflowDiagram` | `PUT /v1/workflows/{profile}/diagram` | Request `{ text, baseRevision }`. Reads it with the same subset the host mounts with, writes `workflow.mmd`, and runs `amy workflow check`. `200 { revision, undrawn[], unwalked[] }`; `409 workflows.stale_revision { current }`; `409 workflows.not_yours` for a package; `422 workflows.diagram_refused { line, construct }`; `409 workflows.state_in_use { state, records[] }` when it drops a state a record is in or has an edge into under the mounted diagram, and `409 workflows.removal_needs_pause` when it drops any state while the handbrake is off: the running machine keeps the old diagram until it restarts and could still move a record into the removed state, so a removal is saved only with the machine paused. The running machine keeps the diagram it mounted until it restarts. **Local-only.** Writes: the workflow's directory. |
| `removeWorkflow` | `DELETE /v1/workflows/{profile}` | What `amy remove <name>` does, refusing what the machine would not survive. `200 { removed }`; `404 workflows.not_found`; `409 workflows.removal_refused { refusals[] }`. **Local-only.** Writes: `config.yaml`. |

### `settings` — `config.yaml` · *amy has a window*

| Operation | Method and path | What it does |
| :-- | :-- | :-- |
| `getConfig` | `GET /v1/settings/config` | `{ text, revision }`, the revision being the text's digest. **Local-only**: a config names paths and channels. The window does not call it to draw Settings — it subscribes to `settings.config`, an `Input` named `text` holding the file with `saveConfig` as its intent and the revision in its args, and the last refusals as a `List` beneath it — so no renderer builds the editor itself. |
| `saveConfig` | `PUT /v1/settings/config` | Request `{ text, baseRevision }`. Assembles it the way a boot does and saves only if it mounts. `200 { revision }`; `409 settings.stale_revision { current }`; `422 settings.would_not_mount { refusals[] }`. **Local-only.** Writes: `config.yaml`. |

### `actions` — what plugins add to a row · *the window takes plugins*

| Operation | Method and path | What it does |
| :-- | :-- | :-- |
| `listActions` | `GET /v1/actions` | Every `ui-action` mounted: `{ action, title, appliesTo, argsSchema, writes[], localOnly }` — a local-only action is listed only on the socket. |
| `runAction` | `POST /v1/actions/{action}` | Request `{ target: { profile, workId? }, args }`. `args` is checked against the action's own schema at run time — a plugin installed after a client was built has no type in its SDK, by design — and the envelope around it is typed. `200 { outcome }`; `404 actions.not_found`; `422 actions.args_invalid { errors }`. An action that declared itself local-only is not routed over TCP. Writes: what the action declared, refused at boot otherwise. |

### `asks` — asking, which moves nothing · *a conversation before the work*

| Operation | Method and path | What it does |
| :-- | :-- | :-- |
| `listHarnesses` | `GET /v1/asks/harnesses` | The harnesses an ask may use: the `harness` collection. |
| `startAsk` | `POST /v1/asks` | Request `{ about?: { profile, workId }, harness }`. `201 { askId, cwd }` — the record's worktree, or the base snapshot. `422 asks.harness_unknown`. Writes: the ask's own file. |
| `listAsks` | `GET /v1/asks?limit=` | Recent asks, newest first: `{ askId, about?, harness, title, updatedAt }`. |
| `getAsk` | `GET /v1/asks/{askId}` | `{ askId, about?, turns[{ turnId, at, from: person \| agent, harness, text, cost? }] }`. `404 asks.not_found`. |
| `addAskTurn` | `POST /v1/asks/{askId}/turns` | Request `{ text, harness? }`. `202 { turnId }`; the answer arrives as `ask.answered` or `ask.failed` on the stream of the session that asked. `404 asks.not_found`; `409 asks.budget_parked`. Writes: the ask's file and the event log. Reaches no mutating port. |

### `threads` — discussing with the work · *a conversation before the work*

| Operation | Method and path | What it does |
| :-- | :-- | :-- |
| `getThread` | `GET /v1/threads/{profile}/{workId}` | `{ conversation: string \| null, loopStale, waitingOnOwner, transcript[{ at, from: operator \| amy, author, text, kind? }] }`, read through the conversation port's `transcript`. `404 threads.work_not_found`. |
| `addThreadTurn` | `POST /v1/threads/{profile}/{workId}/turns` | Request `{ text, kind: discussion \| decision }`, submitted through the port's `submit`. `202 { at }`. `409 threads.loop_stale` while the running loop mounted another conversation; `409 threads.not_waiting` when nothing waits on the owner; `503 threads.no_conversation`. Writes: the work's thread. |

### `grooming` — a brief for an existing ticket · *grooming happens in the window*

| Operation | Method and path | What it does |
| :-- | :-- | :-- |
| `searchTickets` | `GET /v1/grooming/tickets?profile=&query=` | The tracker searched, read-only: `{ id, title, url, status }[]`. |
| `startGrooming` | `POST /v1/grooming/sessions` | Request `{ profile, ticketId }`. `201 { groomingId, briefId }`; `422 grooming.no_brief_phase`. Writes: the brief, through the brief port. |
| `getGrooming` | `GET /v1/grooming/sessions/{groomingId}` | `{ briefId, revision, green, sections[{ name, text, refusals[] }], transcript[] }`. `404 grooming.not_found`. |
| `addGroomingTurn` | `POST /v1/grooming/sessions/{groomingId}/turns` | Request `{ text }`. `202 { turnId }`; the next question and the reran check arrive through `grooming.detail`. Writes: the brief. Never the tracker. |

### `workplace` — the checkout · *the workplace opens where you work*

| Operation | Method and path | What it does |
| :-- | :-- | :-- |
| `listOpeners` | `GET /v1/workplace/{profile}/{workId}/openers` | The openers mounted and runnable for this client: `{ name, title }[]`. A remote client is offered none that need the host. |
| `runOpener` | `POST /v1/workplace/{profile}/{workId}/openers/{opener}` | Starts `code`, `cursor`, `claude` or `$EDITOR` in the checkout. `204`; `404 workplace.opener_not_found`; `409 workplace.no_checkout`. **Local-only.** |
| `openShell` | `POST /v1/workplace/{profile}/{workId}/shells` | Request `{ cols, rows }`. `201 { shellId }`; output arrives as `shell.output` on the stream of the session in `X-Amy-Session`, and only that one. Needs `@amykit/ui-shell` mounted. **Local-only.** |
| `writeShell` | `POST /v1/workplace/shells/{shellId}/input` | Request `{ data }`. `204`; `404 workplace.shell_not_found`. **Local-only.** |
| `resizeShell` | `PUT /v1/workplace/shells/{shellId}/size` | Request `{ cols, rows }`. `204`. **Local-only.** |
| `closeShell` | `DELETE /v1/workplace/shells/{shellId}` | `204`. **Local-only.** |

### The stream's events

Every event on `streamSession` is a named schema in the document's `oneOf`,
and carries `id` for resuming.

| Event | Carries | From |
| :-- | :-- | :-- |
| `view.snapshot` | `{ subscriptionId, revision, tree }` | `views` |
| `view.patch` | `{ subscriptionId, fromRevision, toRevision, patches[] }` | `views` |
| `view.closed` | `{ subscriptionId, reason }` | `views` |
| `settings.changed` | `{ keymap, theme }` — `config.yaml` moved | `session` |
| `ask.answered` / `ask.failed` | `{ askId, turnId, text \| reason, harness, cost? }` | `asks` |
| `shell.output` / `shell.exited` | `{ shellId, data }` / `{ shellId, code }` | `workplace` |
| `heartbeat` | `{ at }` | `session` |

## Acceptance criteria

- [ ] `surface.yaml` lists every operation and fixed view above, with its
      domain, method, path, local-only flag, writes and plan — or its params,
      slot, surface and plan — all `planned`
      (proof: deferred:test:packages/server/tests/surface.test.ts)
- [ ] A delivered operation missing from the document, or one in the document
      the registry does not list, fails the build naming it
      (proof: deferred:test:mutation fixture for the-surface-is-the-registry)
- [ ] A delivered fixed view `listViews` does not answer, or one it answers the
      registry does not list, fails the build naming the view
      (proof: deferred:test:mutation fixture for the-surface-is-the-registry)
- [ ] An operation whose local-only flag or writes differ from the registry
      fails the build (proof: deferred:test:mutation fixture for the-surface-is-the-registry)
- [ ] A `planned` entry naming a plan that is not a row of `next-steps.md`, or a
      `delivered` one naming no design note under `docs/design/`, fails the
      build (proof: deferred:test:mutation fixture for the-surface-is-the-registry)
- [ ] An ask's answer and a shell's output reach only the session in the
      request's `X-Amy-Session`, with two clients on one token
      (proof: deferred:assertion:server.an_event_reaches_only_its_session)
- [ ] A view whose intent names an `operationId` the registry does not list
      fails the build (proof: deferred:assertion:server.every_intent_names_an_operation)
- [ ] Editing `surface.yaml` without `sf lock` fails the build
      (proof: deferred:test:a mutation fixture for L2.GENERATED_FILES_ARE_LOCKED)

**Exit condition:** `surface.yaml` holds every operation in this plan as
`planned`, the gate is green on a server with no domains, and flipping any one
entry to `delivered` without its controller turns the build red naming it.
