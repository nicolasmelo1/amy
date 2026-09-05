---
"@amy/cli": patch
---

Documentation that cannot go out of date, and a manifest a site can be built
from.

There was one 861-line README and twenty package READMEs, and nothing checked
any of them against the code. A README is the cheapest thing in a repository to
leave behind: nothing fails when it stops being true, and the day it matters is
the day somebody is trying to write a plugin against a setting that no longer
exists.

`docs/` is now the documentation, in thirty-eight pages under eight groups, and
**half of it is read out of the code on every build**. The commands come from
the commander chain, the action catalogue and the port contracts from the
source, the event kinds from the contract the log is already validated against,
the `config.yaml` keys from the interface that defines them, the gates and
rules from the policy — including the YAML comments, which is where the reason a
rule is disabled actually lives.

The interesting one is the plugins. Nothing declares "this plugin mounts the
`tracker` port" in a manifest somebody keeps in step: **each plugin is
registered against a registry that only takes notes, and asked.** A plugin that
reads a credential at mount is handed a placeholder for exactly the variables
its own source names, for the length of one call, never over a value already in
the environment. So the reference tables say what the code does rather than what
somebody last remembered to write.

`npm run docs:check` is in `npm run gate`, and it names the file:

```
docs: the code moved and the documentation did not. These are out of date:
  docs/reference/plugins.md
  plugins/file-queue/README.md
```

Same promise `L3.GATE_HAS_FRESH_EVIDENCE` already makes about a gate's evidence.
A block a page names and nothing produces is an error, and so is a block nothing
places — a fact the documentation has and does not show is the same failure as
one that is out of date.

Every `packages/*/README.md` and `plugins/*/README.md` is generated from the
package itself and says so in a banner. The root README is not, deliberately: it
is the front door, it is argued rather than listed, and it went from 861 lines
to 278 by linking rather than repeating.

`docs/manifest.json` is one file a website reads instead of the repository — the
navigation, every page with its front matter and headings, the full reference
data, the catalogue and the news. It carries no timestamp, because a generated
file that changes every time it is generated cannot be checked for drift.

`npm run docs:changelog` caches the releases GitHub holds, so the news page
exists without the build ever needing a network. And `npm run docs:draft` — the
one part that is not deterministic and is deliberately outside the gate — has no
HTTP client of its own: it mounts amy's own harness plugins through `mount()`
and asks through the `agent` port, so a draft climbs the same ladder, under the
same ceiling, into the same log as everything else. A plugin model that only
works for the engine it was written for does not work.
