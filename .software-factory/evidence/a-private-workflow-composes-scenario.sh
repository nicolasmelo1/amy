#!/bin/sh
# The `a-private-workflow-composes` gate's scenario, as a repeatable run.
#
# Usage: a-private-workflow-composes-scenario.sh [report-path] [--keep]
#
# Builds and installs the executable, then proves each gap the plan closed
# where its claim lives: the built GitHub adapter through the stand-in `gh`,
# the core's Git against real repositories, the built queue and mount, and
# the installed amy walking a ticket that grows into a second repository to
# QA with every tracker and code-host write handed to an operator.
#
# A harness, not the actor. Who invokes it is what the manifest records.
set -eu

here=$(cd "$(dirname "$0")" && pwd)
repo=$(cd "$here/../.." && pwd)

report=${1:-"$repo/.software-factory/evidence/a-private-workflow-composes-run.json"}
case "$report" in
  --keep) report="$repo/.software-factory/evidence/a-private-workflow-composes-run.json" ;;
  /*) ;;
  *) report="$PWD/$report" ;;
esac

keep=""
for argument in "$@"; do
  if [ "$argument" = "--keep" ]; then keep="--keep"; fi
done

for built in packages/core/dist/index.js plugins/github/dist/index.js plugins/file-queue/dist/index.js \
  plugins/serial-engine/dist/index.js packages/workflow-ticket-to-qa/dist/index.js; do
  test -f "$repo/$built" || { echo "build it first: npm run build" >&2; exit 1; }
done

bin=$(mktemp -d)
pids="$bin/trackers.pid"
cleanup() {
  trap - EXIT INT TERM
  if [ -f "$pids" ]; then
    while read -r pid; do kill "$pid" 2>/dev/null || true; done < "$pids"
  fi
  rm -rf "$bin"
}
trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM

"$repo/scripts/install.sh" "$bin" >/dev/null
test -x "$bin/amy" || { echo "the installer produced no command" >&2; exit 1; }

AMY_E2E_PIDFILE="$pids" AMY_E2E_TARBALLS="$bin/../lib/amy/packages" \
  node "$here/a-private-workflow-composes/drive.mjs" "$repo" "$bin/amy" "$report" $keep
