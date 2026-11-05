---
"@amykit/cli": patch
---

The declaration the `amy-workflow` skill shows declares `policy.maxAttempts`
in its `configSchema`, with the same default its policy reads. Before, it left
the schema empty, and the mount refuses a policy key the schema does not
declare, so a workflow copied from the skill did not boot.
