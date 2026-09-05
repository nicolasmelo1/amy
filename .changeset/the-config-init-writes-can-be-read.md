---
"@amykit/cli": patch
---

The config `amy init` writes is one this build can read, and it names every
setting there is.

Two failures, both shipped, both caught by the same check.

The loud one: the template carried `agent:` twice. YAML refuses a duplicate key
rather than merging it, so `amy init` wrote a file `loadConfig` threw on and
the next command anybody ran died. No test had ever parsed the template — only
the roster beside it.

The quiet one: `pollBackoffMs` was configurable for its whole life and appeared
nowhere, so the only way to find it was to read the source. `staleClaimMs`,
`maxItemAttempts`, `maxDraftAttempts` and the whole `errands` block were the
same. A setting nobody can discover is a setting that does not exist, and the
cost lands on whoever concludes the machine cannot do what it does.

`checkConfigTemplate` now parses the template, refuses a key nothing reads, and
refuses a setting the template never names. Named is enough — a setting
commented out with the reason is documented. It runs in the gate and in CI, and
`L2.DERIVED_ARTIFACTS_MATCH_THEIR_SOURCE` points at it: the template is derived
from the settings the loader merges over, by hand, which is why it drifted
twice without anybody noticing.
