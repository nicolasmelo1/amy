# Every plugin is proven end to end

The unit tests exercise classes. Nobody had run the thing somebody installs.

302 tests pass and every one of them imports a source file and calls a method.
That is worth having, and it is not the same claim as "the published artifact
works". A barrel that forgets an export, a `dist` that never got built, a
package whose `main` points at nothing: all of those pass the entire suite and
all of them are broken on the machine that installs them.

`sf` was built for exactly this gap, and this repository shipped L3 switched
off. A gate declares the paths that activate it and the evidence that proves
it, and `L3.GATE_HAS_FRESH_EVIDENCE` expires the proof when those paths move.
So the proof has a shelf life: change a plugin and its end-to-end run has to
happen again before the build goes green.

## What a plugin's gate is about

Not that the class behaves. That the **built artifact**, loaded from another
process, does what the plugin promises.

So each scenario imports `dist/index.js` rather than `src`, runs in a scratch
directory, and asserts the behaviour somebody depends on. The activation paths
are the plugin's own source, because changing it is exactly what should expire
the proof.

## The queue first, and why

`@amykit/plugin-file-queue` is the one the whole engine sits on: it decides what
work is claimed, and claiming the same item twice would run the same ticket
twice. It also needs nothing external, so the scenario is repeatable by anyone
without a credential, which makes it the right place to establish the pattern
the other plugins follow.

The load-bearing assertion is the second one. A queue that hands work out is
easy; a queue that hands each item out **exactly once** is the property the
engine cannot do without, and it is the one that rename-to-claim exists for.

## Acceptance criteria

- [x] The built artifact, imported from another process, gives back the item
      that was put in
      (proof: assertion:queue.claims_what_was_enqueued)
- [x] A second claim of the same item returns nothing, so two workers cannot
      run one ticket twice
      (proof: assertion:queue.refuses_a_second_claim)
- [x] An item held back is invisible until its time, which is what lets a
      waiting state back off instead of spinning
      (proof: assertion:queue.holds_an_item_until_it_is_due)
- [x] A claim abandoned by a dead worker comes back and can be claimed again,
      so a crash costs time and not the ticket
      (proof: assertion:queue.recovers_what_a_dead_worker_left)
- [x] Finished items are swept and unfinished work never is
      (proof: assertion:queue.never_prunes_unfinished_work)
- [x] The queue survives the process that created it
      (proof: assertion:queue.survives_a_restart)

**Exit condition:** every published plugin has a gate carrying a sealed
manifest whose report shows its assertions passing against the built artifact,
and touching a plugin's source turns `sf check` red until that plugin's
end-to-end run is repeated and resealed.

The queue is the first. The remaining plugins follow the same shape, and the
ones that reach a real API record a run an operator performed rather than one
CI repeats.
