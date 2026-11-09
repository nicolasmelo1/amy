---
sources:
  - { id: S1, kind: friction, said: "2026-11-09: a proof that needs a person for a captcha, a login or a password waits until they are back at the computer. amy should send a link they open on the phone, exposing nothing to the internet" }
  - { id: S2, kind: code, ref: "plugins/prove/src/scenario.ts", said: "a human step is an ask and a deadline; it is answered in words, in the work's thread" }
  - { id: S3, kind: reference, ref: "docs/design/a-phase-is-proven-not-asserted.md", said: "a human step keeps its run's leases while it waits, asks in the work's thread, and the notifier names the step and the resources held; its deadline escalates and releases them" }
  - { id: S4, kind: reference, ref: "https://agent-browser.dev/streaming", said: "agent-browser streams the viewport over a WebSocket (frame, url, status) and accepts input_mouse, input_keyboard and input_touch; the stream has no authentication, and a browser client must load from localhost or file://, other origins get a 403" }
  - { id: S5, kind: reference, ref: "https://tailscale.com/kb/1312/serve", said: "tailscale serve shares a local port with the devices of the tailnet only, over HTTPS on the machine's ts.net name, and carries Tailscale identity headers; funnel is the public one" }
  - { id: S6, kind: decision, said: "the stream never leaves the machine as it is: a small amy relay on localhost is the only client of agent-browser's stream, and the page the person opens talks to the relay, never to the stream. Proposed 2026-11-09" }
  - { id: S7, kind: decision, said: "the relay is reachable only through the tailnet (tailscale serve, never funnel), with a one-time token bound to the human step, while that step waits. An answer, a passed deadline or a second device closes it. Proposed 2026-11-09" }
  - { id: S8, kind: decision, said: "a secret the person types goes into the streamed page and nowhere else: not the thread, the event log or the agent's prompt. The relay records that input happened, never what was typed. Proposed 2026-11-09" }
  - { id: S9, kind: decision, said: "the person ends the session with a decision, done or cannot, from the page or the thread; a done resumes the step and the proof reads the world again rather than trusting the word. Proposed 2026-11-09" }
touches:
  - plugins/remote-hand/**
  - plugins/prove/src/decide.ts
  - plugins/prove/src/steps.ts
  - plugins/prove/src/scenario.ts
  - plugins/prove/tests/human-step.test.ts
  - plugins/prove/tests/remote-hand.test.ts
  - plugins/agent-browser/src/plugin.ts
  - plugins/agent-browser/tests/stream.test.ts
  - docs/build/prove-a-phase.md
criteria:
  - { id: A1, statement: "a human step marked remote posts a link in the work's thread; opening it on another tailnet device shows the streamed page and a tap reaches the browser as input", proof: "deferred:test:plugins/prove/tests/remote-hand.test.ts", sources: [S1, S2, S4, S6] }
  - { id: A2, statement: "the relay refuses a request without the step's token, a second device presenting a used token, and any request after the step was answered or its deadline passed", proof: "deferred:test:plugins/prove/tests/remote-hand.test.ts", sources: [S7] }
  - { id: A3, statement: "the relay listens on localhost only and refuses to start when the tailnet share it was given is a funnel", proof: "deferred:test:plugins/prove/tests/remote-hand.test.ts", sources: [S5, S7] }
  - { id: A4, statement: "keys typed through the page appear in no thread message, event, log line or agent prompt; the event log says that input happened and how long the session lasted", proof: "deferred:test:plugins/prove/tests/remote-hand.test.ts", sources: [S8] }
  - { id: A5, statement: "done from the page resumes the step, which reads the world again; a world that still differs asks again within the first deadline", proof: "deferred:test:plugins/prove/tests/human-step.test.ts", sources: [S3, S9] }
crosses:
  - { mechanism: checkouts-and-leases, answer: n/a, why: "the human step already holds its leases while it waits (S3); a remote session is that wait, so no lease changes" }
  - { mechanism: events-and-notifications, answer: works, proof: "deferred:A4" }
guarantee:
  - { holds: "nothing a proof streams is reachable from outside the person's tailnet, and only by the holder of the step's one-time token while the step waits", not_against: "a device on the tailnet that the person no longer controls; the tailnet's own access rules are the boundary" }
  - { holds: "a secret typed in a remote session is never written by amy", not_against: "the site itself, the browser profile agent-browser keeps, or a screenshot the scenario takes after the login" }
  - { holds: "a remote done is checked against the world before the proof moves on", not_against: "a world the scenario has no read for" }
failures:
  - { step: remote session, when: "tailscale is not installed or not logged in", goes_to: "the human step asks in words as it does today, saying why no link was sent" }
  - { step: remote session, when: "the deadline passes with the session open", goes_to: "the session closes, the proof escalates and releases its leases, as a human step does today" }
cut:
  - "a public link (funnel, ngrok, a cloud relay): refused, nothing is exposed to the internet (S7)"
  - "sending the password through the chat for amy to type: refused (S8)"
  - "remote control of a desktop app or a terminal: later; the browser is the case that blocks, and agent-desktop and terminal-use have no stream to relay"
  - "a password manager integration: its own plan, if the same login keeps being asked"
exit: "a proof stops on a captcha and Telegram carries a link; away from the computer, the person solves it on the phone over the tailnet and taps done. The proof reads the page again; the link stops opening"
---
# A person unblocks a proof from anywhere

Some steps only a person can do: a captcha, a login, a second factor. Today
a proof asks in words and waits until the person is back at the computer.
Here amy sends a link that opens only inside their private network, shows the
browser the proof drives, and lets them tap and type into it from the phone.
The secret goes into the page, never the chat, and the link dies with the step.
