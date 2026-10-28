#!/bin/sh
# The `plugin-file-queue` gate's scenario, as a repeatable run.
#
# Usage: plugin-file-queue-scenario.sh [report-path]
#
# Drives the *built* plugin from a separate process against a real directory,
# which is what the unit tests deliberately do not do: they exercise the class,
# this exercises the artifact somebody would install. Emits the report that
# .software-factory/evidence/plugin-file-queue.json cites.
#
# A harness, not the actor. Who invokes it is what the manifest's `actor`
# records, and L3.GATE_HAS_FRESH_EVIDENCE refuses a manifest that credits the
# run to the harness itself.
set -eu

report=${1:-.software-factory/evidence/plugin-file-queue-run.json}
repo=$(cd "$(dirname "$0")/../.." && pwd)
here=$(cd "$(dirname "$0")" && pwd)
dist="$repo/plugins/file-queue/dist/index.js"
test -f "$dist" || { echo "build it first: npm run build" >&2; exit 1; }

work=$(mktemp -d)
trap 'rm -rf "$work"' EXIT

"$repo/node_modules/.bin/tsx" "$here/plugin-file-queue/probe.ts" "$work" "$dist" "$report"
