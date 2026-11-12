---
base: bf221baf76d544453b7538861967a258cf962222
sources:
  - { id: S1, kind: decision, said: "a run can be replayed in the browser without calling any model, carrying its proofs: videos and pictures for screen work, the calls and the contract for API work. Decided 2026-11-12" }
  - { id: S2, kind: reference, ref: "https://joydle.github.io/borg/", said: "Borg's Run section plays a scripted run in the browser and calls no model: a pipeline of steps with their tokens, a timeline of spans, a budget panel and a one-line summary" }
  - { id: S3, kind: code, ref: "plugins/prove/tests/replay.test.ts", said: "replay already names a passed agent step a later proof runs again with no harness, so watching a past run is called playback" }
  - { id: S4, kind: code, ref: "plugins/prove/src/proof.ts", symbol: "ProofRecord", said: "a proof is one record per unit in the project's artifact root" }
  - { id: S5, kind: reference, ref: "plans/a-proof-runs-against-its-own-branch.md", said: "pictures and videos a proof kept are files in the artifact root, named by its record" }
  - { id: S6, kind: reference, ref: "plans/an-api-proof-keeps-its-calls-and-its-contract.md", said: "an API proof keeps each call, redacted, and the contract's changelog" }
  - { id: S7, kind: reference, ref: "plans/a-record-is-seen-everywhere.md", said: "a visit is the time between two transitions, rebuilt from the record and the log, never stored" }
  - { id: S8, kind: reference, ref: "docs/design/the-event-log-can-be-watched.md", said: "every move, agent run and wait is a line of the event log, by work id" }
  - { id: S9, kind: reference, ref: "docs/design/a-testkit-proves-the-machine.md", said: "the testkit walks a whole workflow on fakes with no network" }
  - { id: S10, kind: decision, said: "a playback is one HTML file that loads nothing: its data, styles, script and small media inside it. Proposed 2026-11-12" }
  - { id: S11, kind: decision, said: "media up to 5 MiB each and 50 MiB in all are inlined; past that they are copied beside the page and linked relatively. Proposed 2026-11-12" }
  - { id: S12, kind: decision, said: "the repository ships one playback, of ticket-to-qa walked on fakes; a real work's playback is written on the machine only, since it carries real tickets and code. Proposed 2026-11-12" }
touches:
  - packages/cli/src/playback.ts
  - packages/cli/src/playback-page.ts
  - packages/cli/src/index.ts
  - packages/cli/tests/playback.test.ts
  - packages/cli/tests/playback.property.test.ts
  - examples/workflow-ticket-to-qa/tests/playback.test.ts
  - docs/playback/ticket-to-qa.walk.json
  - docs/playback/ticket-to-qa.html
  - docs/playback/shot.png
  - docs/playback/clip.webm
  - docs/start/see-it-run.md
  - docs/reference/cli.md
  - scripts/docs/render/playback.ts
  - scripts/docs/generate.ts
  - scripts/docs/tests/playback.test.ts
  - .software-factory/policy.yaml
  - .software-factory/evidence/playback-scenario.sh
criteria:
  - { id: A1, statement: "`amy playback <id>` writes one HTML file with the record's visits, its events (moves, agent runs with tokens, waits, escalations, answers) and its proofs, and prints the file's path", proof: "deferred:test:packages/cli/tests/playback.test.ts", sources: [S1, S4, S7, S8] }
  - { id: A2, statement: "for any record and log, the page's policy is default-src 'none' and it holds no fetch, XMLHttpRequest, WebSocket, EventSource or remote src", proof: "deferred:property:packages/cli/tests/playback.property.test.ts#a_remote_source_kept", sources: [S1, S10] }
  - { id: A3, statement: "a proof's pictures and videos are inlined within the limits and past them copied beside the page under relative links, never an absolute path", proof: "deferred:test:packages/cli/tests/playback.test.ts", sources: [S5, S11] }
  - { id: A4, statement: "an API proof's calls show as request and response as kept, redacted, with the contract's changelog when there is one", proof: "deferred:test:packages/cli/tests/playback.test.ts", sources: [S6] }
  - { id: A5, statement: "the page plays the visits in order with play, pause and a scrubber; each visit is a bar with its duration and tokens, under one summary line of moves, refused proofs, escalations and time", proof: "deferred:test:packages/cli/tests/playback.test.ts", sources: [S1, S2, S7] }
  - { id: A6, statement: "a playback asks no harness: it succeeds on a mount whose every harness throws when asked", proof: "deferred:test:packages/cli/tests/playback.test.ts", sources: [S1, S3] }
  - { id: A7, statement: "an unknown work id is refused naming it; a record with no log lines plays its history alone and says the log was absent", proof: "deferred:test:packages/cli/tests/playback.test.ts", sources: [S8] }
  - { id: A8, statement: "the ticket-to-qa walk on fakes, its proof keeping a picture, a video and a call, writes the playback walk as a golden that fails when the walk changes", proof: "deferred:test:examples/workflow-ticket-to-qa/tests/playback.test.ts", sources: [S9, S12] }
  - { id: A9, statement: "docs:generate renders the shipped playback page from that golden, and docs:check fails when the page drifts from it", proof: "deferred:test:scripts/docs/tests/playback.test.ts", sources: [S12] }
  - { id: A10, statement: "the built CLI writes a recorded work's playback in another process, and the page, opened by agent-browser with every request blocked, plays to its last visit", proof: "assertion:playback.a_page_plays_with_no_network", sources: [S1, S10] }
crosses:
  - { mechanism: status, answer: n/a, why: "playback reads the record and the log through their ports and writes a file; amy status and its page are unchanged" }
  - { mechanism: events-and-notifications, answer: n/a, why: "the log is only read; no event is added or told to anyone" }
guarantee:
  - { holds: "a playback starts no agent and loads nothing from any network", not_against: "a person who opens it and then shares it, real tickets and code included" }
  - { holds: "the shipped playback is the walkthrough's own output", not_against: "a fake proof's picture that shows nothing a real screen would" }
failures:
  - { step: playback, when: "a file a proof names is gone", goes_to: "the page shows its name and that it was missing; the rest plays" }
  - { step: playback, when: "the artifact root is not readable", goes_to: "refused naming the directory" }
cut:
  - "serving the docs as a site, GitHub Pages or other: another plan, since the page already opens from a file"
  - "uploading a playback anywhere: it is written on this machine"
exit: "amy playback on a proven ticket writes one page that, offline, plays its states, tokens and escalations and shows its video, pictures and API calls; the docs ship ticket-to-qa's"
---
# A run plays back without a model

Seeing what a piece of work went through means reading a log. This plan
writes one offline page per run: its states as a timeline with tokens and
waits, and its proofs, meaning the video, pictures and API calls. No model is
asked. The docs ship one, from ticket-to-qa walked on fakes.
