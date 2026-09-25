# A workflow that claims no writes cannot reach one

Filed as #83.

A workflow's claimed tracker writes are meant to be "the only surface its
runtime may reach" (`packages/core/src/mount.ts:236`). They are not. The rule
reads `workflow.usesActions` and maps *core action names* to capabilities
through `trackerWriteFor` (`packages/core/src/ports/Ticketing.ts:331`), so it
sees `ask-question`, `escalate` and `hand-off-to-qa` and nothing else. A
workflow that registers its own handlers is handed the whole `Tracker` and the
whole `CodeHost`, and nothing stops one of those handlers calling
`tracker.comment`, `tracker.setStatus` or `host.openPullRequest` directly while
the workflow claims nothing at all.

So "this install writes nothing anyone else reads" is today a property of a
workflow's code, true for as long as whoever edits it next remembers, rather
than a property of the install. And the operator who most wants it — somebody
whose team reads the tracker and the forge and did not ask a machine to talk
there — is exactly the one who cannot see it from `amy doctor`.

## What changes

- **The code host gets the same declaration the tracker has.**
  `CODE_HOST_WRITE_CAPABILITIES` beside `TRACKER_WRITE_CAPABILITIES`:
  `open-pull-request`, `request-review`, `resolve-thread`, `merge`,
  `submit-review`, `create-issue`. `Workflow.codeHostWrites` claims them by
  hand, like `trackerWrites`, and the same boot refusal names an action that
  needs one the workflow did not claim.
- **The mount narrows the ports it hands over.** A workflow receives a tracker
  and a code host whose unclaimed write methods throw at the call, naming the
  capability. Reads are untouched. This is the half that makes the claim true
  rather than advisory: a handler written next month fails its first test
  instead of posting.
- **An empty claim is a mode with a name.** `trackerWrites: []` and
  `codeHostWrites: []` mean *read-only*, and `amy doctor` prints it, so an
  operator can see at a glance that an install cannot post anything.
- **The capability list is derived, not restated.** A test reads the write
  methods off the port interfaces and refuses one with no capability, so a new
  write method cannot arrive unclaimable.

`git push` lives on the checkout rather than the code host and is out of scope
here.

## Why it ships beside the contract change

This is a breaking change to what a workflow declares, and so is
[the workflow contract changes once](../docs/design/the-workflow-contract-changes-once.md).
The reason that plan exists is that an author should migrate once. Both land
in the same release, in adjacent pull requests, and the migration note covers
both.

## The gate

`packages/core/tests/mount.test.ts` already proves the tracker refusal at boot;
the narrowed ports and the code-host claim are proved beside it.
`packages/core/tests/ports.test.ts` holds the derivation.

## Acceptance criteria

- [ ] A workflow claiming no tracker writes whose own handler calls
      `tracker.comment` fails that call naming `comment`
      (proof: test:packages/core/tests/mount.test.ts)
- [ ] A workflow claiming no code-host writes whose own handler calls any
      code-host write fails naming the capability
      (proof: test:packages/core/tests/mount.test.ts)
- [ ] An action needing a code-host write the workflow did not claim is
      refused at boot, naming both
      (proof: test:packages/core/tests/mount.test.ts)
- [ ] A write method on either port with no capability fails a test naming it
      (proof: test:packages/core/tests/ports.test.ts)
- [ ] `amy doctor` reports an install whose claims are both empty as read-only
      (proof: test:packages/cli/tests/doctor.test.ts)

**Exit condition:** an install whose workflow claims no writes cannot write to
the tracker or the code host by any path, and says so before its first tick.
