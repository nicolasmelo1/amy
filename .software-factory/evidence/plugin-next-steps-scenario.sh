#!/bin/sh
# The `plugin-next-steps` gate's scenario, as a repeatable run.
#
# Usage: plugin-next-steps-scenario.sh [report-path] [--keep]
#
# Builds and installs the executable, then drives `ticket-to-qa` mounted on a
# next-steps table instead of a tracker: the first committed row walks to a
# pull request in its plan's repository, with every write handed to an
# operator and nothing written where a tracker would have been.
#
# A harness, not the actor. Who invokes it is what the manifest records.
set -eu

here=$(cd "$(dirname "$0")" && pwd)
repo=$(cd "$here/../.." && pwd)

report=${1:-"$repo/.software-factory/evidence/plugin-next-steps-run.json"}
case "$report" in
  --keep) report="$repo/.software-factory/evidence/plugin-next-steps-run.json" ;;
  /*) ;;
  *) report="$PWD/$report" ;;
esac

keep=""
for argument in "$@"; do
  if [ "$argument" = "--keep" ]; then keep="--keep"; fi
done

for built in packages/core/dist/index.js plugins/next-steps/dist/index.js packages/workflow-ticket-to-qa/dist/index.js; do
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
  "$repo/node_modules/.bin/tsx" "$here/plugin-next-steps/drive.ts" "$repo" "$bin/amy" "$report" $keep
