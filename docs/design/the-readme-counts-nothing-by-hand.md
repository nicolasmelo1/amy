# The README counts nothing by hand

The front page said the project had a fixed set of commands, rules, gates,
actions and ports. Those claims were a second copy of code and policy, so they
drifted while the repository still claimed its documentation was checked.

## What changed

- `README.md` is now a generated-documentation target for its Node badge, its
  short, top-level command table, and the factory rule and gate counts. Its
  pitch remains prose.
- The table reads the Commander declarations, so a new top-level command makes
  `npm run docs:check` name the README until generation runs.
- The counts read `.software-factory/policy.yaml`; the README no longer names
  actions or ports and links to their generated references instead.
- `@amykit/cli` declares `engines.node`, which feeds the README badge, the
  workflow guide and the site manifest from one source.
- The README was reduced from 302 lines to 117 while retaining installation,
  the product argument, the command entry point and the gate.

## Proof

- `scripts/docs/tests/readme.test.ts` proves every claim is marker-delimited,
  each top-level CLI declaration renders in the README, a hypothetical new
  command renders without a handwritten row, and the Node/factory facts come
  from their owning files.
- `npm run docs:check` verifies that generated README regions, the workflow
  guide and the manifest agree with the source facts.

## Acceptance

- Every count and list on the README that comes from code or policy is between
  generated markers, and documentation drift names the README.
- Adding a top-level command changes the generated README output.
- The Node requirement is declared once in the published CLI manifest and read
  by every page that states it.
