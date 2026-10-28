#!/bin/sh
# The `plugin-serial-engine` gate's scenario, as a repeatable run.
#
# Usage: plugin-serial-engine-scenario.sh [report-path]
#
# Mounts the *built* engine and fan-out in a separate process, over a real
# queue directory, a real record store and a real event log, with a real
# `plugin-github` talking to a fake `gh` that can be taken down between ticks.
#
# What this exists to prove only ever happens on a bad day, and it is file
# state *between ticks* that carries it: whether you were warned once or five
# times, and whether a ticket kept its place. No unit test reaches a real
# `mount()`, a fan-out with a channel that genuinely throws, or a log
# directory that genuinely cannot be written.
#
# The `gh` binary and the notification channels are the pretend parts, and
# they have to be: producing an outage on demand means producing one. The
# tracker, the agent and the gate are contributed inline because they are not
# what is under test and the real ones need credentials. The engine, the
# fan-out, the queue, the store, the log and the code host are the artifacts
# somebody would install.
#
# A harness, not the actor. Who invokes it is what the manifest's `actor`
# records, and L3.GATE_HAS_FRESH_EVIDENCE refuses a manifest that credits the
# run to the harness itself.
set -eu

report=${1:-.software-factory/evidence/plugin-serial-engine-run.json}
repo=$(cd "$(dirname "$0")/../.." && pwd)
here=$(cd "$(dirname "$0")" && pwd)

for pkg in plugins/serial-engine plugins/notify-fanout plugins/file-queue \
  plugins/file-store plugins/file-log plugins/github packages/core; do
  test -f "$repo/$pkg/dist/index.js" ||
    { echo "build it first: npm run build ($pkg)" >&2; exit 1; }
done

work=$(mktemp -d)
trap 'rm -rf "$work"' EXIT

mkdir -p "$work/bin" "$work/checkouts"

# A `gh` that is down exactly while a file exists, so the probe can take the
# code host away in the middle of a run and give it back.
cat > "$work/bin/gh" <<'FAKE'
#!/bin/sh
if [ -f "$AMY_E2E_GH_DOWN" ]; then
  echo "gh: could not connect to api.github.com" >&2
  exit 1
fi
# No pull request for this branch, which is the honest answer here: the
# scenario never gets as far as opening one.
printf '{"data":{"repository":{"pullRequests":{"nodes":[]}}}}\n'
FAKE

chmod +x "$work/bin/gh"

PATH="$work/bin:$PATH" "$repo/node_modules/.bin/tsx" "$here/plugin-serial-engine/probe.ts" "$work" "$repo" "$report"
