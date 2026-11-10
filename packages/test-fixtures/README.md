# @amykit/test-fixtures

Shared builders, scripted doubles and vendored contracts for the suites in this
repository. Not published.

Every adapter that leaves the process goes through `CommandRunner` or
`GraphQLClient`, so each one is tested against a scripted answer rather than
the real `gh`, `claude`, `git` or API.

## What it exports

- **Builders:** `ticket`, `pullRequest`, `review`, `thread`, `roster`,
  `observation`, `record` and fixed dates such as `WORKDAY`.
- **Fakes:** `InMemoryStore`, `fakeTracker`, `fakeHost`, `fakeAgent`,
  `fakeGit`, `fakeGate`, `fakeWorkspace`, recording notifiers and event logs.
- **Scripted doubles:** `ScriptedRunner` and `ScriptedGraphQL`.
- **A mounted ticket-to-qa:** `mountTicketToQa` and `ticketWorkerDeps`.
- **Contracts:** `assertValidGhInvocation` and `assertValidGhAnswer`,
  `assertValidSlackCall`, `assertValidBotApiCall` and their answers, checked
  against the descriptions vendored in [`contracts/`](contracts/). A double
  that answers in a shape the real service never sends fails here.
- **Coverage of a port:** `unexercisedMethods`, which names the public
  methods of an adapter no test calls. Why: [no port method ships
  unproven](../../docs/design/no-port-method-ships-unproven.md).

## Prefer a fixture shaped from a real answer

`ScriptedGraphQL` and `ScriptedRunner` return whatever you tell them, which
makes it easy to write a test that passes against a shape the real service
never sends. Where a real response is available, use it, and hold the double
to the vendored contract.

## The names here are fictional on purpose

`ACME-1`, `acme/widgets`, `ada`, `grace`. A fixture naming a real colleague or
a real repository leaks into assertions, error messages and, eventually, a
report that leaves the machine. The rule is
[`fixtures-name-nobody-real`](../../.software-factory/rules/fixtures-name-nobody-real.yaml).
