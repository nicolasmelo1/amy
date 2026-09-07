# A spec is a name, a URL or a path

`amy plugin add` takes one argument and calls it a spec: *"anything Node can
import: a package name, or a path"* (`packages/cli/src/index.ts:895`). It then
writes that string into `.amy/config.yaml` and tells you to install it
yourself. Two different strings are being conflated, and the seam only shows
once amy is the thing doing the installing.

What npm takes is an **install spec**: `@acme/workflow-oncall`,
`@acme/workflow-oncall@2.1.0`, `github:acme/workflow-oncall`,
`https://example.com/workflow-oncall-2.1.0.tgz`, `./workflow-oncall`. What the
config has to name is an **import specifier** — the string the loader passes
to `import()`, which is the package's own `name`. For a plain package name the
two coincide, which is why nobody has noticed. For every other form they do
not: nothing imports `https://example.com/workflow-oncall-2.1.0.tgz`.

A relative path has a third problem on top. `.amy/config.yaml` is read from
`~/.amy` no matter where you were standing when you typed the command, so
`./workflow-oncall` written into it means a different directory to every
caller — the same class of bug `strayState` exists to refuse
(`packages/cli/src/home.ts:33`).

## What changes

One pure function, and nothing else in this PR. It takes the argument and
returns what to hand npm, what the config should name, and which of the five
kinds it was, so a caller can say something useful about each.

```ts
classify(spec: string, cwd: string): Resolved
// { kind: "name" | "range" | "git" | "tarball" | "path",
//   install: string, imported: string | undefined, absolute?: string }
```

`imported` is undefined for a git URL and a tarball, because the name is not
knowable until the package is on disk — which is the honest answer, and it is
what makes the installing command read `package.json` afterwards rather than
guess. A path is resolved against `cwd` on the way in, so what lands in the
config is absolute and means the same thing from anywhere.

## The gate

No new gate and no scenario. This is a pure function with five inputs and it
is proven by a table test, which is the cheapest deterministic check there is.
It is the precondition for `amy add`, `amy remove` and `amy update`, and it
ships alone so those three arrive with the parsing already argued about.

## Acceptance criteria

- [ ] A bare package name gives the same string to npm and to the config
      (proof: test:packages/cli/tests/spec.test.ts)
- [ ] A name carrying a range installs the range and names the package
      (proof: test:packages/cli/tests/spec.test.ts)
- [ ] A git URL and a tarball URL are classified as such, and name nothing yet
      (proof: test:packages/cli/tests/spec.test.ts)
- [ ] A relative path is resolved against the caller's directory, not amy's
      (proof: test:packages/cli/tests/spec.test.ts)
- [ ] A path that is not a package is refused by name, before anything is run
      (proof: test:packages/cli/tests/spec.test.ts)
- [ ] A Windows-shaped path is not mistaken for a scoped name
      (proof: test:packages/cli/tests/spec.test.ts)

**Exit condition:** one function turns any of the five forms into the pair
`(what npm installs, what the config names)`, and nothing else in the CLI
parses a spec.
