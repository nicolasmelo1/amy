#!/bin/sh
# The `project-phases` gate's scenario, as a repeatable run.
#
# Usage: project-phases-scenario.sh [report-path]
#
# Lays out one project as `brief/`, `workflow/` and `test/`, and mounts every
# phase through the *built* CLI assembly from a separate process, with a config
# naming the workflows, two models and two budgets, and no directory. The unit
# tests prove the pieces; this proves execution reads the brief grooming wrote.
#
# Emits the report that .software-factory/evidence/project-phases.json cites.
#
# A harness, not the actor. Who invokes it is what the manifest's `actor`
# records, and L3.GATE_HAS_FRESH_EVIDENCE refuses a manifest that credits the
# run to the harness itself.
set -eu

report=${1:-.software-factory/evidence/project-phases-run.json}
repo=$(cd "$(dirname "$0")/../.." && pwd)
here=$(cd "$(dirname "$0")" && pwd)
dist="$repo/packages/cli/dist"
test -f "$dist/assemble.js" || { echo "build it first: npm run build" >&2; exit 1; }

work=$(mktemp -d)
trap 'rm -rf "$work"' EXIT

"$repo/node_modules/.bin/tsx" "$here/project-phases/probe.ts" "$work" "$dist" "$report" "$repo"
