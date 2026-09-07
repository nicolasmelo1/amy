# Compatibility is a capability, not a version

Every plugin and every workflow in this workspace names the core the same way:
`"@amykit/core": "^0.2.0"`, under `dependencies` (`plugins/linear/package.json:38`,
and twenty-two more). Two things follow from that line, and neither of them was
decided.

`^0.2.0` on a pre-1.0 package means `>=0.2.0 <0.3.0`. The core is therefore
**already locked**, and locked in the worst available way: the next minor takes
every published plugin out of resolution at once, nobody argued for it, and it
is invisible until the day it happens.

And because it is `dependencies` rather than `peerDependencies`, npm is free to
install a second copy. The core is not types only — it exports `CORE_ACTIONS`,
`EVENT_KINDS`, `WORKFLOW_RUNTIME`, `Git`, `LogBudget` and `FileStopSwitch`
(`packages/core/src/index.ts`). A workflow package reading its own bundled
`CORE_ACTIONS` while the host dispatches from a different one does not get a
refusal. It gets a disagreement nothing prints, which is the one failure mode
this repository is built to make impossible, arriving through the package
manager rather than through the code.

## What a version cannot say

The three answers on offer are all bad on their own.

**Lock it** and the core stops being able to move, which is the accidental
status quo above.

**Publish a supported window** and the number has to be guessed, because
nobody knows in advance which change breaks whom. A window nobody can compute
honestly is a number authors bump on reflex, every release, forever.

**Install it and let it break** is what pi.dev does, and it is worth being
precise about because it is the closest working example. Its package and
extension documentation describes no compatibility declaration at all: no
engine field, no floor, no deprecation marking, no feature detection. The API
is additive by convention. The gap got filled from outside the core — by a
third-party API catalogue that scans an extension for members a given release
removed, by an agent that reads the changelog and proposes a migration, and by
extensions shipping hand-written runtime shims for two adjacent releases. That
is a real equilibrium, and it holds there because an extension breaks in front
of somebody who is driving the session and reading the stack trace. amy breaks
at three in the morning, unattended, on somebody's real ticket. The cost of the
failure is of another order, so the strategy cannot be the same one.

What all three have in common is treating the version as the question. It is
not. `mount()` already refuses thirteen ways by name, at boot, with every
problem reported rather than the first — `action X: nothing defines it`,
`needs the tracker port, which nothing mounted`
(`packages/core/src/mount.ts:46`, and the table in
[Plugins and the registry](../docs/concepts/plugins.md)). Those are capability
checks. The version was only ever a lossy proxy for the thing they ask
directly: **is the surface this plugin calls still there.**

## What changes

Three pieces, shipped together, because a declaration nothing reads is worse
than no declaration at all.

**One copy of the core.** `@amykit/core` moves to `peerDependencies` in every
plugin and workflow, with a `devDependencies` entry alongside so the workspace
still builds. The range widens to `>=0.2.0` — the floor, and only the floor.
`peerDependencies` is what makes the range mean something: the package manager
resolves one core and complains about a conflict instead of quietly satisfying
both. The workspace-wide half of this belongs in
`scripts/check-release-config.mjs`, which already walks every manifest for
exactly this class of quiet, late failure; its logic moves into
`packages/cli/src/manifests.ts` so it can be tested, the way `plan-board.ts`
already is.

**The core ships its surface as an artifact.** `packages/core/contracts.json`,
sitting next to `events.json` and read the same way — from disk rather than
imported, so a hash lock can watch it (`packages/core/src/event-contract.ts:38`
says why). It is generated from the same sources `npm run docs:generate`
already walks to produce the port, action, collection and plan-kind tables, so
it is not a second list to forget. It goes in the `scope` of
`L2.GENERATED_FILES_ARE_LOCKED`, which is what guarantees a reviewer sees the
diff when the contract moves.

```json
{
  "version": 1,
  "ports": { "tracker": { "methods": ["setStatus", "comment", "createFollowUp"] } },
  "actions": { "hand-off-to-qa": { "port": "tracker", "method": "setStatus" } },
  "collections": { "agent": { "read_by": "@amykit/agent-kit" } },
  "deprecated": {
    "tracker.setStatus": { "since": "0.3.0", "removedIn": "0.5.0", "use": "tracker.moveTo" }
  }
}
```

**A plugin declares what it needs, and `mount()` refuses what is gone.**

```ts
export const plugin: Plugin = {
  name: "@acme/plugin-jira",
  version: "1.2.0",
  builtAgainst: "0.2.0",
  needs: ["port:tracker.setStatus", "action:hand-off-to-qa", "event:work.advanced"],
  register(registry, ctx) { /* … */ },
};
```

Both fields are optional. A plugin that declares nothing behaves exactly as it
does today, because landing this as a break in the mechanism whose entire
purpose is not breaking would be an argument against itself. A plugin that does
declare gets the refusal it asked for, in the list that already exists:

```
amy could not start:
  @acme/plugin-jira: needs `port:tracker.setStatus`, which core 0.4.0 removed
    — the plugin was built against 0.2.0. Update it, or hold the core at 0.3.
```

`deprecated` is the other half, and it is the honest version of the window
somebody wanted. A member on its way out keeps working *and* says so at boot,
naming the release it goes in and what to use instead — a window measured in
contract entries rather than in a guess about when things break. It is a
warning, never a refusal: a plugin that works today must still start today.

## The gate

No new gate. `contracts.json` is generated and hash-locked, the refusal is a
branch in `mount()` proven by the same unit tests as its twelve siblings, and
the manifest claim is a pure function over the workspace's manifests. All three
are deterministic and cheap, which is the level they belong at — the artifact
scenarios prove that an installed machine works, and none of these three can
fail on a machine and pass in a test.

What this does buy is the precondition for a gate that is worth having, and
that gate is not in this plan.

## What this deliberately does not do

**The canary is the only mechanism here that finds a break nobody predicted**,
because it defines breaking behaviourally instead of structurally: a
third-party plugin running its own artifact scenario against
`@amykit/core@next`, and this repository running the ones whose authors opt in.
Everything above catches breaks somebody already knew about. The canary needs
`@amykit/test-fixtures` to be a supported public package first, and it is its
own row.

**`amy plugin add` reading the floor before it installs** is likewise a
separate row, and it waits on `amy add` (row 4) existing at all.

This plan makes both possible and does neither.

## Acceptance criteria

- [ ] Every published plugin and workflow names the core as a peer, and none
      names it as a dependency
      (proof: test:packages/cli/tests/manifests.test.ts)
- [ ] A manifest that would let two copies of the core resolve fails the check
      by name, before anything is published
      (proof: test:packages/cli/tests/manifests.test.ts)
- [ ] `contracts.json` regenerated from the source changes nothing
      (proof: assertion:compat.regenerating_the_contract_changes_nothing)
- [ ] Every port, action and collection the core owns appears in
      `contracts.json` exactly once
      (proof: test:packages/core/tests/contracts.test.ts)
- [ ] A plugin declaring a member the installed core still has mounts
      (proof: test:packages/core/tests/mount.test.ts)
- [ ] A plugin declaring a member the installed core removed is refused at
      boot, naming the member and the version it was built against
      (proof: test:packages/core/tests/mount.test.ts)
- [ ] That refusal arrives with the others, in one list, not first and alone
      (proof: test:packages/core/tests/mount.test.ts)
- [ ] A plugin declaring nothing mounts exactly as it does today
      (proof: test:packages/core/tests/mount.test.ts)
- [ ] A plugin using a deprecated member starts, and is told the release it
      goes in and what to use instead
      (proof: test:packages/core/tests/mount.test.ts)
- [ ] A deprecation entry naming a member the core does not have fails the
      contract's own check
      (proof: test:packages/core/tests/contracts.test.ts)
- [ ] The published core carries `contracts.json` in its `files`
      (proof: assertion:compat.the_installed_core_ships_its_contract)
- [ ] Whether a third-party plugin survives the next core is answered by
      running its own scenario against it
      (proof: deferred:the canary is its own row, and waits on test-fixtures
      being public)

**Exit condition:** a machine with a plugin built against an older core is told
at boot which member it lost and which release removed it, and a plugin that
declares nothing still starts — with one copy of the core resolved anywhere in
the install.
