---
"@amykit/agent-kit": minor
"@amykit/cli": minor
"@amykit/plugin-agent-relay": minor
---

The config `amy init` writes boots — and the check that says so runs from the
gate, not from a memory of a real install.

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
check:config` now assembles the config `amy init` writes — the same `load`,
the same `pluginList`, the same `mount` a real boot runs — and refuses a
template whose machine does not start. The unit tests prove both directions:
the shipped example mounts, and a template whose budget window nothing meters,
or whose ladder names a harness nothing contributes, turns the check red.

The relay's gate carries the proof: `relay.a_rung_named_twice_mounts_once`
mounts the template's own ladder shape against the built plugins, and
`relay.the_first_mention_sets_the_order` walks a step onto the rung its
step's ladder names first.