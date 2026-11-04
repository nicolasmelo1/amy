#!/bin/sh
# The `plugin-telegram` gate's scenario, as a repeatable run.
#
# Usage: plugin-telegram-scenario.sh [report-path] [--keep]
#
# Builds and installs the executable, then drives `ticket-to-qa` with the
# Telegram plugin as its conversation: two tickets ask in their own topics of
# the operator's private chat with a stand-in bot, the operator answers one,
# and a later process moves that ticket and no other. Telegram's Bot API is
# answered by a stand-in held to the vendored contract; nothing reaches the
# internet and no credential is real.
#
# A harness, not the actor. Who invokes it is what the manifest records.
set -eu

here=$(cd "$(dirname "$0")" && pwd)
repo=$(cd "$here/../.." && pwd)

report=${1:-"$repo/.software-factory/evidence/plugin-telegram-run.json"}
case "$report" in
  --keep) report="$repo/.software-factory/evidence/plugin-telegram-run.json" ;;
  /*) ;;
  *) report="$PWD/$report" ;;
esac

keep=""
for argument in "$@"; do
  if [ "$argument" = "--keep" ]; then keep="--keep"; fi
done

for built in packages/core/dist/index.js plugins/telegram/dist/index.js packages/workflow-ticket-to-qa/dist/index.js; do
  test -f "$repo/$built" || { echo "build it first: npm run build" >&2; exit 1; }
done

# One root for the whole run, the install's library inside it: the installer
# puts its library beside the bin directory's parent, which for a bare
# mktemp -d is the shared temporary directory every other run uses.
root=$(mktemp -d)
bin="$root/bin"
mkdir -p "$bin"
pids="$root/trackers.pid"
cleanup() {
  trap - EXIT INT TERM
  if [ -f "$pids" ]; then
    while read -r pid; do kill "$pid" 2>/dev/null || true; done < "$pids"
  fi
  rm -rf "$root"
}
trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM

AMY_INSTALL_LIB="$root/lib/amy" "$repo/scripts/install.sh" "$bin" >/dev/null
test -x "$bin/amy" || { echo "the installer produced no command" >&2; exit 1; }

AMY_E2E_PIDFILE="$pids" AMY_E2E_TARBALLS="$root/lib/amy/packages" \
  "$repo/node_modules/.bin/tsx" "$here/plugin-telegram/drive.ts" "$repo" "$bin/amy" "$report" $keep
