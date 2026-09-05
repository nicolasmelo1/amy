# @amykit/test-fixtures

Shared builders and scripted doubles. Not published.

Every adapter that leaves the process goes through `CommandRunner` or
`GraphQLClient`, so each one can be tested against a scripted answer rather
than the real `gh`, `claude`, `git` or API. This package holds those doubles
and the domain builders the suites share.

## Prefer a fixture shaped from a real answer

`ScriptedGraphQL` and `ScriptedRunner` will return whatever you tell them,
which makes it easy to write a test that passes against a shape the real
service never sends. Where a real response is available, use it: the GitHub
adapter's fixture is a real API answer, and that is how a stale-review bug was
caught before it shipped.

## The names here are fictional on purpose

`ACME-1`, `acme/widgets`, `ada`, `grace`. A fixture naming a real colleague or
a real repository leaks into assertions, error messages and, eventually, a
report that leaves the machine.
