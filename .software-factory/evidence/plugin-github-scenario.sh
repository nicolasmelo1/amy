#!/bin/sh
# Repeatable evidence for the GitHub adapter's stack-parent contract.
set -eu

report=${1:-.software-factory/evidence/plugin-github-run.json}
repo=$(cd "$(dirname "$0")/../.." && pwd)
here=$(cd "$(dirname "$0")" && pwd)
dist="$repo/plugins/github/dist/index.js"
test -f "$dist" || { echo "build it first: npm run build" >&2; exit 1; }

"$repo/node_modules/.bin/tsx" "$here/plugin-github/probe.ts" "$repo" "$dist" "$report"
