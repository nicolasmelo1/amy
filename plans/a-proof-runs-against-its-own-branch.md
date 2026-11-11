---
sources:
  - { id: S1, kind: friction, said: "2026-11-10: a private project's prove/ phase must boot its API and curl it, and boot its web app against that API and photograph or film the change; amy ships none of the pieces" }
  - { id: S2, kind: reference, ref: "docs/build/prove-a-phase.md", said: "the guide's scenario and fixtures call http.get and http.post, as if a mounted plugin offered them" }
  - { id: S3, kind: code, ref: "plugins/agent-browser/src/plugin.ts", symbol: "browserOperations", said: "no plugin under plugins/ defines an http.* operation; the browser plugin offers browser.open, snapshot, act, diff-snapshot, diff-screenshot and ui-check, and nothing that keeps an image or a video" }
  - { id: S4, kind: reference, ref: "https://agent-browser.dev", said: "the agent-browser CLI has screenshot [path], record start <path> [url] and record stop (.webm or .mp4)" }
  - { id: S5, kind: code, ref: "plugins/prove/src/resources.ts", symbol: "readResource", said: "a resource is capacity, up, check and down, each a fixed command name the commands port runs; nothing about the work being proven reaches them" }
  - { id: S6, kind: decision, said: "a missing or changed plugin is forked by the workflow that needs it and then upstreamed through a plan here; the private project forks these three first. Decided 2026-11-10" }
  - { id: S7, kind: decision, said: "a resource's commands are handed the work's worktree and branch the way a gate command is, so a proof boots the code WORK produced and not the standing checkout. Proposed 2026-11-10" }
  - { id: S8, kind: decision, said: "what a screenshot or a recording keeps is written in the project's artifact root beside the proof that cites it, so amy prove show names the file. Proposed 2026-11-10" }
  - { id: S9, kind: code, ref: "plugins/prove/src/proof.ts", said: "a proof is one record per unit in the project's artifact root, with each assertion's status, the code digest and the brief revision" }
  - { id: S10, kind: friction, said: "2026-11-11: the private project's recording failed at stop: `agent-browser record stop` exited 1 with 'Recording encoder fell more than 500 ms behind capture', a webm at agent-browser's default 30 fps on a loaded machine" }
  - { id: S11, kind: reference, ref: "agent-browser record --help", said: "record start <path.webm|path.mp4> [url] [--fps <n>]: .webm is VP8, .mp4 is H.264; capture is 30 fps unless --fps says otherwise" }
  - { id: S12, kind: decision, said: "browser.record-start takes format, webm or mp4 with webm the default, and fps from 1 to 60, passed as the file's extension and --fps. Decided 2026-11-11, in the private project's fork" }
touches:
  - plugins/http/package.json
  - plugins/http/src/plugin.ts
  - plugins/http/src/index.ts
  - plugins/http/tests/plugin.test.ts
  - plugins/http/README.md
  - plugins/agent-browser/src/plugin.ts
  - plugins/agent-browser/tests/plugin.test.ts
  - plugins/agent-browser/README.md
  - plugins/prove/src/resources.ts
  - plugins/prove/src/plugin.ts
  - plugins/prove/src/proof.ts
  - plugins/prove/tests/resources.test.ts
  - plugins/prove/tests/proof.test.ts
  - docs/build/prove-a-phase.md
criteria:
  - { id: A1, statement: "http.request with a method, URL, headers and body returns status, headers and body, an assertion reads a path in the JSON body, and the guide calls an operation that exists", proof: "deferred:test:plugins/http/tests/plugin.test.ts", sources: [S1, S2, S3] }
  - { id: A2, statement: "browser.screenshot writes an image and browser.record-start and browser.record-stop write a video, each in the project's artifact root, and the step's output names the file", proof: "deferred:test:plugins/agent-browser/tests/plugin.test.ts", sources: [S1, S3, S4, S8] }
  - { id: A3, statement: "a proof whose steps kept an image or a video names each file in its record, and amy prove show prints the paths", proof: "deferred:test:plugins/prove/tests/proof.test.ts", sources: [S8, S9] }
  - { id: A4, statement: "a resource's up, check and down run with the work's worktree as their directory and its branch in the environment; two units of work on two branches lease two seats and boot two trees", proof: "deferred:test:plugins/prove/tests/resources.test.ts", sources: [S5, S6, S7] }
  - { id: A5, statement: "a resource with no work behind it, as amy prove record runs it, keeps today's fixed commands", proof: "deferred:test:plugins/prove/tests/resources.test.ts", sources: [S5] }
  - { id: A6, statement: "browser.record-start writes the container its format names, webm unless told, and passes --fps only when fps is given; a format or an fps outside webm, mp4 and 1 to 60 is refused before agent-browser runs", proof: "deferred:test:plugins/agent-browser/tests/plugin.test.ts", sources: [S10, S11, S12] }
crosses:
  - { mechanism: checkouts-and-leases, answer: works, proof: "deferred:test:plugins/prove/tests/resources.test.ts" }
  - { mechanism: mount-and-capabilities, answer: works, proof: "deferred:test:plugins/http/tests/plugin.test.ts" }
  - { mechanism: budget-and-evidence, answer: works, proof: "deferred:test:plugins/prove/tests/proof.test.ts" }
  - { mechanism: agent-replies, answer: n/a, why: "operations a scenario calls; no agent reply is read" }
guarantee:
  - { holds: "a proof runs the code the work produced, on the branch the work is on", not_against: "a resource whose own up command ignores the directory it is handed" }
  - { holds: "every picture or video a proof took is a file the proof names, beside it", not_against: "a file a person deletes from the artifact root afterwards" }
failures:
  - { step: http.request, when: "the request fails to connect or times out", goes_to: "a failed step naming the URL and the error; the assertion reading it is unsupported" }
  - { step: browser.record-stop, when: "no recording was started", goes_to: "a failed step saying so; nothing is written" }
  - { step: browser.record-stop, when: "the encoder falls behind capture", goes_to: "a failed step carrying agent-browser's message; a scenario records lighter with format mp4 or a lower fps" }
cut:
  - "a proxy, cookies jar or auth flow inside http.request: a header is what a scenario passes"
  - "portless or any port allocation inside the proving plugin: still the person's up command (docs/build/prove-a-phase.md)"
exit: "the private project drops its three forks for the published plugins, and its proofs curl the branch's API and keep a screenshot and a video of the branch's page"
---
# A proof runs against its own branch

A proof is evidence only when it runs the code the work produced. Today a
resource boots the standing checkout, the guide calls an `http.get` nothing
offers, and the browser cannot keep a picture or a video. The project that
needs all three forks them on 0.7.0; this plan brings them home.
