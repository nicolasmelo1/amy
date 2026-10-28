# A decision model runs on this machine

*A decision is asked of a port* opens the seam. This plan puts the first real
model behind it, and that model is local. The first question it answers is
`reply-kind`, and its context is somebody's message in a work thread. That
text should not leave the machine just so the machine can tell whether it is
a question. A local model also costs nothing per ask and keeps working with
the network down, and both matter to a daemon that looks every few minutes.

Two open decision models fit, as of October 2026, and they are different
enough to want different runtimes:

- **An encoder in the process.** Supersonic Labs' Julia-1 is a 144M-parameter
  encoder built on mmBERT-small, under Apache 2.0. It takes a context, a
  question and 2 to 20 answers, runs on a CPU, and is published with an ONNX
  export. Nothing has to run beside amy.
- **A decoder behind a loopback server.** Cloudflare's Clef-flash (9B) and the
  other Qwen-based decision models are open-weight and served by Ollama or
  llama.cpp's server. They need a GPU-class machine for usable latency. They
  read longer contexts and are reported to score higher on hard decision
  benchmarks.

## What changes

**Two plugins, one per runtime, both implementing `Decider`:**

- **`@amykit/plugin-decider-onnx`** runs an ONNX decision encoder in-process,
  with Julia-1 first.
- **`@amykit/plugin-decider-loopback`** asks a model served on `127.0.0.1` and
  reads the answer's probability from the token log-probabilities of an
  answer constrained to the question's set.

Each declares the limits *a decision is asked of a port* asks for. The
loopback plugin refuses a configured URL that is not loopback, by name, at
boot: a hosted decider is another plan's business and has its own rules.

**Weights are pulled, pinned and never shipped.** `amy decider pull <model>`
downloads a model into `~/.amy/models/`, records its sha256 in the config,
and refuses a file whose digest disagrees. Nothing is downloaded at install
or at boot. `amy doctor` says which configured decider has no weights, and
the ladder treats it as `unreachable`, so a missing model costs a fallback,
not a crash.

**Two things the work has to find first, and say plainly if the answer is no:**

- **Julia-1 under Node.** Its ONNX export was demonstrated in a browser. The
  work runs it under `onnxruntime-node` with the published tokenizer. If it
  does not run there, the in-process plugin waits, and the loopback one ships
  alone.
- **Probabilities from a local server.** Ollama and llama.cpp's server differ
  in whether and how they return log-probabilities. The work records a real
  response from each as a fixture. A server that returns none cannot back a
  decider: a confidence the model never gave is the thing this whole seam
  exists to avoid.

## What does not change

No decider is installed by default
(`docs/design/nothing-is-installed-by-default.md`), and without the `decide`
key in `config.yaml` neither plugin is ever asked anything.

## Acceptance criteria

- [ ] Julia-1's ONNX export answers a choice question under Node with the
      probabilities it gives in its reference implementation
      (proof: unspecified:whether it runs under onnxruntime-node is the first thing the work finds)
- [ ] A recorded local-server response with log-probabilities becomes a
      verdict whose confidence is the answer's probability, and one without
      them is refused (proof: unspecified:which local servers return log-probabilities is found first; the recorded fixtures are the check)
- [ ] A loopback decider configured with a non-loopback URL is refused at boot
      naming it (proof: deferred:test:plugins/decider-loopback/tests/plugin.test.ts)
- [ ] `amy decider pull` refuses weights whose digest disagrees with the
      config, and `amy doctor` names a configured decider with none
      (proof: deferred:test:packages/cli/tests/decider.test.ts)
- [ ] With the network off, the `reply-kind` ladder on a local model reads a
      question as a discussion and an instruction as a decision, and the
      record names the model (proof: deferred:scenario:decider-local)

**Exit condition:** with the network off, a reply asking "why do you think
that?" in the work thread is read as a discussion and "go with option B" as a
decision, by a model on the machine, and the record says which model and how
sure it was.
