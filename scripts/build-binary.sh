#!/bin/sh
# Builds the single executable that gets installed.
#
# Usage: build-binary.sh [outfile]
#
# Two steps and they are not interchangeable. `tsc` produces the `dist` that
# every workspace package points its `exports` at, and `bun build --compile`
# bundles from there into one file with a runtime inside it.
#
# The `--define` flags are the build's identity. They read as environment
# lookups in `packages/core/src/build.ts` and are replaced with literals here,
# so the binary knows what it is without reading anything from disk. The
# substitution is textual, which is why that file spells out
# `process.env.AMY_BUILD_VERSION` in full.
set -eu

repo=$(cd "$(dirname "$0")/.." && pwd)
out=${1:-"$repo/dist/amy"}

version=$(node -p "require('$repo/packages/cli/package.json').version")
commit=$(git -C "$repo" rev-parse --short HEAD)
at=$(date -u +%Y-%m-%dT%H:%M:%SZ)

# A dirty tree would produce a binary whose commit is a lie, and the whole
# point of the stamp is joining a log line to the code that wrote it.
if ! git -C "$repo" diff --quiet HEAD 2>/dev/null; then
  commit="$commit-dirty"
fi

echo "building amy $version+$commit"

npm --prefix "$repo" run build >/dev/null

mkdir -p "$(dirname "$out")"
bun build "$repo/packages/cli/dist/index.js" \
  --compile \
  --outfile "$out" \
  --define "process.env.AMY_BUILD_VERSION=\"$version\"" \
  --define "process.env.AMY_BUILD_COMMIT=\"$commit\"" \
  --define "process.env.AMY_BUILD_AT=\"$at\""

echo "wrote $out"
