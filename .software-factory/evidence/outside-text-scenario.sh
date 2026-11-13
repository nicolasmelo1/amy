#!/bin/sh
# The `outside-text-reaches-the-agent-as-data` gate's scenario, as a repeatable run.
#
# Usage: outside-text-scenario.sh [report-path]
#
# Reads the built core and the built ticket-to-qa prompt builders from their
# dist in another process and hands them a ticket whose body closes the
# envelope and writes an instruction after it. Nothing here needs a
# credential or reaches the internet.
#
# A harness, not the actor. Who invokes it is what the manifest records.
set -eu

here=$(cd "$(dirname "$0")" && pwd)
repo=$(cd "$here/../.." && pwd)

report=${1:-"$repo/.software-factory/evidence/outside-text-run.json"}
case "$report" in
  /*) ;;
  *) report="$PWD/$report" ;;
esac

for built in packages/core/dist/index.js examples/workflow-ticket-to-qa/dist/agent-steps.js; do
  test -f "$repo/$built" || { echo "build it first: npm run build" >&2; exit 1; }
done

"$repo/node_modules/.bin/tsx" "$here/outside-text/drive.ts" "$repo" "$report"
