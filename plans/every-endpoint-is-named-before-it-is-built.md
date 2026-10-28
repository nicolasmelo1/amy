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

`packages/server/surface.yaml` lists every operation: its `operationId`,
domain, method and path, whether it is loopback-only, what it writes, and the
plan that delivers it, as `planned` or `delivered`. It is locked like
`openapi.json`, so changing the surface is a reviewed diff. A gate,
`the-surface-is-the-registry`, compares it with the generated document on
every build:

- every `delivered` operation is in the document, with the method, path,
  loopback flag and writes the registry says;
- no operation is in the document that the registry does not list;
- no `planned` operation is in the document yet;
- every plan a registry entry names is a row of `next-steps.md`.

A row that delivers an operation flips it to `delivered` in the same pull
request. A row that needs one the registry does not have adds it here first.

## Conventions every operation follows

- Paths are versioned, `/v1/…`, and owned by one domain each.
- Every request carries `Authorization: Bearer <token>`; `401 session.unauthorized`
  is declared on every operation and not repeated below.
- Work is addressed as `{profile}/{workId}`, because records are kept per
  profile and two profiles may hold the same id.
- **Loopback-only** operations answer `403 session.loopback_only` to a client
  that did not connect over loopback, and are absent from that client's views.
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
| `openSession` | `POST /v1/sessions` | Request `{ contractDigest, renderer, surfaces[], primitives[] }`. `201 { sessionId, loopback, capabilities[], keymap, theme }` — the resolved keymap from `ui.keys` and the theme in force. `409 session.contract_mismatch { expected, got }`; `422 session.primitive_unknown { primitive, viewId }`; `422 session.surface_not_in_frame { surface }`. |
| `closeSession` | `DELETE /v1/sessions/{sessionId}` | Ends the session and every subscription in it. `204`; `404 session.not_found`. |
| `streamSession` | `GET /v1/sessions/{sessionId}/stream` | The one Server-Sent Events stream a client holds, so a client never needs more connections than a browser allows one origin. Resumes from `Last-Event-ID`. `404 session.not_found`; `410 session.expired`. Its events are listed below. |

### `views` — what a client draws · *the window is served*

| Operation | Method and path | What it does |
| :-- | :-- | :-- |
| `listViews` | `GET /v1/views?surface=` | Every view the client may subscribe to on a surface — the fixed ones below and every plugin contribution — as `{ viewId, slot, title, surface, paramsSchema, contributedBy }`. This is how nav 1's sections, the canvas tabs, the panels and the menu bar's lines are found. |
| `subscribeView` | `POST /v1/views/{viewId}/subscriptions` | Request `{ sessionId, params }`. `201 { subscriptionId }`; the first `view.snapshot` follows on the stream. `404 views.not_found`; `422 views.params_invalid { errors }`. |
| `unsubscribeView` | `DELETE /v1/views/subscriptions/{subscriptionId}` | `204`; `404 views.subscription_not_found`. |

The fixed views, by the row that brings them:

| `viewId` | Params | Slot | Row |
| :-- | :-- | :-- | :-- |
| `work.list` | `{ query? }` | `nav2` under Work | *amy has a window* |
| `workflows.list` | — | `nav2` under Workflows | *amy has a window* |
| `workflows.handbrake` | — | canvas under Workflows | *amy has a window* |
| `work.detail` | `{ profile, workId }` | canvas: header, machine strip, `timeline` tab | *amy has a window* |
| `work.log` | `{ profile?, workId? }` | `panel` | *amy has a window* |
| `menubar.title`, `menubar.menu` | — | `menubar` surface | *amy lives in the menu bar* |
| `work.thread` | `{ profile, workId }` | `panel` | *a conversation before the work* |
| `asks.recent` | — | `palette` | *a conversation before the work* |
| `grooming.detail` | `{ groomingId }` | canvas under Work | *grooming happens in the window* |
| `work.diff` | `{ profile, workId }` | `diff` tab | *the workplace opens where you work* |

A `Button` in any view carries an intent as `{ operationId, params }`: the SDK
calls that operation, typed. A view naming an `operationId` the registry does
not list is a failing build.

### `work` — one piece of work · *the window is served*

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
| `removeWorkflow` | `DELETE /v1/workflows/{profile}` | What `amy remove <name>` does, refusing what the machine would not survive. `200 { removed }`; `404 workflows.not_found`; `409 workflows.removal_refused { refusals[] }`. **Loopback-only.** Writes: `config.yaml`. |

### `settings` — `config.yaml` · *amy has a window*

| Operation | Method and path | What it does |
| :-- | :-- | :-- |
| `getConfig` | `GET /v1/settings/config` | `{ text, revision }`, the revision being the text's digest. **Loopback-only**: a config names paths and channels. |
| `saveConfig` | `PUT /v1/settings/config` | Request `{ text, baseRevision }`. Assembles it the way a boot does and saves only if it mounts. `200 { revision }`; `409 settings.stale_revision { current }`; `422 settings.would_not_mount { refusals[] }`. **Loopback-only.** Writes: `config.yaml`. |

### `actions` — what plugins add to a row · *the window takes plugins*

| Operation | Method and path | What it does |
| :-- | :-- | :-- |
| `listActions` | `GET /v1/actions` | Every `ui-action` mounted: `{ action, title, appliesTo, argsSchema, writes[], loopbackOnly }`. |
| `runAction` | `POST /v1/actions/{action}` | Request `{ target: { profile, workId? }, args }`. `args` is checked against the action's own schema at run time — a plugin installed after a client was built has no type in its SDK, by design — and the envelope around it is typed. `200 { outcome }`; `404 actions.not_found`; `422 actions.args_invalid { errors }`; `403 session.loopback_only` for an action that declared it. Writes: what the action declared, refused at boot otherwise. |

### `asks` — asking, which moves nothing · *a conversation before the work*

| Operation | Method and path | What it does |
| :-- | :-- | :-- |
| `listHarnesses` | `GET /v1/asks/harnesses` | The harnesses an ask may use: the `harness` collection. |
| `startAsk` | `POST /v1/asks` | Request `{ about?: { profile, workId }, harness }`. `201 { askId, cwd }` — the record's worktree, or the base snapshot. `422 asks.harness_unknown`. Writes: the ask's own file. |
| `listAsks` | `GET /v1/asks?limit=` | Recent asks, newest first: `{ askId, about?, harness, title, updatedAt }`. |
| `getAsk` | `GET /v1/asks/{askId}` | `{ askId, about?, turns[{ turnId, at, from: person \| agent, harness, text, cost? }] }`. `404 asks.not_found`. |
| `addAskTurn` | `POST /v1/asks/{askId}/turns` | Request `{ text, harness? }`. `202 { turnId }`; the answer arrives as `ask.answered` or `ask.failed`. `404 asks.not_found`; `409 asks.budget_parked`. Writes: the ask's file and the event log. Reaches no mutating port. |

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
| `runOpener` | `POST /v1/workplace/{profile}/{workId}/openers/{opener}` | Starts `code`, `cursor`, `claude` or `$EDITOR` in the checkout. `204`; `404 workplace.opener_not_found`; `409 workplace.no_checkout`. **Loopback-only.** |
| `openShell` | `POST /v1/workplace/{profile}/{workId}/shells` | Request `{ cols, rows }`. `201 { shellId }`; output arrives as `shell.output`. Needs `@amykit/ui-shell` mounted. **Loopback-only.** |
| `writeShell` | `POST /v1/workplace/shells/{shellId}/input` | Request `{ data }`. `204`; `404 workplace.shell_not_found`. **Loopback-only.** |
| `resizeShell` | `PUT /v1/workplace/shells/{shellId}/size` | Request `{ cols, rows }`. `204`. **Loopback-only.** |
| `closeShell` | `DELETE /v1/workplace/shells/{shellId}` | `204`. **Loopback-only.** |

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

- [ ] `surface.yaml` lists every operation above, with its domain, method,
      path, loopback flag, writes and plan, all `planned`
      (proof: deferred:test:packages/server/tests/surface.test.ts)
- [ ] A delivered operation missing from the document, or one in the document
      the registry does not list, fails the build naming it
      (proof: deferred:test:mutation fixture for the-surface-is-the-registry)
- [ ] An operation whose loopback flag or writes differ from the registry
      fails the build (proof: deferred:test:mutation fixture for the-surface-is-the-registry)
- [ ] A registry entry naming a plan that is not a row of `next-steps.md`
      fails the build (proof: deferred:test:mutation fixture for the-surface-is-the-registry)
- [ ] A view whose intent names an `operationId` the registry does not list
      fails the build (proof: deferred:assertion:server.every_intent_names_an_operation)
- [ ] Editing `surface.yaml` without `sf lock` fails the build
      (proof: deferred:test:a mutation fixture for L2.GENERATED_FILES_ARE_LOCKED)

**Exit condition:** `surface.yaml` holds every operation in this plan as
`planned`, the gate is green on a server with no domains, and flipping any one
entry to `delivered` without its controller turns the build red naming it.
