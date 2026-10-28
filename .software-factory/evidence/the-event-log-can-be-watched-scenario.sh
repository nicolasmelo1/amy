#!/bin/sh
# The `the-event-log-can-be-watched` gate's scenario, as a repeatable run.
#
# Usage: the-event-log-can-be-watched-scenario.sh [report-path]
#
# Watches the event log through the built plugin from one process while a
# second process writes it the way the daemon does: lines just before
# midnight, a line left half-written for over a second, then the next day's
# file. The watcher is told nothing and never resubscribes.
#
# Nothing here needs a credential or reaches the internet. A harness, not the
# actor — who invokes it is what the manifest records.
set -eu

here=$(cd "$(dirname "$0")" && pwd)
repo=$(cd "$here/../.." && pwd)

report=${1:-"$repo/.software-factory/evidence/the-event-log-can-be-watched-run.json"}
case "$report" in
  /*) ;;
  *) report="$PWD/$report" ;;
esac

test -f "$repo/plugins/file-log/dist/index.js" || { echo "build it first: npm run build" >&2; exit 1; }

"$repo/node_modules/.bin/tsx" "$here/the-event-log-can-be-watched/drive.ts" "$repo" "$report"
