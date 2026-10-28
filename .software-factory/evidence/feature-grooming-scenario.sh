#!/bin/sh
set -eu
here=$(cd "$(dirname "$0")" && pwd)
repo=$(cd "$here/../.." && pwd)
report=${1:-"$repo/.software-factory/evidence/feature-grooming-run.json"}
npm run build >/dev/null
"$repo/node_modules/.bin/tsx" "$here/feature-grooming/drive.ts" "$repo" "$report"
