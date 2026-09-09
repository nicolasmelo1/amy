---
"@amykit/agent-kit": minor
"@amykit/cli": minor
"@amykit/plugin-agent-relay": minor
---

The settings `amy init` writes assemble into a machine that boots — and the
check that says so runs from the gate, not from a memory of a real install.

`EXAMPLE_CONFIG` shipped `claude:opus` in the default ladder and again in a
step's own. `everyLadderEntry` unions the default ladder with every per-step
one and does not dedupe, so `tiersFor` produced `["sonnet", "opus", "haiku",
"opus"]`, `contributeTiers` contributed a second agent named `claude:opus`, and
the second one met the collection's one-name rule at mount. `amy init` wrote a
config its own first `amy doctor` refused, and the workaround — deleting the
per-step ladder the template exists to teach — configured the feature out of
an install because of a missing `Set`.

The union dedupes in one place, `contributeTiers`, preserving first-seen
order: a ladder is ordered and the first mention is the one that means
something.

And the template check grows the claim it was always about: `npm run
check:config` now assembles the settings the template ships — the same `load`,
the same `pluginList`, the same `mount` a real boot runs — and refuses a
template whose machine does not start.

Nothing being installed by default, the template's `workflows:` block is a
commented example, so the check mounts the settings under the workflow that
example names: the machine the operator has one uncomment later. That is where
the ladder, the budget, the gate and the skills actually meet a `mount`, and
where the duplicate rung hid. The transcription is the one thing that can go
stale, so a template that stops offering the example it copied turns the check
red rather than leaving it mounting something nobody is offered.

The unit tests prove every direction: the shipped example mounts, the check
leaves the environment as it found it, and a template whose budget window
nothing meters, whose ladder names a harness nothing contributes, or which
renames the example out from under the transcription, turns the check red.

The relay's gate carries the proof: `relay.a_rung_named_twice_mounts_once`
mounts the template's own ladder shape against the built plugins, and
`relay.the_first_mention_sets_the_order` walks a step onto the rung its
step's ladder names first.