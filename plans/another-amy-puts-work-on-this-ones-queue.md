---
base: 1cdf02d36b1442092f7d199250f5c9a6b0af14f0
sources:
  - { id: S1, kind: decision, said: "amy runs on several of the operator's own machines, never another person's; an event from one amy puts work on another amy's queue. Decided 2026-11-12" }
  - { id: S2, kind: decision, said: "during a state a workflow reaches another amy the way it runs an amy command, and the work enters that amy as an event; its server takes work in and sends it out. Decided 2026-11-12" }
  - { id: S3, kind: decision, said: "sending comes after the server plans; Tailscale is one network amy may run over, never one it needs. Decided 2026-11-12" }
  - { id: S4, kind: reference, ref: "plans/the-window-is-served.md", said: "each install has its own key pair; connecting to an unpaired server is the pairing its owner approves once; every paired connection is mutually authenticated and encrypted" }
  - { id: S5, kind: reference, ref: "plans/the-window-is-served.md", said: "a paired device reads; acting is granted apart; whatever runs an agent is never offered to one, whatever it was granted" }
  - { id: S6, kind: reference, ref: "plans/the-window-is-served.md", said: "a mounted plugin's operations are routes on the server and entries in GET /v1/contract, with no file in packages/server edited" }
  - { id: S7, kind: code, ref: "plugins/command/src/plugin.ts", said: "plugin-command mounts the commands port and the run-command action, and runs only what its allow list names; a workflow passes arguments, never the line" }
  - { id: S8, kind: code, ref: "examples/workflow-errand/src/plugin.ts", symbol: "captureTask", said: "errand.capture-task writes a task and enqueues it, declares writes: [queue], and answers POST /errand/tasks" }
  - { id: S9, kind: reference, ref: "plans/a-person-unblocks-a-proof-from-anywhere.md", said: "tailscale serve shares a port with the tailnet's devices only; funnel is the public one" }
  - { id: S10, kind: reference, ref: "plans/outside-text-reaches-the-agent-as-data.md", said: "text the operator did not write reaches a prompt inside one closed envelope" }
  - { id: S11, kind: decision, said: "a send names a peer and an operation from that peer's allow list in the sender's config; the peer runs it only when it writes only the queue and its owner granted that machine send-work. Proposed 2026-11-12" }
  - { id: S12, kind: decision, said: "a send is signed with the sender's install key over the body, the peer, a nonce and a time; the receiver refuses a nonce it has seen or a time five minutes off. Proposed 2026-11-12" }
  - { id: S13, kind: decision, said: "peer.sent, peer.received and peer.refused name both machines; peer.received is published, so a workflow's [*] edge may name it. Proposed 2026-11-12" }
  - { id: S14, kind: decision, said: "a send that cannot reach its peer waits and retries on the policy's backoff, charging no attempt. Proposed 2026-11-12" }
touches:
  - packages/core/src/ports/Peers.ts
  - packages/core/src/index.ts
  - packages/core/tests/ports.test.ts
  - packages/core/events.json
  - packages/core/tests/event-contract.test.ts
  - plugins/peers/package.json
  - plugins/peers/tsconfig.json
  - plugins/peers/README.md
  - plugins/peers/src/index.ts
  - plugins/peers/src/plugin.ts
  - plugins/peers/src/config.ts
  - plugins/peers/src/PeerClient.ts
  - plugins/peers/src/receive.ts
  - plugins/peers/tests/PeerClient.test.ts
  - plugins/peers/tests/receive.test.ts
  - plugins/peers/tests/peers.property.test.ts
  - plugins/peers/tests/plugin.test.ts
  - registry/plugin-peers.json
  - docs/reference/plugins.md
  - docs/concepts/events.md
  - docs/start/security.md
  - tsconfig.json
  - tsconfig.tests.json
  - vitest.config.ts
  - package-lock.json
  - .software-factory/policy.yaml
  - .software-factory/evidence/peers-scenario.sh
criteria:
  - { id: A1, statement: "the send-to-peer action posts an allowed operation and its input to a named peer; a peer or operation its allow list does not name is refused before any request", proof: "deferred:test:plugins/peers/tests/PeerClient.test.ts", sources: [S2, S7, S11] }
  - { id: A2, statement: "a signed send from a machine granted send-work, of an operation that writes only the queue, enqueues on the named profile exactly as that operation's command would", proof: "deferred:test:plugins/peers/tests/receive.test.ts", sources: [S1, S6, S8, S11] }
  - { id: A3, statement: "for any send that is unpaired, not granted send-work, badly signed, replayed, five minutes off, for an unknown profile or an operation writing more than the queue, nothing is enqueued and peer.refused says why", proof: "deferred:property:plugins/peers/tests/peers.property.test.ts#refusal_still_enqueues", sources: [S4, S5, S11, S12] }
  - { id: A4, statement: "for any send delivered more than once, the work is enqueued once", proof: "deferred:property:plugins/peers/tests/peers.property.test.ts#replay_enqueues_twice", sources: [S12] }
  - { id: A5, statement: "an operation that runs an agent is never run for a peer, whatever it was granted", proof: "deferred:test:plugins/peers/tests/receive.test.ts", sources: [S5, S11] }
  - { id: A6, statement: "work a peer sends is stored naming the machine it came from, never as the operator's own words, so a prompt built from it can fence it", proof: "deferred:test:plugins/peers/tests/receive.test.ts", sources: [S1, S10] }
  - { id: A7, statement: "a send to an unreachable peer leaves its record waiting, retries on the policy's backoff and charges no attempt", proof: "deferred:test:plugins/peers/tests/PeerClient.test.ts", sources: [S3, S14] }
  - { id: A8, statement: "peer.sent, peer.received and peer.refused are accepted by the event contract and name both machines", proof: "deferred:test:packages/core/tests/event-contract.test.ts", sources: [S13] }
  - { id: A9, statement: "the peers port is a core port the send-to-peer action reaches, and a workflow emitting it with no peers plugin mounted is refused at boot", proof: "deferred:test:packages/core/tests/ports.test.ts", sources: [S2, S7] }
  - { id: A10, statement: "two amy homes on one machine, paired over loopback: a task one sends lands on the other's errand queue naming its sender; an unpaired third's identical send is refused", proof: "deferred:assertion:peers.a_paired_amy_puts_work_on_the_queue", sources: [S1, S2, S3, S4, S9] }
crosses:
  - { mechanism: tracker-and-host-writes, answer: works, proof: "deferred:A9; the new port writes only another amy's queue, through an operation that writes nothing else; no tracker or code-host write is added" }
  - { mechanism: queue-and-store, answer: works, proof: "deferred:A2, A4" }
  - { mechanism: events-and-notifications, answer: works, proof: "deferred:test:packages/core/tests/event-contract.test.ts" }
guarantee:
  - { holds: "only a machine its owner paired and granted send-work puts work on this amy's queue, and only through an operation that writes nothing else", not_against: "the owner pairing a machine somebody else runs" }
  - { holds: "one send is one piece of work, however often it is delivered", not_against: "a sender that sends the same work twice under two nonces" }
  - { holds: "a peer never runs an agent because another amy asked", not_against: "the work it queued, which its own workflow then runs as any other" }
failures:
  - { step: send, when: "the peer is unreachable or answers 5xx", goes_to: "the record waits and retries on the backoff; no attempt charged" }
  - { step: receive, when: "any check of A3 fails", goes_to: "refused with peer.refused; nothing enqueued" }
cut:
  - "another person's amy as a peer: refused (S1)"
  - "Tailscale funnel or any public listener for peers: refused (S9)"
  - "a peer reading or acting on another's records: the window's pairing grants that, not this"
exit: "two of the operator's machines paired as peers: a state on one sends a task to the other's errand profile, which queues it and logs who sent it; an unpaired machine's identical send is refused and queues nothing"
---
# Another amy puts work on this one's queue

The operator runs amy on more than one machine, and none of them can hand work
to another. Once the server plans pair machines, a workflow can send one
operation that writes only the queue to a named peer, signed and allow-listed.
The peer queues it as an event naming the sender, or refuses it.
