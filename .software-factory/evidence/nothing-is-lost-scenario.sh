#!/bin/sh
# The `nothing-is-lost` gate's scenario, as a repeatable run.
#
# Usage: nothing-is-lost-scenario.sh [report-path] [--keep]
#
# Installs the executable onto a scratch machine, publishes a workflow whose
# discovery finds one ticket, and drives both: the built packages in
# processes of their own for the concurrency claims, and `amy add` +
# `amy run --max 1` for the pass that used to tick a queue it never
# discovered into.
#
# Nothing here needs a credential and nothing here reaches the internet.
#
# A harness, not the actor. Who invokes it is what the manifest's `actor`
# records, and L3.GATE_HAS_FRESH_EVIDENCE refuses a manifest that credits the
# run to the harness itself.
set -eu

here=$(cd "$(dirname "$0")" && pwd)
repo=$(cd "$here/../.." && pwd)

report=${1:-"$repo/.software-factory/evidence/nothing-is-lost-run.json"}
case "$report" in
  --keep) report="$repo/.software-factory/evidence/nothing-is-lost-run.json" ;;
  /*) ;;
  *) report="$PWD/$report" ;;
esac

keep=""
for argument in "$@"; do
  if [ "$argument" = "--keep" ]; then keep="--keep"; fi
done

# By its physical path: on macOS the temporary directory sits behind `/var`,
# and npm writes a `file:` dependency relative to whichever it was handed.
work=$(cd "$(mktemp -d)" && pwd -P)
cleanup() {
  if [ -z "$keep" ]; then rm -rf "$work"; else echo "work kept at $work" >&2; fi
}
trap cleanup EXIT INT TERM

mkdir -p "$work/bin" "$work/home"
AMY_INSTALL_LIB="$work/lib" AMY_TARBALLS="$work/tarballs" "$repo/scripts/install.sh" "$work/bin" >/dev/null
bin="$work/bin/amy"
test -x "$bin" || { echo "the installer produced no command" >&2; exit 1; }

tsx="$repo/node_modules/.bin/tsx"
"$tsx" "$here/lib/publish.ts" "$here/nothing-is-lost/finds-a-ticket" "$work/finds-a-ticket" >/dev/null
test -f "$work/finds-a-ticket/index.js" || { echo "the workflow fixture was not published" >&2; exit 1; }

export HOME="$work/home"
mkdir -p "$HOME"
cd "$HOME"

NOTHING_IS_LOST_WORKFLOW="$work/finds-a-ticket" "$tsx" "$here/nothing-is-lost/drive.ts" "$here/nothing-is-lost" "$bin" "$report" $keep
