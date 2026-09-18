#!/bin/sh
set -eu
here=$(cd "$(dirname "$0")" && pwd)
repo=$(cd "$here/../.." && pwd)
report=${1:-"$repo/.software-factory/evidence/feature-grooming-run.json"}
npm run build >/dev/null
node "$here/feature-grooming/drive.mjs" "$repo" "$report"
node -e 'const r=require(process.argv[1]); if (r.status !== "passed" || r.assertions.some((a) => a.status !== "passed")) process.exit(1)' "$report"
