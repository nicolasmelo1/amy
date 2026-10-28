# Any decision model is a plugin

A local model is the first rung, not the only one. Some questions are hard
enough to want a bigger model behind the small one. Some machines have no GPU
for a 9B decoder. And the hosted decision models are where most of the
category is, as of October 2026:

- **OpenAI's Decisions API:** predicate, choice and score questions.
- **TypeSafe's Jev.**
- **Cloudflare's Clef and Clef-flash on Workers AI:** Jev-compatible.

*A decision is asked of a port* made the port's shape the one these share,
so every one of them is an adapter and no new seam is needed. What this plan
adds is the two things a model off the machine brings in: proof that every
adapter means the same thing by a verdict, and a rule about which text may
leave the machine at all.

## What changes

**A decider conformance suite**, in the testkit, that every `Decider` plugin
runs. It follows `docs/design/no-port-method-ships-unproven.md`. A decider:

- answers only from the question's set;
- returns probabilities that sum to one, when it returns them;
- refuses a question over its declared limits instead of truncating it;
- maps every refusal to `unsure`;
- maps a timeout, an authentication error and a network error to
  `unreachable`.

Hosted adapters run the suite against recorded responses, so it runs offline
in CI.

**Adapters, one plugin each:**

- **`@amykit/plugin-decider-openai`** for OpenAI's Decisions API. Its public
  beta refuses individual questions, and those refusals map to `unsure`.
- **`@amykit/plugin-decider-jev`** for any Jev-compatible endpoint. Pointed at
  TypeSafe, it is Jev; pointed at Workers AI's compatible endpoint, it is
  Clef. One protocol, one plugin.
- **`@amykit/plugin-decider-harness`** asks the installed harness the same
  question with the answer constrained to the set. Its confidence is
  self-reported, not a probability, which is exactly why *a threshold is
  measured, not guessed* comes first: it is measured like any other rung,
  and it is how a ladder ends on the strong model rather than on the
  fallback.

**A question says whether its context may leave the machine.** `reply-kind`
reads somebody's message, so it is declared `local`, and a ladder that puts a
hosted rung on it is refused at boot naming both. An operator can lift that
for one question in `config.yaml`. The workflow cannot lift it on the
operator's behalf.

**Hosted rungs are charged.** A hosted verdict carries the cost the provider
reported, and the budget ledger counts it like an agent run. A plugin that
cannot report a cost declares that, the way a harness declares
`pricesItsOwnRuns`, so a ceiling in money is never silently inert.

## Acceptance criteria

- [ ] Every shipped decider plugin passes the conformance suite, hosted ones
      against recorded responses (proof: deferred:test:packages/workflow-testkit/tests/decider-conformance.test.ts)
- [ ] A refusal from the Decisions API is `unsure` and the next rung is asked
      (proof: deferred:test:plugins/decider-openai/tests/decider.test.ts)
- [ ] The same Jev-compatible plugin answers from recorded TypeSafe and
      Workers AI responses (proof: deferred:test:plugins/decider-jev/tests/decider.test.ts)
- [ ] A hosted rung on a question declared `local` is refused at boot naming
      both, and accepted when the operator lifts it for that question
      (proof: deferred:test:packages/agent-kit/tests/deciders.test.ts)
- [ ] A hosted verdict's cost reaches the budget ledger
      (proof: deferred:test:packages/agent-kit/tests/deciders.test.ts)

**Exit condition:** the same question is answered by a local model, by Clef on
Workers AI and by OpenAI's Decisions API, by changing nothing but
`config.yaml`. Every one of them passes the same conformance suite, and a
question declared `local` is refused a hosted rung at boot by name.
