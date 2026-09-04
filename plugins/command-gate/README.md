# @amy/plugin-command-gate

The deterministic check, as a list of shell commands run in the ticket's own
checkout.

Mounts the `gate` port. Nothing reaches a pull request until this is green,
and its output is kept **verbatim**, because it becomes the agent's retry
context: the words the check used are the words the agent needs.

## It stops at the first failure

Not to save time. Collecting every failure hands the agent a wall of noise
where the second half is caused by the first, and one clear thing to fix is
worth more than ten symptoms.

## It refuses a repository it has no commands for

Reporting green because nothing was configured would let anything through
unchecked, which is the opposite of what a gate is. A repository with no entry
and no `default` is a finding, not a pass.

## Settings

| Setting | Default | |
| :-- | :-- | :-- |
| `commands` | required | the checks per repository, with a `default` fallback |
| `timeoutMs` | 30 min | how long one check may run |

Commands are written as shell command lines, because that is how a
repository's own contributor docs write them.
