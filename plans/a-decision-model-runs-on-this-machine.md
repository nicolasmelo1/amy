---
sources:
  - { id: S1, kind: reference, ref: "plans/a-decision-is-asked-of-a-port.md", said: "opens the Decider seam and the limits each decider declares; this plan puts the first real model behind it, and that model is local" }
  - { id: S2, kind: decision, said: "the first question answered is reply-kind, over somebody's message in a work thread; that text should not leave the machine just to tell whether it is a question" }
  - { id: S3, kind: decision, said: "a local model costs nothing per ask and keeps working with the network down; both matter to a daemon that looks every few minutes" }
  - { id: S4, kind: reference, said: "Supersonic Labs' Julia-1 (Oct 2026): 144M-parameter encoder on mmBERT-small, Apache 2.0; takes a context, a question and 2 to 20 answers; runs on a CPU; ONNX export, demonstrated in a browser" }
  - { id: S5, kind: reference, said: "Cloudflare's Clef-flash (9B) and other Qwen-based decision models: open-weight, served by Ollama or llama.cpp's server, need a GPU-class machine for usable latency, read longer contexts, reportedly score higher on hard benchmarks" }
  - { id: S6, kind: decision, said: "two plugins implementing Decider: @amykit/plugin-decider-onnx runs an ONNX decision encoder in-process, Julia-1 first, nothing running beside amy; @amykit/plugin-decider-loopback asks a model served on 127.0.0.1" }
  - { id: S7, kind: decision, said: "loopback reads the answer's probability from the token log-probabilities of an answer constrained to the question's set; a server returning none cannot back a decider: a confidence the model never gave is what the seam avoids" }
  - { id: S8, kind: decision, said: "each plugin declares the limits the decision port asks for; loopback refuses a configured non-loopback URL, by name, at boot" }
  - { id: S9, kind: decision, said: "weights are pulled, pinned, never shipped: amy decider pull <model> downloads into ~/.amy/models/, records its sha256 in the config, refuses a disagreeing digest; nothing downloads at install or boot" }
  - { id: S10, kind: decision, said: "amy doctor says which configured decider has no weights; the ladder treats it as unreachable, so a missing model costs a fallback, not a crash" }
  - { id: S11, kind: decision, said: "the work first runs Julia-1 under onnxruntime-node with the published tokenizer, and says plainly if it does not run" }
  - { id: S12, kind: decision, said: "Ollama and llama.cpp's server differ in whether and how they return log-probabilities; the work records a real response from each as a fixture" }
  - { id: S13, kind: reference, ref: "docs/design/nothing-is-installed-by-default.md", said: "no decider is installed by default; without the decide key in config.yaml neither plugin is ever asked anything" }
touches:
  - plugins/decider-onnx/**
  - plugins/decider-loopback/**
  - packages/cli/src/index.ts
  - packages/cli/src/doctor.ts
  - packages/cli/tests/decider.test.ts
  - .software-factory/evidence/decider-local-scenario.sh
criteria:
  - { id: A1, statement: "Julia-1's ONNX export answers a choice question under Node with the probabilities it gives in its reference implementation", proof: "unspecified:whether it runs under onnxruntime-node is the first thing the work finds", sources: [S4, S11] }
  - { id: A2, statement: "a recorded local-server response with log-probabilities becomes a verdict whose confidence is the answer's probability, and one without them is refused", proof: "unspecified:which local servers return log-probabilities is found first; the recorded fixtures are the check", sources: [S5, S7, S12] }
  - { id: A3, statement: "a loopback decider configured with a non-loopback URL is refused at boot naming it", proof: "deferred:test:plugins/decider-loopback/tests/plugin.test.ts", sources: [S1, S8] }
  - { id: A4, statement: "amy decider pull refuses weights whose digest disagrees with the config, and amy doctor names a configured decider with none", proof: "deferred:test:packages/cli/tests/decider.test.ts", sources: [S9, S10] }
  - { id: A5, statement: "with the network off, the reply-kind ladder on a local model reads a question as a discussion and an instruction as a decision, and the record names the model", proof: "deferred:scenario:decider-local", sources: [S1, S2, S3, S6, S13] }
guarantee:
  - { holds: "no decider is installed by default; without the decide key neither plugin is asked anything", not_against: "an install that configures decide" }
failures:
  - { step: Julia-1 under onnxruntime-node, when: "it does not run there", goes_to: "the in-process plugin waits; the loopback one ships alone" }
  - { step: local-server probabilities, when: "a server returns no log-probabilities", goes_to: "it cannot back a decider; refused" }
  - { step: amy decider pull, when: "the file's digest disagrees with the config", goes_to: "the file is refused" }
  - { step: decider weights, when: "a configured decider has no weights", goes_to: "doctor names it; the ladder treats it as unreachable and falls back" }
cut:
  - "a hosted (non-loopback) decider: another plan's business, with its own rules"
  - "downloading weights at install or at boot, or shipping them"
exit: "with the network off, a work-thread reply \"why do you think that?\" reads as a discussion and \"go with option B\" as a decision, by a model on the machine; the record says which model and how sure it was"
---
# A decision model runs on this machine

The first decision amy asks is whether a work-thread message is a question. That text should not leave the machine to find out, and a local model is free per ask and works offline.
