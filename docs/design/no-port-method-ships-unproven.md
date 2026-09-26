# No port method ships unproven

Delivered. The record of this decision is this document; what proves it is
the unit suite for both adapters — the argv assertion beside the other
adapter tests, and one guardrail per plugin. The plan that came before kept
the argument below; what it promised is the acceptance criteria at the end.

`reviewsRequestedOf` cannot succeed as written. The GraphQL document names
its variable `$query`:

```graphql
query ReviewRequests($query: String!) { search(query: $query, ...) }
```

(`plugins/github/src/GitHubCodeHost.ts:65`) and `GitHubCodeHost.graphql()`
passes the document as `-f query=<document>` and every variable as
`-F <name>=<value>` (`:255`). So the command line carries the field `query`
twice, and `gh` refuses before GitHub is reached:

```console
$ gh api graphql -f query='query Q($query: String!) { ... }' -F query='is:pr is:open'
unexpected override existing field under "query"
```

Renaming the variable — `$search`, anything but `query` — fixes it.

## The part worth more than the fix

The method has shipped broken for as long as it has existed, and nothing
noticed, because no shipped workflow calls it. `ticket-to-qa` counts review
load with `reviewLoad` and finds its own pull requests with
`findPullRequest`; the first consumer of `reviewsRequestedOf` was a private
workflow's discovery, in production, on a real board — and discovery failed
on the first run of the install.

**A port method no shipped workflow calls has nothing proving it works** —
not a test, not a run, not a mount. The five-method `CodeHost` interface
read as five capabilities and was four.

The workaround in the consuming workflow was `gh pr list --search`, one call
per repository and no GraphQL at all — which is its own finding, recorded as
[the forge is asked, not run beside](the-forge-is-asked-not-run-beside.md).

## What the guardrail found on arrival, and what it cannot see

Mounted, the tracker's guardrail went red on its first run, naming six
methods: `features`, `getFeature`, `groomedWork`, `createGroomedWork`,
`updateGroomedWork` and `retireGroomedWork` — the whole `FeatureTracker` half
of `LinearTracker`, which `feature-grooming` drives and nothing in the
plugin's suite called. They have tests now, in
`plugins/linear/tests/LinearTracker.features.test.ts`.

The forge's guardrail was green on arrival, and that is the honest limit of
it. `reviewsRequestedOf` *did* have adapter tests: they asserted the search
string and the mapping against the scripted runner, and the scripted runner
accepts any argv, so the collision `gh` refuses was invisible to them. A
method being called by a test is necessary and not sufficient. What caught
this defect is the argv assertion — which runs every GraphQL method the
adapter has, so the next document to name a variable `query` goes red too —
and what the guardrail adds is that no method can arrive with not even that.

The twin `changesRequestedOf` shared the same document and was broken the
same way; the rename fixes both, and the live `gh` refuses the old shape and
answers the new one:

```console
$ gh api graphql -f query='query Q($query: String!) { ... }' -F query='is:pr is:open'
unexpected override existing field under "query"
$ gh api graphql -f query='query Q($search: String!) { ... }' -F search='is:pr is:open'
{"data":{"search":{"issueCount":1}}}
```

## The doubles answer to the published contracts

The root of this defect is not the variable name. It is that the scripted
runner answered a call `gh` refuses, so a suite of green tests described a
world that does not exist. The doubles are now held to the contracts their
real counterparts publish, vendored under `packages/test-fixtures/contracts/`
by `npm run contracts:update`:

| contract | what it is | how the double holds to it |
| --- | --- | --- |
| `gh` | `gh reference` and `gh pr list --json` at the pinned release | every command and flag must exist; `gh api` fields are parsed by gh's own rules (`pkg/cmd/api/fields.go`), so a field claimed twice is refused in gh's words |
| GitHub GraphQL | the public schema, `docs.github.com/public/fpt/schema.docs.graphql` | the document validates, the variables coerce and are all declared, and the scripted answer has exactly the fields the document selected, in their types |
| GitHub REST | the OpenAPI description, `github/rest-api-description` | the path and method exist, the body carries only what the operation takes, in its types and enums, with what it requires; the answer carries no property the description does not declare |
| Linear GraphQL | the schema Linear's own SDK is generated from | as GitHub's |

A violation throws `ContractViolation` from the double, so the test goes red
naming the contract. A REST fixture may carry part of a resource — the
answer is the whole resource and a fixture carries what the adapter reads —
but never a property that does not exist; a GraphQL answer has no such
latitude, because the service answers exactly what was selected.

**Fresh is part of the contract.** `npm run check:contracts` downloads every
contract again and compares digests, and asks for `gh`'s latest release; a
contract its publisher no longer serves turns the gate and CI red until
somebody runs `npm run contracts:update` and the suite passes against the new
one.

Mounted, the contracts found two defects the adapter tests had been green
over:

- **`submitReview` could not submit.** It sent the state a review is *read*
  as — `event=APPROVED` — and the REST API takes `APPROVE`,
  `REQUEST_CHANGES` and `COMMENT`. It maps now, and refuses `DISMISSED`,
  which is not a review anyone submits.
- **A gone ticket threw instead of answering nothing.** `issue(id:)` is
  `Issue!` in Linear's schema, so a missing issue is never `null`: it is the
  error `Entity not found: Issue`. Every fixture that scripted `{ issue: null }`
  was a response Linear cannot send, and `get`, `getFeature` and every lookup
  behind them read that error as "gone" now, and every other error as a
  failure.

And one test that proved nothing: `hostFor` put its catch-all `graphql`
script ahead of the specific ones, so the by-number fixtures of the
`changesRequestedOf` tests were never the answer. The specific ones come
first now.

## What changes

- The variable is `$search`. The defect is in the argv, so the proof is an
  assertion on the argv: the scripted runner already records every call, and
  the test asserts that the document and its variables never claim the same
  field — no `-F query=` may follow a `-f query=`.
- The guardrail: every method on a port a plugin claims is exercised by
  something. A test per plugin walks the adapter's own public methods — read
  from the adapter source, not restated in a list, because a contract
  restated is a contract that can disagree — and fails naming any method
  nothing in the suite calls. A new method reaches this test red until
  something proves it; that is the property the broken method lacked.

The same guardrail mounts for the tracker, which is the other port an
install cannot run without.

The walk is one helper in `@amykit/test-fixtures` — `publicMethodsOf` reads
the class body from the adapter's source, `unexercisedMethods` answers which
of them no call in the plugin's tests reaches. A call counts when the type
checker resolves it to that method declaration on that class — a namesake on
some other object, or the name in a comment or a string, does not — so a
third plugin mounts it in a dozen lines.

## The gate

`plugins/github/tests/every-method-is-exercised.test.ts` and
`plugins/linear/tests/every-method-is-exercised.test.ts` are the guardrail;
the rename's proof lives in the existing adapter test beside the ones that
already assert argv shapes.

## Acceptance criteria

- [x] `gh` never receives a GraphQL document whose variables collide with
      the document field itself
      (proof: test:plugins/github/tests/GitHubCodeHost.test.ts)
- [x] A method on the forge port nothing exercises fails a test naming it
      (proof: test:plugins/github/tests/every-method-is-exercised.test.ts)
- [x] A method on the tracker port nothing exercises fails a test naming it
      (proof: test:plugins/linear/tests/every-method-is-exercised.test.ts)
- [x] Removing a method's only test turns the guardrail red, which is the
      property the guardrail exists for
      (proof: test:plugins/github/tests/every-method-is-exercised.test.ts)

- [x] A scripted call or answer the published contract refuses fails the
      test naming the contract
      (proof: test:packages/test-fixtures/tests/contracts.test.ts)
- [x] A contract its publisher no longer serves turns the gate red
      (proof: command:npm run check:contracts)

**Exit condition:** the interface reads as five capabilities because five
capabilities are proven, and a port method a plugin claims cannot reach a
workflow as its first consumer.