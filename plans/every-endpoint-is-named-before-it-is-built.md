---
sources:
  - { id: S1, kind: friction, said: "eight rows add to the server, each built another day by somebody reading only it; without one list, rows invent differing paths, build one operation twice, and the document grows in need order, not shape" }
  - { id: S2, kind: decision, said: "packages/server/surface.yaml lists every operation (operationId, domain, method, path, local-only, writes) and fixed view (viewId, params schema, slot, surface, local-only), each with its delivering plan and status, planned or delivered" }
  - { id: S3, kind: decision, said: "surface.yaml is locked like openapi.json, so changing the surface is a reviewed diff" }
  - { id: S4, kind: decision, said: "gate the-surface-is-the-registry compares it with the generated document every build: each delivered operation present with the registry's method, path, local-only flag and writes; none unlisted; no planned one yet" }
  - { id: S5, kind: decision, said: "each delivered view is answered by listViews on a plugin-less server with the registry's slot, surface, params schema, and a subscription with its example params yields a snapshot; no unlisted or planned fixed view answers" }
  - { id: S6, kind: decision, said: "a local-only view is answered on the socket and never over TCP" }
  - { id: S7, kind: decision, said: "a planned entry names a row of next-steps.md; a delivered one names the design note under docs/design/ its plan became, because a delivered plan leaves the table" }
  - { id: S8, kind: decision, said: "a row delivering an operation flips it to delivered in the same pull request; a row needing one the registry lacks adds it here first" }
  - { id: S9, kind: reference, ref: "plans/the-server-speaks-in-domains.md", said: "no database: every read comes from files amy keeps, through the ports and the event log; every write lands as the matching amy command's would" }
  - { id: S10, kind: decision, said: "paths are versioned, /v1/…, each owned by one domain" }
  - { id: S11, kind: decision, said: "every request carries Authorization: Bearer <token>; 401 session.unauthorized is declared on every operation" }
  - { id: S12, kind: decision, said: "only receiveGitHubEvent and receiveLinearEvent skip the token: a webhook cannot carry it, so the tool's signature, verified before reading, authenticates them, with no session; every other operation, listEventSources included, keeps both" }
  - { id: S13, kind: decision, said: "every request after openSession carries X-Amy-Session: <sessionId>, naming the client and the stream later events go to; getCompatibility and openSession carry none" }
  - { id: S14, kind: decision, said: "a session belongs to the token that opened it; another token's session answers 404 session.not_found, declared on every operation" }
  - { id: S15, kind: decision, said: "work is addressed {profile}/{workId}: records are kept per profile and two profiles may hold the same id" }
  - { id: S16, kind: reference, ref: "plans/the-window-is-served.md", said: "local-only operations are served on the local socket only; over TCP they are not routed (404, absent from views) whatever the source address, so a tunnel ending on 127.0.0.1 gains nothing" }
  - { id: S17, kind: decision, said: "writes name what an operation changes beyond the server's memory; none writes to a tracker or forge; every write is one an amy command can make" }
  - { id: S18, kind: decision, said: "long work answers 202 and finishes on the session stream, so no request is held open for an agent run" }
  - { id: S19, kind: decision, said: "domain rows: session, views and work from the-window-is-served; machine, workflows and settings from amy-has-a-window; actions from the-window-takes-plugins; asks and threads from a-conversation-before-the-work" }
  - { id: S20, kind: decision, said: "grooming from grooming-happens-in-the-window; events from an-event-is-a-reason-to-look; workplace from the-workplace-opens-where-you-work" }
  - { id: S21, kind: decision, said: "getCompatibility GET /v1/compatibility → { apiMajor, contractDigest, build, capabilities[] }, what a client checks before opening a session" }
  - { id: S22, kind: decision, said: "openSession POST /v1/sessions { contractDigest, renderer, surfaces[], primitives[] } → 201 { sessionId, local (arrived on the socket), capabilities[], keymap (resolved from ui.keys), theme in force }" }
  - { id: S23, kind: decision, said: "openSession refuses 409 session.contract_mismatch { expected, got }; 422 session.primitive_unknown { primitive, viewId }; 422 session.surface_not_in_frame { surface }" }
  - { id: S24, kind: decision, said: "closeSession DELETE /v1/sessions/{sessionId} ends the session and every subscription in it: 204; 404 session.not_found" }
  - { id: S25, kind: decision, said: "streamSession GET /v1/sessions/{sessionId}/stream: the one SSE stream a client holds, within a browser's per-origin connection limit; resumes from Last-Event-ID; 404 session.not_found; 410 session.expired" }
  - { id: S26, kind: decision, said: "listViews GET /v1/views?surface= → every view subscribable on a surface, fixed and plugin-contributed, as { viewId, slot, title, surface, paramsSchema, contributedBy }: how nav 1, canvas tabs, panels and menu-bar lines are found" }
  - { id: S27, kind: decision, said: "subscribeView POST /v1/views/{viewId}/subscriptions { params }, session from the header → 201 { subscriptionId }, first view.snapshot on the stream; 404 views.not_found; 422 views.params_invalid { errors }" }
  - { id: S28, kind: decision, said: "unsubscribeView DELETE /v1/views/subscriptions/{subscriptionId}: 204; 404 views.subscription_not_found" }
  - { id: S29, kind: decision, said: "fixed views of the-window-is-served: work.list { query? } in nav2 under Work; work.detail { profile, workId } canvas — header, machine strip (diagram, record's state marked), timeline tab" }
  - { id: S30, kind: decision, said: "of amy-has-a-window: workflows.list nav2 under Workflows; workflows.handbrake canvas under Workflows; settings.config canvas under Settings, local-only; work.log { profile?, workId? } in panel" }
  - { id: S31, kind: decision, said: "workflows.detail { profile } (amy-has-a-window): canvas under Workflows, the diagram drawn and as text, and its last check; the text is editable only on the socket" }
  - { id: S32, kind: decision, said: "menubar.title and menubar.menu on the menubar surface (amy-lives-in-the-menu-bar); work.thread { profile, workId } in panel and asks.recent in palette (a-conversation-before-the-work)" }
  - { id: S33, kind: decision, said: "grooming.detail { groomingId } canvas under Work (grooming-happens-in-the-window); work.diff { profile, workId } diff tab (the-workplace-opens-where-you-work)" }
  - { id: S34, kind: code, ref: "packages/ui/src/vocabulary.ts", said: "a Button or Input carries the shipped intent { action, args } (isIntent): action the operationId, args its path parameters and body fields by name, an Input's value under its name; the SDK calls it typed" }
  - { id: S35, kind: decision, said: "a view whose intent's action is not an operationId the registry lists is a failing build" }
  - { id: S36, kind: decision, said: "work.list and work.detail ship with pokeWork, so a client of the-window-is-served alone already shows live work" }
  - { id: S37, kind: decision, said: "pokeWork POST /v1/work/{profile}/{workId}/pokes, what amy poke does: 200 { outcome: running | brought-forward | already-due | queued, moved? }; 404 work.profile_not_found; writes the profile's queue" }
  - { id: S38, kind: decision, said: "getHandbrake GET /v1/machine/handbrake → { paused, reason?, since? }; setHandbrake PUT { paused, reason? }, amy pause and resume for every workflow: 200 { paused, reason?, since? }; writes stop switch and event log" }
  - { id: S39, kind: decision, said: "getWorkflowDiagram GET /v1/workflows/{profile}/diagram → { text (workflow.mmd), revision (digest), editable (only under ~/.amy/workflows) }, what amy workflow export prints; 404 workflows.not_found; 404 workflows.no_diagram for one written without a diagram" }
  - { id: S74, kind: reference, ref: "docs/design/a-workflow-is-a-mermaid-diagram.md", said: "the profile's workflow.mmd that getWorkflowDiagram returns and saveWorkflowDiagram writes" }
  - { id: S40, kind: decision, said: "saveWorkflowDiagram PUT /v1/workflows/{profile}/diagram { text, baseRevision }: reads with the host's mount subset, writes workflow.mmd, runs amy workflow check; 200 { revision, undrawn[], unwalked[] }; local-only; writes the workflow's directory" }
  - { id: S41, kind: decision, said: "saveWorkflowDiagram refuses 409 workflows.stale_revision { current }; 409 workflows.not_yours for a package; 422 workflows.diagram_refused { line, construct }" }
  - { id: S42, kind: decision, said: "and 409 workflows.state_in_use { state, records[] } when it drops a state a record is in or has an edge into under the mounted diagram" }
  - { id: S43, kind: decision, said: "and 409 workflows.removal_needs_pause dropping any state with the handbrake off: the running machine keeps its mounted diagram until restart and could move a record into the removed state" }
  - { id: S44, kind: decision, said: "removeWorkflow DELETE /v1/workflows/{profile}, what amy remove <name> does, refusing what the machine would not survive: 200 { removed }; 404 workflows.not_found; 409 workflows.removal_refused { refusals[] }; local-only; writes config.yaml" }
  - { id: S45, kind: decision, said: "getConfig GET /v1/settings/config → { text, revision (digest) }, local-only because a config names paths and channels" }
  - { id: S46, kind: decision, said: "the window draws Settings by subscribing to settings.config — an Input named text, intent saveConfig with the revision in args, last refusals as a List beneath — so no renderer builds the editor" }
  - { id: S47, kind: decision, said: "saveConfig PUT /v1/settings/config { text, baseRevision }: assembles like a boot, saves only if it mounts; 200 { revision }; 409 settings.stale_revision { current }; 422 settings.would_not_mount { refusals[] }; local-only; writes config.yaml" }
  - { id: S48, kind: decision, said: "listActions GET /v1/actions → every mounted ui-action { action, title, appliesTo, argsSchema, writes[], localOnly }; a local-only action is listed only on the socket" }
  - { id: S49, kind: decision, said: "runAction POST /v1/actions/{action} { target: { profile, workId? }, args }: args checked against the action's schema at run time, the envelope typed; 200 { outcome }; 404 actions.not_found; 422 actions.args_invalid { errors }" }
  - { id: S50, kind: decision, said: "args are untyped in the SDK by design: a plugin installed after a client was built has no type; a local-only action is not routed over TCP; it writes what it declared, refused at boot otherwise" }
  - { id: S51, kind: decision, said: "listHarnesses GET /v1/asks/harnesses: the harness collection. startAsk POST /v1/asks { about?: { profile, workId }, harness } → 201 { askId, cwd } (worktree or base snapshot); 422 asks.harness_unknown; writes the ask's file" }
  - { id: S52, kind: decision, said: "listAsks GET /v1/asks?limit=, newest first: { askId, about?, harness, title, updatedAt }" }
  - { id: S53, kind: decision, said: "getAsk GET /v1/asks/{askId} → { askId, about?, turns[{ turnId, at, from: person | agent, harness, text, cost? }] }; 404 asks.not_found" }
  - { id: S54, kind: decision, said: "addAskTurn POST /v1/asks/{askId}/turns { text, harness? } → 202 { turnId }; answer as ask.answered or ask.failed on the asking session's stream; 404 asks.not_found; 409 asks.budget_parked; writes ask file, event log" }
  - { id: S55, kind: decision, said: "addAskTurn reaches no mutating port" }
  - { id: S56, kind: decision, said: "getThread GET /v1/threads/{profile}/{workId} → { conversation: string | null, loopStale, waitingOnOwner, transcript[{ at, from: operator | amy, author, text, kind? }] } via the port's transcript; 404 threads.work_not_found" }
  - { id: S57, kind: decision, said: "addThreadTurn POST /v1/threads/{profile}/{workId}/turns { text, kind: discussion | decision } via the port's submit → 202 { at }; 503 threads.no_conversation; writes the work's thread" }
  - { id: S58, kind: decision, said: "addThreadTurn refuses 409 threads.loop_stale while the running loop mounted another conversation, and 409 threads.not_waiting when nothing waits on the owner" }
  - { id: S59, kind: decision, said: "searchTickets GET /v1/grooming/tickets?profile=&query=, the tracker searched read-only: { id, title, url, status }[]" }
  - { id: S60, kind: decision, said: "startGrooming POST /v1/grooming/sessions { profile, ticketId } → 201 { groomingId, briefId }; 422 grooming.no_brief_phase; writes the brief through the brief port" }
  - { id: S61, kind: decision, said: "getGrooming GET /v1/grooming/sessions/{groomingId} → { briefId, revision, green, sections[{ name, text, refusals[] }], transcript[] }; 404 grooming.not_found" }
  - { id: S62, kind: decision, said: "addGroomingTurn POST /v1/grooming/sessions/{groomingId}/turns { text } → 202 { turnId }; next question and reran check arrive through grooming.detail; writes the brief, never the tracker" }
  - { id: S63, kind: decision, said: "receiveGitHubEvent POST /v1/events/github, verified by X-Hub-Signature-256 against the configured secret before reading: 202 once translated and queued; 401 events.bad_signature; 204 for an event no mounted workflow names; writes queue, event log" }
  - { id: S64, kind: decision, said: "receiveLinearEvent POST /v1/events/linear, verified by Linear-Signature (HMAC-SHA256 of the raw body); same answers and writes as GitHub's" }
  - { id: S65, kind: decision, said: "listEventSources GET /v1/events/sources: per mounted source, whether events arrive, when the last did, and the polling cadence behind it — what amy doctor prints" }
  - { id: S66, kind: decision, said: "listOpeners GET /v1/workplace/{profile}/{workId}/openers → mounted, runnable openers { name, title }[]; a remote client is offered none needing the host" }
  - { id: S67, kind: decision, said: "runOpener POST /v1/workplace/{profile}/{workId}/openers/{opener} starts code, cursor, claude or $EDITOR in the checkout: 204; 404 workplace.opener_not_found; 409 workplace.no_checkout; local-only" }
  - { id: S68, kind: decision, said: "openShell POST /v1/workplace/{profile}/{workId}/shells { cols, rows } → 201 { shellId }; output as shell.output only on the X-Amy-Session session's stream; needs @amykit/ui-shell mounted; local-only" }
  - { id: S69, kind: decision, said: "writeShell POST /v1/workplace/shells/{shellId}/input { data }: 204, 404 workplace.shell_not_found; resizeShell PUT /v1/workplace/shells/{shellId}/size { cols, rows }: 204; closeShell DELETE /v1/workplace/shells/{shellId}: 204; all local-only" }
  - { id: S70, kind: decision, said: "every streamSession event is a named schema in the document's oneOf and carries id for resuming" }
  - { id: S71, kind: decision, said: "views events: view.snapshot { subscriptionId, revision, tree }; view.patch { subscriptionId, fromRevision, toRevision, patches[] }; view.closed { subscriptionId, reason }" }
  - { id: S72, kind: decision, said: "session events: settings.changed { keymap, theme } when config.yaml moved; heartbeat { at }" }
  - { id: S73, kind: decision, said: "asks: ask.answered / ask.failed { askId, turnId, text | reason, harness, cost? }; workplace: shell.output { shellId, data } / shell.exited { shellId, code }" }
touches:
  - packages/server/surface.yaml
  - packages/server/tests/surface.test.ts
  - .software-factory/policy.yaml
  - .software-factory/mutations/**
untouched:
  - packages/ui/src/vocabulary.ts
criteria:
  - { id: A1, statement: "surface.yaml lists every operation and fixed view above, with its domain, method, path, local-only flag, writes and plan — or its params, slot, surface and plan — all planned", proof: "deferred:test:packages/server/tests/surface.test.ts", sources: [S1, S2, S8, S9, S10, S11, S12, S15, S16, S17, S18, S19, S20, S21, S22, S23, S24, S25, S26, S27, S28, S29, S30, S31, S32, S33, S36, S37, S38, S39, S40, S41, S42, S43, S44, S45, S46, S47, S48, S49, S50, S51, S52, S53, S54, S55, S56, S57, S58, S59, S60, S61, S62, S63, S64, S65, S66, S67, S69, S70, S71, S72, S73, S74] }
  - { id: A2, statement: "a delivered operation missing from the document, or one in the document the registry does not list, fails the build naming it", proof: "deferred:test:mutation fixture for the-surface-is-the-registry", sources: [S4] }
  - { id: A3, statement: "a delivered fixed view listViews does not answer, or one it answers the registry does not list, fails the build naming the view", proof: "deferred:test:mutation fixture for the-surface-is-the-registry", sources: [S5, S6] }
  - { id: A4, statement: "an operation whose local-only flag or writes differ from the registry fails the build", proof: "deferred:test:mutation fixture for the-surface-is-the-registry", sources: [S4] }
  - { id: A5, statement: "a planned entry naming a plan that is not a row of next-steps.md, or a delivered one naming no design note under docs/design/, fails the build", proof: "deferred:test:mutation fixture for the-surface-is-the-registry", sources: [S7] }
  - { id: A6, statement: "an ask's answer and a shell's output reach only the session in the request's X-Amy-Session, with two clients on one token", proof: "deferred:assertion:server.an_event_reaches_only_its_session", sources: [S13, S14, S54, S68] }
  - { id: A7, statement: "a view whose intent names an operationId the registry does not list fails the build", proof: "deferred:assertion:server.every_intent_names_an_operation", sources: [S34, S35] }
  - { id: A8, statement: "editing surface.yaml without sf lock fails the build", proof: "deferred:test:a mutation fixture for L2.GENERATED_FILES_ARE_LOCKED", sources: [S3] }
guarantee:
  - { holds: "a local-only operation or view is reached only on the local socket", not_against: "a TCP connection from 127.0.0.1, a tunnel included" }
  - { holds: "only the two webhook routes answer without amy's token", not_against: "a valid tool signature, which authenticates those two" }
cut:
  - "a database behind the server: there is none"
  - "a change to the intent vocabulary"
  - "a write to a tracker or forge from any operation"
exit: "surface.yaml holds every operation in this plan as planned, the gate is green on a server with no domains, and flipping any one entry to delivered without its controller turns the build red naming it"
---
# Every endpoint is named before it is built

Eight rows each add to the server, built on different days by people reading
only their row; without one list of every operation, paths diverge, operations
are built twice, and the document grows in the order things were needed.
