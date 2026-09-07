# The config `amy init` writes must boot

`EXAMPLE_CONFIG` ships this:

```yaml
agent:
  ladder: [claude:sonnet, claude:opus]
  ladderByStep:
    triage: [claude:haiku]
    implement: [claude:opus]
```

`everyLadderEntry` unions the default ladder with every per-step one and does
not dedupe (`packages/cli/src/slices.ts:153`). `tiersFor` turns that into
`["sonnet", "opus", "haiku", "opus"]`, `contributeTiers` contributes one agent
per entry named `claude:<model>` (`packages/agent-kit/src/tiers.ts:36`), and
the second `claude:opus` meets `mount.ts:197` — *"`claude:opus` is already in
the `agent` collection"*. The mount is refused.

So `amy init` writes a config that cannot boot, and the only way to make the
machine start is to delete the per-step ladder that the template is there to
teach. This was found on a real install and worked around by leaving
`implement` out, which means the feature was configured out of an install
because of a missing `Set`.

`checkConfigTemplate` exists because two template bugs had already shipped
(`packages/cli/src/config-template.ts`), and it checks that the file parses
and that it names every setting. It does not check the one thing that matters
most: that what it writes runs.

## What changes

The union dedupes, in one place, preserving first-seen order — a ladder is
ordered and the first mention is the one that means something.

And the template check grows the claim it was always about: assemble the
config `amy init` writes, against the plugins it names, and refuse a template
whose mount produces problems. `npm run check:config` already runs in
`npm run gate`, so a template that cannot boot cannot be released.

## The gate

`plugin-agent-relay`, extended — its activation covers
`packages/agent-kit/src/**`, so this expires its evidence. Add:

- `relay.a_rung_named_twice_mounts_once`
- `relay.the_first_mention_sets_the_order`

Plus `npm run check:config`, which becomes deterministic proof of the template
itself rather than of its syntax.

## Acceptance criteria

- [ ] A model named in both `ladder` and `ladderByStep` mounts one agent
      (proof: assertion:relay.a_rung_named_twice_mounts_once)
- [ ] The ladder's order is the order of first mention
      (proof: assertion:relay.the_first_mention_sets_the_order)
- [ ] The config `amy init` writes assembles with no problems
      (proof: test:packages/cli/tests/config-template.test.ts)
- [ ] A template whose config cannot mount turns `npm run check:config` red
      (proof: test:packages/cli/tests/config-template.test.ts)
- [ ] The shipped template keeps its per-step ladder, unedited
      (proof: test:packages/cli/tests/config-template.test.ts)

**Exit condition:** `amy init && amy doctor` on a machine with the packages
that template names is green, with no line deleted from the file amy wrote.
