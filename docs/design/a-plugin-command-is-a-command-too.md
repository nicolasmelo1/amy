---
base: 2ca4f36f7ec98452bc5dd13ed72b22889b1e9468
sources:
  - { id: S1, kind: friction, said: "2026-11-10: Copilot on #192: a groomed plan naming amy prove show invoice-currency --revision 0 is refused by check:plans, though the prove plugin declares that command" }
  - { id: S2, kind: code, ref: "plugins/prove/src/operations.ts", said: "an operation spells its command as cli: { words, positional, default } beside an inline input: z.object({...}); eleven operations across plugins and examples do" }
  - { id: S3, kind: code, ref: "packages/cli/src/operations/commands.ts", symbol: "register", said: "plugin commands are registered at run time from a machine's mounted contributions, each given --json; none is in the static chain check:plans reads" }
  - { id: S4, kind: code, ref: "packages/cli/src/operations/schema.ts", symbol: "flagOf", said: "an input field that is not positional is a flag, camelCase spelled kebab; a boolean also takes its --no- form" }
  - { id: S5, kind: reference, ref: "docs/design/a-plan-is-held-to-what-it-said.md", said: "a groomed plan is refused for an amy command, or an option of one, the CLI at the base does not declare, unless one of its criteria names it" }
  - { id: S6, kind: decision, said: "check:plans reads the commands plugins bring too, in a plan of its own; decided 2026-11-10" }
  - { id: S7, kind: decision, said: "operations are read from source at the base, as the CLI's own commands are: a plan is judged against the code it was groomed at, not a build or a mounted machine; groomed 2026-11-10" }
  - { id: S8, kind: decision, said: "a command any operation in the repository spells counts, mounted or not: a plan is about the repository, not one machine's config; groomed 2026-11-10" }
touches:
  - scripts/plans/contributed.ts
  - scripts/plans/tests/contributed.test.ts
  - scripts/plans/history.ts
  - scripts/plans/tests/history.test.ts
  - scripts/plans/tests/authored.test.ts
  - scripts/check-plan-board.ts
  - CONTRIBUTING.md
criteria:
  - { id: A1, statement: "a groomed plan naming `amy prove show TBO-12 --revision 3` passes check:plans: the command, its positional and its flag are what the prove operation declares at the base", proof: "test:scripts/plans/tests/authored.test.ts", sources: [S1, S2, S6], done: true }
  - { id: A2, statement: "a groomed plan naming `amy prove show TBO-12 --revison 3` is refused, naming the command and the option it does not declare", proof: "test:scripts/plans/tests/authored.test.ts", sources: [S2, S5], done: true }
  - { id: A3, statement: "a field is the flag the CLI spells: camelCase kebab, a boolean with its --no- form, and every plugin command takes --json", proof: "test:scripts/plans/tests/contributed.test.ts", sources: [S3, S4], done: true }
  - { id: A4, statement: "a group of an operation's words runs its default operation, `amy models` passing; an unknown word is refused under a group with no default, `amy prove nonexistent`, or one whose default takes no argument, `amy worktrees nonexistent`", proof: "test:scripts/plans/tests/contributed.test.ts", sources: [S2, S3], done: true }
  - { id: A5, statement: "operations are read from source at the base, found by one git grep: one the change adds is not counted, and one in a plugin no machine mounts is", proof: "test:scripts/plans/tests/history.test.ts", sources: [S7, S8], done: true }
  - { id: A6, statement: "read over the repository's own sources, the reader finds all eleven operations that spell a command, prove show, worktrees remove and roster confirm among them", proof: "test:scripts/plans/tests/contributed.test.ts", sources: [S2, S8], done: true }
crosses:
  - { mechanism: mount-and-capabilities, answer: n/a, why: "operations are read as source at the base; nothing is mounted and packages/cli/src/assemble.ts is unchanged" }
guarantee:
  - { holds: "a groomed plan's amy command, positionals and options are checked against the CLI and every plugin operation at its base", not_against: "an operation whose input is not an inline z.object, whose options pass unchecked" }
failures:
  - { step: reading, when: "an operation spells a command but its input is not an inline z.object", goes_to: "its command and positionals count and any option on it passes" }
  - { step: reading, when: "two operations spell the same words", goes_to: "both count; the CLI refuses that at mount, not this check" }
cut:
  - "reading built modules or a mounted machine's contributions: a plan is judged at its base (S7)"
  - "listing plugin commands in the generated CLI reference: the docs read built modules, and that is another plan"
exit: "a groomed plan naming `amy prove show TBO-12 --revision 3` passes check:plans, and one naming `amy prove show TBO-12 --revison 3` is refused"
---
# A plugin's command is a command too

check:plans checks a plan's `amy` commands against the CLI's own chain, so a
command a plugin brings reads as unknown. It reads every operation's command
from source at the base too.
