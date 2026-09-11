# No port method ships unproven

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

## The gate

`plugins/github/tests/every-method-is-exercised.test.ts` and
`plugins/linear/tests/every-method-is-exercised.test.ts` are the guardrail;
the rename's proof lives in the existing adapter test beside the ones that
already assert argv shapes.

## Acceptance criteria

- [ ] `gh` never receives a GraphQL document whose variables collide with
      the document field itself
      (proof: test:plugins/github/tests/GitHubCodeHost.test.ts)
- [ ] A method on the forge port nothing exercises fails a test naming it
      (proof: test:plugins/github/tests/every-method-is-exercised.test.ts)
- [ ] A method on the tracker port nothing exercises fails a test naming it
      (proof: test:plugins/linear/tests/every-method-is-exercised.test.ts)
- [ ] Removing a method's only test turns the guardrail red, which is the
      property the guardrail exists for
      (proof: test:plugins/github/tests/every-method-is-exercised.test.ts)

**Exit condition:** the interface reads as five capabilities because five
capabilities are proven, and a port method a plugin claims cannot reach a
workflow as its first consumer.