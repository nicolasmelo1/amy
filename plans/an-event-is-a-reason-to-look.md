---
sources:
  - { id: S1, kind: friction, said: "amy learns by asking: discovery on a cadence, waiting states on backoff. One escalated ticket looked 25 times in two hours to read \"waiting for you\"; COPILOT_WAIT, HUMAN_REVIEW, ESCALATED poll for something that happens once" }
  - { id: S2, kind: friction, said: "a person answers and waits up to a backoff for amy to notice, and every look spends an observation against the tracker and code host for nothing" }
  - { id: S3, kind: reference, said: "GitHub sends pull_request and pull_request_review webhooks, Linear an Issue webhook on create and update, Slack message events; amy hears none" }
  - { id: S4, kind: decision, said: "an event source turns what a tool reports into a look for the work it concerns, at a priority set by the event's kind, and never adds a second look beside one that exists" }
  - { id: S5, kind: code, ref: "packages/core/src/ports/Queue.ts", said: "Queue.promote says why: two items for one work each chain a successor and the queue forks into two chains that both spend an agent" }
  - { id: S6, kind: decision, ref: "plugins/serial-engine/src/Worker.ts", said: "pending look: promote to now and reprioritize. Running look: coalesce, mark its item, and the successor Worker.advance enqueues is due at once. No look: only then enqueue one" }
  - { id: S7, kind: decision, said: "the look is ordinary: observe reads the world, pure plan() decides, one move; the payload is never the observation, since events arrive twice, out of order or late. Events change only when a look happens" }
  - { id: S8, kind: decision, said: "events are named for the port: code-host.pull-request.opened, code-host.review.submitted, code-host.thread.replied, tracker.ticket.created, tracker.ticket.updated, tracker.comment.created, conversation.reply.posted" }
  - { id: S9, kind: decision, said: "each adapter translates its tool's payload into one port event name and the work ids it concerns; the core stays vendor-neutral as THE_CORE_NAMES_NO_VENDOR holds it" }
  - { id: S10, kind: decision, ref: "packages/core/src/diagram.ts", said: "a waiting state's edge may be labelled with an event name (HUMAN_REVIEW --> HUMAN_FIX: code-host.review.submitted); the event wakes the record, plan() still picks the edge" }
  - { id: S11, kind: decision, said: "labels stay prose except one naming a published event; a dotted name nothing publishes is refused at boot; no event edge keeps its backoff; an event edge keeps a slow reconciliation backoff" }
  - { id: S12, kind: decision, ref: "packages/cli/src/doctor.ts", said: "discovery keeps running, longer cadence once a source reports events, finding what an event never reached (asleep, stopped, tunnel down); amy doctor says per source whether events arrive or it polls only" }
  - { id: S13, kind: decision, ref: "plugins/github/src/plugin.ts", said: "plugin-github receives pull_request, pull_request_review, pull_request_review_comment at POST /v1/events/github (the server speaks in domains), verified by X-Hub-Signature-256 with the webhook secret" }
  - { id: S14, kind: reference, said: "a GitHub webhook needs a public HTTPS URL, so a laptop needs a tunnel the person runs; gh webhook forward is testing-only, one person per repository, so docs offer it for trying events only" }
  - { id: S15, kind: decision, ref: "plugins/linear/src/plugin.ts", said: "plugin-linear receives Issue and Comment webhooks at POST /v1/events/linear, verified by Linear-Signature, HMAC-SHA256 of the raw body; Linear needs public non-localhost HTTPS and a workspace admin to create it" }
  - { id: S16, kind: code, ref: "plugins/slack/src/SlackApi.ts", said: "plugin-slack keeps the Web API, avoiding Socket Mode: Slack hands each event to one of an app's connections. Socket Mode becomes a setting, off by default, for an app that is amy's alone" }
  - { id: S17, kind: decision, said: "polling is itself a source: what a plugin with no events does, and the reconciliation behind every plugin that has them" }
  - { id: S18, kind: decision, ref: ".software-factory/evidence/ticket-to-qa/drive.ts", said: "scenario gains a run with amy serve on loopback (no tunnel); stand-in gh moves a PR and the scenario posts a recorded signed pull_request_review payload; the record must move before its backoff" }
  - { id: S19, kind: decision, said: "the same run posts a Linear Issue webhook for a ticket created in working status, which is picked up, and one badly signed payload, refused and changing nothing; existing event-less runs prove polling still carries everything" }
  - { id: S20, kind: decision, ref: ".software-factory/policy.yaml", said: "the ticket-to-qa gate requires the new assertions and watches the event code in plugins/github/src/** and plugins/linear/src/**" }
  - { id: S21, kind: decision, ref: "docs/build/receive-events.md", said: "Receive events under docs/build/ covers per source: what to create and which events to tick, the secret and its config.yaml place, the tunnel and checking it, what amy doctor prints either way" }
  - { id: S22, kind: decision, said: "every command on the page runs in the docs check against a recorded payload from the tool's docs, kept as a fixture beside the adapter's tests, so a misread signature or field fails the build" }
  - { id: S23, kind: reference, ref: "plans/the-server-speaks-in-domains.md", said: "webhooks arrive at the server's domain routes, POST /v1/events/github and POST /v1/events/linear" }
  - { id: S24, kind: reference, ref: "docs/design/a-workflow-is-a-mermaid-diagram.md", said: "a label is prose, with one exception this plan adds: a label naming a published event is read" }
touches:
  - plugins/serial-engine/src/Worker.ts
  - plugins/serial-engine/tests/Worker.test.ts
  - packages/core/src/ports/Queue.ts
  - packages/core/src/diagram.ts
  - packages/core/src/mount.ts
  - packages/core/tests/diagram.test.ts
  - plugins/github/src/**
  - plugins/github/tests/events.test.ts
  - plugins/linear/src/**
  - plugins/linear/tests/**
  - plugins/slack/src/config.ts
  - packages/server/src/**
  - packages/cli/src/doctor.ts
  - .software-factory/evidence/ticket-to-qa/**
  - .software-factory/policy.yaml
  - docs/build/receive-events.md
  - scripts/docs/tests/examples.test.ts
criteria:
  - { id: A1, statement: "an event becomes one queue item for the work it concerns, at its kind's priority, and the look it causes is ordinary, reading the world rather than the payload", proof: "deferred:test:plugins/serial-engine/tests/Worker.test.ts", sources: [S1, S2, S3, S4, S7] }
  - { id: A2, statement: "pending look: promoted and reprioritised, not added; running look: successor due at once; only no-look work gets an item; a duplicate or out-of-order event makes no more moves than one look", proof: "deferred:test:plugins/serial-engine/tests/Worker.test.ts", sources: [S5, S6, S7] }
  - { id: A3, statement: "a waiting state with an event edge wakes on that event without waiting for its backoff, and a dotted label nothing publishes is refused at boot", proof: "deferred:test:packages/core/tests/diagram.test.ts", sources: [S8, S10, S11, S24] }
  - { id: A4, statement: "GitHub's and Linear's recorded webhook payloads are verified by their signatures, translated into port events with the right work ids, and a bad signature is refused", proof: "deferred:test:plugins/github/tests/events.test.ts", sources: [S9, S13, S15, S23] }
  - { id: A5, statement: "with no events arriving, discovery and backoffs still find and move every piece of work, and amy doctor says the source is polling only", proof: "deferred:assertion:mine.polling_is_the_net_under_events", sources: [S12, S16, S17] }
  - { id: A6, statement: "in the ticket-to-qa scenario a signed review webhook moves its record before the backoff, a signed Linear webhook gets a new ticket picked up, a badly signed payload is refused and moves nothing", proof: "deferred:assertion:lifecycle.an_event_moves_its_record_before_the_backoff", sources: [S18, S19, S20] }
  - { id: A7, statement: "Receive events sets up each source with only what the page says, and every command on it runs in the docs check", proof: "deferred:test:scripts/docs/tests/examples.test.ts", sources: [S14, S21, S22] }
crosses:
  - { mechanism: engines, answer: works, proof: "deferred:test:plugins/serial-engine/tests/Worker.test.ts; the concurrent engine is the serial engine's Worker" }
  - { mechanism: budget-and-evidence, answer: works, proof: "deferred:A2; one chain of looks per work, so an event never makes a second chain spend an agent" }
  - { mechanism: queue-and-store, answer: works, proof: "deferred:test:plugins/serial-engine/tests/Worker.test.ts" }
  - { mechanism: tracker-and-host-writes, answer: n/a, why: "adapters only receive and translate webhooks; no write to the tracker or code host is added" }
  - { mechanism: diagram, answer: works, proof: "deferred:test:packages/core/tests/diagram.test.ts" }
  - { mechanism: mount-and-capabilities, answer: works, proof: "deferred:test:packages/core/tests/diagram.test.ts" }
  - { mechanism: events-and-notifications, answer: n/a, why: "slack keeps the Web API and only gains a Socket Mode setting, off by default; nothing logged or told changes" }
guarantee:
  - { holds: "one chain of looks per piece of work", not_against: "however many events arrive for it" }
  - { holds: "a record acts on the world observe reads", not_against: "an event payload delivered twice, out of order or late" }
  - { holds: "amy stays synchronous: one move per look, one look per item, the same claim and the same record", not_against: "events, which change only when a look happens" }
failures:
  - { step: webhook receive, when: "a bad signature", goes_to: "refused; nothing moves" }
  - { step: event delivery, when: "laptop asleep, daemon stopped or tunnel down", goes_to: "discovery and the slow backoff find the work at the polling cadence" }
cut:
  - "a new event-source plugin: not needed; the existing github, linear and slack plugins are the sources"
  - "Socket Mode by default: refused; amy would take events from whatever shares the app (S16)"
  - "gh webhook forward for running amy: refused; testing only, one person per repository (S14)"
  - "trusting an event payload as the observation: refused (S7)"
exit: "ticket-to-qa scenario: signed review and Linear webhooks move a record, pick up a ticket before any backoff (gate-required); live, reviews and working-status Linear tickets move within seconds via tunnel, polling-paced with it down; Receive events alone sets either up"
---
# An event is a reason to look

amy learns that something happened only by asking: a ticket polled 25 times in two hours to read "waiting for you" again. A person waits up to a backoff to be noticed, every look spends an observation for nothing, and the tools already announce what happens.
