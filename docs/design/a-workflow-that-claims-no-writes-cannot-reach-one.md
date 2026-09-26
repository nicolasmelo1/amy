# A workflow that claims no writes cannot reach one

A workflow now declares both sides of the external surface it may change:
`trackerWrites` and `codeHostWrites`. `CODE_HOST_WRITE_CAPABILITIES` names
opening a pull request, requesting review, resolving a thread, merging,
submitting a review and creating an issue. The code-host declaration is checked
against action bindings at boot in the same way as tracker declarations.

The mount also makes the declaration true at runtime. The context belonging to
the plugin that registered a workflow receives proxies for its tracker and
code-host ports. Reads are passed through, and an unclaimed writer rejects
before the underlying adapter is called, naming the capability and method. The
mounted ports remain whole for adapters and the serial engine; only a workflow
runtime's captured view is narrowed.

`ticket-to-qa` now declares the tracker assignment it already performs and its
code-host writes. `note-to-plan` and `errand` declare their pull-request write.
`amy doctor` prints the selected workflow's declared write surface, including a
read-only statement when both declarations are empty. Git writes remain outside
this boundary.

## Acceptance criteria

- [x] A workflow claiming no tracker writes whose own handler calls
      `tracker.comment` fails the call naming `comment`
      (proof: test:packages/core/tests/mount.test.ts)
- [x] A workflow claiming no code-host writes whose own handler calls a
      code-host write fails before the backing adapter is called
      (proof: test:packages/core/tests/mount.test.ts)
- [x] An action needing a code-host write the workflow did not claim is
      refused at boot, naming both
      (proof: test:packages/core/tests/mount.test.ts)
- [x] The capability vocabulary is derived from the core action method table
      and rejects unknown declarations on either port
      (proof: test:packages/core/tests/mount.test.ts)
- [x] `amy doctor` reports an install whose claims are both empty as read-only
      (proof: test:packages/cli/tests/doctor.test.ts)

**Exit condition:** an install whose workflow claims no tracker or code-host
writes cannot use either declared write surface, and says so before its first
tick.
