# A gate outlives its plan

A plan is a thing you are about to do. A gate is a thing that stays true.
Seven gates in `.software-factory/policy.yaml` name a plan as the document
their criteria live in, which welds the two together: the plan cannot be
deleted when the work is done, because deleting it takes the gate's criteria
with it and `L3.GATE_COVERS_THE_PLAN` goes red.

So `plans/` has become an archive. Nine of its entries are delivered, the
execution order in `plans/next-steps.md` reads as history rather than as work,
and the one question the directory exists to answer — *what is next* — takes
longer to answer every time something ships.

The fix is one line per gate. `sf` does not require `gates.<name>.plan` to
point inside `plans/`: it reads the criteria out of whatever path it is given.
Point it at a design note instead, and the criteria live where the decision
lives — `docs/nav.yaml` already calls that group *"the argument behind a
decision, kept where the decision can link to it"*.

## What changes

Each of the seven gated plans gets a design note under `docs/design/`,
carrying its acceptance criteria verbatim, its exit condition and the
paragraph of argument that explains why the gate asserts what it asserts.
`gates.<name>.plan` moves to that path, `sf lock` records the new policy hash,
and the plan file is deleted.

The ungated delivered plans — the roadmap, the release plan, the daemon plan,
the errand plan, the engine-drives-a-workflow plan and the parked bun plan —
are deleted outright. What they decided is already in `docs/`; what they
promised is already gated or already shipped.

`plans/next-steps.md` is rewritten to hold only unfinished work.

## The rule that keeps it that way

Nothing in `sf` can see the invariant this creates, because it is about the
absence of a path rather than the content of one. So it becomes a check of
this repository's own, next to `check:config`, which is the same shape of
claim: `npm run check:plans` refuses a `gates.*.plan` that points inside
`plans/`, and refuses a plan file the execution order does not list.

The logic lives in `packages/cli/src/plan-board.ts` and the script in
`scripts/check-plan-board.mjs` calls it, the way `check-config-template.mjs`
already calls `config-template.ts` — a check with no test is a check nobody
can trust, and only a package's `tests/` directory is on vitest's path.

From then on the handover is mechanical: work lands, its criteria move into
the design note the gate cites, the plan file goes. `L3.GATE_COVERS_THE_PLAN`
holds the assertions from that moment on, and it holds them against a document
that has no reason to be deleted.

## Acceptance criteria

- [ ] No gate names a document under `plans/`
      (proof: test:packages/cli/tests/plan-board.test.ts)
- [ ] A gate pointed back into `plans/` turns `npm run check:plans` red
      (proof: test:packages/cli/tests/plan-board.test.ts)
- [ ] A plan the execution order does not list turns it red too
      (proof: test:packages/cli/tests/plan-board.test.ts)
- [ ] Every assertion the seven gates require is still named by a criterion,
      now in the design note (proof: test:packages/cli/tests/plan-board.test.ts)
- [ ] `npm run gate` runs the check, so the board cannot rot between releases
      (proof: test:packages/cli/tests/plan-board.test.ts)
- [ ] `plans/` holds only work nobody has done yet
      (proof: unspecified:it is a property of the diff, not of a run)

**Exit condition:** `sf check` is green with every `gates.*.plan` pointing at a
document under `docs/design/`, `plans/` contains no delivered work, and
`plans/next-steps.md` read top to bottom is a list of things that have not
happened.
